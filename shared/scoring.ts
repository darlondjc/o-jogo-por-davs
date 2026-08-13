/**
 * Regras de cálculo puras (sem I/O), usadas tanto pela API (fonte da verdade)
 * quanto testadas diretamente pelos specs do Angular. Ver spec seção 39.
 */
import type {
  RankingEntry,
  Score,
  TeamRoundTotal,
  TeamScoreInput,
} from './domain/types';

/** pontuaçãoFinal = pontuaçãoBase + bônus + penalidade */
export function computeFinalScore(input: {
  baseScore: number;
  bonus: number;
  penalty: number;
}): number {
  return input.baseScore + input.bonus + input.penalty;
}

/** Soma dos totais finais das perguntas de uma rodada específica. */
export function computeRoundTotals(
  scores: Score[],
  round: number,
): TeamRoundTotal[] {
  const totals = new Map<string, number>();
  for (const score of scores) {
    if (score.round !== round) continue;
    totals.set(score.teamId, (totals.get(score.teamId) ?? 0) + score.total);
  }
  return [...totals.entries()].map(([teamId, total]) => ({ teamId, total }));
}

/**
 * Soma de todas as pontuações finais (todas as rodadas/perguntas) por equipe.
 * `knownTeamIds`, quando informado, garante uma entrada (com total 0) pra
 * toda equipe do jogo, mesmo quem ainda não tem nenhuma pontuação lançada —
 * sem isso, uma equipe sem pontuação some do ranking em vez de empatar em
 * 1º com as outras zeradas (bug: "①"/"②" errados no placar de jogo recém-criado).
 */
export function computeOverallTotals(
  scores: Score[],
  knownTeamIds?: string[],
): TeamRoundTotal[] {
  const totals = new Map<string, number>();
  for (const teamId of knownTeamIds ?? []) {
    totals.set(teamId, 0);
  }
  for (const score of scores) {
    totals.set(score.teamId, (totals.get(score.teamId) ?? 0) + score.total);
  }
  return [...totals.entries()].map(([teamId, total]) => ({ teamId, total }));
}

/**
 * Calcula o ranking a partir dos totais gerais, aplicando desempate simples
 * (mesmo total = mesma posição) e apontando a posição anterior de cada equipe
 * quando fornecida, para permitir indicar variação (↑/↓/—) na UI.
 */
export function computeRanking(
  totals: TeamRoundTotal[],
  previousTotals?: TeamRoundTotal[],
): RankingEntry[] {
  const sorted = [...totals].sort((a, b) => b.total - a.total);

  const previousRanking = previousTotals
    ? rankOnly(previousTotals)
    : undefined;

  const ranking: RankingEntry[] = [];
  let lastTotal: number | null = null;
  let lastPosition = 0;
  sorted.forEach((entry, index) => {
    const position =
      lastTotal !== null && entry.total === lastTotal ? lastPosition : index + 1;
    lastTotal = entry.total;
    lastPosition = position;
    ranking.push({
      teamId: entry.teamId,
      total: entry.total,
      position,
      previousPosition: previousRanking?.get(entry.teamId) ?? null,
    });
  });
  return ranking;
}

function rankOnly(totals: TeamRoundTotal[]): Map<string, number> {
  const sorted = [...totals].sort((a, b) => b.total - a.total);
  const map = new Map<string, number>();
  let lastTotal: number | null = null;
  let lastPosition = 0;
  sorted.forEach((entry, index) => {
    const position =
      lastTotal !== null && entry.total === lastTotal ? lastPosition : index + 1;
    lastTotal = entry.total;
    lastPosition = position;
    map.set(entry.teamId, position);
  });
  return map;
}

/** Total de pontos distribuídos em uma pergunta (soma dos totais informados). */
// `computeDistributedTotal` removed: total distribuído não é mais exibido nem necessário

export interface AdvanceResult {
  round: number;
  question: number;
  roundFinished: boolean;
  gameFinished: boolean;
}

/**
 * Determina rodada/pergunta seguintes após registrar `question` da `round`.
 * Não sobe além da última rodada; sinaliza fim de rodada e fim de jogo.
 */
export function advanceAfterQuestion(params: {
  round: number;
  question: number;
  rounds: number;
  questionsPerRound: number;
}): AdvanceResult {
  const { round, question, rounds, questionsPerRound } = params;

  if (question < questionsPerRound) {
    return { round, question: question + 1, roundFinished: false, gameFinished: false };
  }

  if (round < rounds) {
    return { round: round + 1, question: 1, roundFinished: true, gameFinished: false };
  }

  return { round, question, roundFinished: true, gameFinished: true };
}

export interface ScoreValidationError {
  field: string;
  message: string;
}

/** Valida o payload de lançamento de uma pergunta antes de persistir. */
export function validateQuestionScores(params: {
  round: number;
  question: number;
  rounds: number;
  questionsPerRound: number;
  scores: TeamScoreInput[];
  knownTeamIds: string[];
}): ScoreValidationError[] {
  const errors: ScoreValidationError[] = [];
  const { round, question, rounds, questionsPerRound, scores, knownTeamIds } = params;

  if (!Number.isInteger(round) || round < 1 || round > rounds) {
    errors.push({ field: 'round', message: `Rodada inválida (1-${rounds}).` });
  }
  if (!Number.isInteger(question) || question < 1 || question > questionsPerRound) {
    errors.push({
      field: 'question',
      message: `Pergunta inválida (1-${questionsPerRound}).`,
    });
  }
  if (!scores.length) {
    errors.push({ field: 'scores', message: 'Informe ao menos uma equipe.' });
  }
  const teamSet = new Set(knownTeamIds);
  for (const entry of scores) {
    if (!teamSet.has(entry.teamId)) {
      errors.push({ field: 'scores', message: `Equipe desconhecida: ${entry.teamId}` });
    }
    for (const [field, value] of Object.entries({
      baseScore: entry.baseScore,
      bonus: entry.bonus,
      penalty: entry.penalty,
    })) {
      if (!Number.isFinite(value)) {
        errors.push({ field, message: `Valor inválido para ${field} em ${entry.teamId}.` });
      }
    }
  }
  return errors;
}
