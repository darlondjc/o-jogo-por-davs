import { waitUntil } from '@vercel/functions';
import {
  advanceAfterQuestion,
  computeFinalScore,
  computeOverallTotals,
  computeRanking,
  computeRoundTotals,
  validateQuestionScores,
} from '../../../shared/scoring';
import type {
  Game,
  NewGame,
  NewTeam,
  RoundSummary,
  Scoreboard,
  ScoreboardEntry,
  Score,
  SubmitQuestionScoresRequest,
  Team,
} from '../../../shared/domain/types';
import { getRepositories } from '../repositories';
import { badRequest, notFound } from '../http/respond';
import { backupFinishedGameToSheets } from './backup.service';

function repos() {
  return getRepositories();
}

export async function listGames(): Promise<Game[]> {
  return repos().games.findAll();
}

export async function getGameOrThrow(id: string): Promise<Game> {
  const game = await repos().games.findById(id);
  if (!game) throw notFound(`Jogo não encontrado: ${id}`);
  return game;
}

export async function createGame(payload: NewGame): Promise<Game> {
  return repos().games.create(payload);
}

export async function updateGame(id: string, patch: Partial<Game>): Promise<Game> {
  await getGameOrThrow(id);
  return repos().games.update(id, patch);
}

export async function listTeams(gameId: string): Promise<Team[]> {
  await getGameOrThrow(gameId);
  return repos().teams.findByGameId(gameId);
}

export async function addTeam(gameId: string, payload: NewTeam): Promise<Team> {
  await getGameOrThrow(gameId);
  return repos().teams.create(gameId, payload);
}

export async function updateTeam(
  gameId: string,
  teamId: string,
  patch: Partial<Team>,
): Promise<Team> {
  await getGameOrThrow(gameId);
  return repos().teams.update(gameId, teamId, patch);
}

export async function deleteTeam(gameId: string, teamId: string): Promise<void> {
  await getGameOrThrow(gameId);
  await repos().teams.delete(gameId, teamId);
}

/** Valida os pré-requisitos da seção 8 antes de permitir iniciar o jogo. */
export async function startGame(gameId: string): Promise<Game> {
  const game = await getGameOrThrow(gameId);
  const teams = await repos().teams.findByGameId(gameId);

  if (!teams.length) throw badRequest('É necessário cadastrar ao menos uma equipe.');
  if (game.rounds <= 0) throw badRequest('Quantidade de rodadas deve ser maior que zero.');
  if (game.questionsPerRound <= 0) {
    throw badRequest('Quantidade de perguntas por rodada deve ser maior que zero.');
  }
  if (game.status === 'EM_ANDAMENTO' || game.status === 'RODADA_FINALIZADA') {
    return game; // já iniciado — idempotente
  }

  return repos().games.update(gameId, {
    status: 'EM_ANDAMENTO',
    currentRound: 1,
    currentQuestion: 1,
  });
}

export interface RegisteredQuestion {
  round: number;
  question: number;
}

export interface LiveState {
  game: Game;
  teams: Team[];
  scoreboard: Scoreboard;
  previousQuestionScores: Score[];
  lastRegistered: { round: number; question: number } | null;
  /** Perguntas já registradas no jogo, em ordem — alimenta o dialog de
   * "corrigir perguntas anteriores" (melhorias doc, seção score-entry). */
  registeredQuestions: RegisteredQuestion[];
}

export async function getLiveState(gameId: string): Promise<LiveState> {
  const game = await getGameOrThrow(gameId);
  const teams = await repos().teams.findByGameId(gameId);
  const scoreboard = await getScoreboard(gameId);
  const lastRegistered = await repos().scores.findLastRegisteredQuestion(gameId);
  const previousQuestionScores = lastRegistered
    ? await repos().scores.findByQuestion(gameId, lastRegistered.round, lastRegistered.question)
    : [];
  const registeredQuestions = (await repos().questions.findByGameId(gameId))
    .map((q) => ({ round: q.round, question: q.number }))
    .sort((a, b) => a.round - b.round || a.question - b.question);

  return { game, teams, scoreboard, previousQuestionScores, lastRegistered, registeredQuestions };
}

/** Pontuações de uma pergunta específica (não necessariamente a última) —
 * usado pelo dialog de correção de perguntas anteriores para pré-preencher
 * o formulário com o que já foi registrado. */
export async function getQuestionScores(
  gameId: string,
  round: number,
  question: number,
): Promise<Score[]> {
  await getGameOrThrow(gameId);
  return repos().scores.findByQuestion(gameId, round, question);
}

export interface SubmitScoresResult {
  game: Game;
  scores: Score[];
  roundFinished: boolean;
  gameFinished: boolean;
  roundSummary: RoundSummary | null;
}

/**
 * Registra (ou corrige, se já existir) a pontuação de uma pergunta inteira
 * para várias equipes de uma vez — o caminho idempotente central da seção 34.
 */
export async function submitQuestionScores(
  gameId: string,
  payload: SubmitQuestionScoresRequest,
): Promise<SubmitScoresResult> {
  // Duas leituras independentes — rodar em paralelo em vez de sequencial
  // economiza um round-trip inteiro ao Firestore.
  const [game, teams] = await Promise.all([
    getGameOrThrow(gameId),
    repos().teams.findByGameId(gameId),
  ]);

  const errors = validateQuestionScores({
    round: payload.round,
    question: payload.question,
    rounds: game.rounds,
    questionsPerRound: game.questionsPerRound,
    scores: payload.scores,
    knownTeamIds: teams.map((t) => t.id),
  });
  if (errors.length) throw badRequest('Lançamento inválido.', errors);

  const entries = payload.scores.map((s) => ({
    teamId: s.teamId,
    baseScore: s.baseScore,
    bonus: s.bonus,
    penalty: s.penalty,
    total: computeFinalScore(s),
  }));

  // Idem: gravar a pontuação e marcar a pergunta como registrada são
  // escritas independentes (coleções diferentes) — não precisam esperar
  // uma pela outra.
  const [scores] = await Promise.all([
    repos().scores.upsertMany(gameId, payload.round, payload.question, entries),
    repos().questions.upsertRegistered(gameId, payload.round, payload.question),
  ]);

  // Só avança o ponteiro do jogo quando a pergunta registrada é a "atual" —
  // uma correção de pergunta anterior não deve mexer no progresso.
  const isCurrentQuestion =
    payload.round === game.currentRound && payload.question === game.currentQuestion;

  if (!isCurrentQuestion) {
    return { game, scores, roundFinished: false, gameFinished: false, roundSummary: null };
  }

  const result = advanceAfterQuestion({
    round: game.currentRound,
    question: game.currentQuestion,
    rounds: game.rounds,
    questionsPerRound: game.questionsPerRound,
  });

  const newStatus = result.gameFinished
    ? 'FINALIZADO'
    : result.roundFinished
      ? 'RODADA_FINALIZADA'
      : 'EM_ANDAMENTO';

  const updatedGame = await repos().games.update(gameId, {
    currentRound: result.round,
    currentQuestion: result.question,
    status: newStatus,
  });

  const roundSummary = result.roundFinished
    ? await getRoundSummary(gameId, payload.round)
    : null;

  if (result.gameFinished) {
    // Backup é best-effort e não é o que o operador está esperando ver na
    // tela — não pode segurar a resposta (o Sheets é bem mais lento que o
    // Firestore). `waitUntil` mantém a função viva o tempo necessário pra
    // terminar o backup depois da resposta já ter sido enviada.
    waitUntil(backupFinishedGameToSheets(gameId));
  }

  return {
    game: updatedGame,
    scores,
    roundFinished: result.roundFinished,
    gameFinished: result.gameFinished,
    roundSummary,
  };
}

/** Corrige diretamente um registro de pontuação já existente (PUT /scores/:scoreId). */
export async function correctScore(
  gameId: string,
  scoreId: string,
  patch: { baseScore: number; bonus: number; penalty: number },
): Promise<Score> {
  const allScores = await repos().scores.findByGameId(gameId);
  const existing = allScores.find((s) => s.id === scoreId);
  if (!existing) throw notFound(`Pontuação não encontrada: ${scoreId}`);

  const updated = await repos().scores.upsertMany(gameId, existing.round, existing.question, [
    {
      teamId: existing.teamId,
      baseScore: patch.baseScore,
      bonus: patch.bonus,
      penalty: patch.penalty,
      total: computeFinalScore(patch),
    },
  ]);
  return updated[0];
}

/** Avança explicitamente para a próxima rodada após o resumo (seção 17). */
export async function continueToNextRound(gameId: string): Promise<Game> {
  const game = await getGameOrThrow(gameId);
  if (game.status !== 'RODADA_FINALIZADA') return game;
  return repos().games.update(gameId, { status: 'EM_ANDAMENTO' });
}

export async function finishGame(gameId: string): Promise<Game> {
  await getGameOrThrow(gameId);
  const game = await repos().games.update(gameId, { status: 'FINALIZADO' });
  // Ver comentário em `submitQuestionScores` — backup não bloqueia a resposta.
  waitUntil(backupFinishedGameToSheets(gameId));
  return game;
}

export async function getRoundSummary(gameId: string, round: number): Promise<RoundSummary> {
  const game = await getGameOrThrow(gameId);
  const allScores = await repos().scores.findByGameId(gameId);

  const roundTotals = computeRoundTotals(allScores, round);
  const overallTotals = computeOverallTotals(
    allScores.filter((s) => s.round <= round),
  );
  const previousOverallTotals = computeOverallTotals(
    allScores.filter((s) => s.round < round),
  );
  const overallRanking = computeRanking(overallTotals, previousOverallTotals);

  const winner = [...roundTotals].sort((a, b) => b.total - a.total)[0] ?? null;

  return {
    gameId: game.id,
    round,
    roundTotals,
    overallRanking,
    winnerTeamId: winner?.teamId ?? null,
  };
}

export async function getScoreboard(gameId: string): Promise<Scoreboard> {
  const game = await getGameOrThrow(gameId);
  const teams = await repos().teams.findByGameId(gameId);
  const allScores = await repos().scores.findByGameId(gameId);

  const overallTotals = computeOverallTotals(allScores);
  const previousOverallTotals = computeOverallTotals(
    allScores.filter((s) => s.round < game.currentRound),
  );
  const ranking = computeRanking(overallTotals, previousOverallTotals);
  const currentRoundTotals = computeRoundTotals(allScores, game.currentRound);

  const roundTotalsByRound: Record<number, { teamId: string; total: number }[]> = {};
  for (let r = 1; r <= game.rounds; r++) {
    roundTotalsByRound[r] = computeRoundTotals(allScores, r);
  }

  const entries: ScoreboardEntry[] = teams
    .map((team) => {
      const rankEntry = ranking.find((r) => r.teamId === team.id);
      const roundTotal = currentRoundTotals.find((r) => r.teamId === team.id)?.total ?? 0;
      return {
        teamId: team.id,
        teamName: team.name,
        order: team.order,
        roundTotal,
        overallTotal: rankEntry?.total ?? 0,
        position: rankEntry?.position ?? teams.length,
        previousPosition: rankEntry?.previousPosition ?? null,
      };
    })
    .sort((a, b) => a.position - b.position || a.teamName.localeCompare(b.teamName));

  return {
    gameId: game.id,
    status: game.status,
    currentRound: game.currentRound,
    currentQuestion: game.currentQuestion,
    rounds: game.rounds,
    questionsPerRound: game.questionsPerRound,
    entries,
    roundTotalsByRound,
  };
}
