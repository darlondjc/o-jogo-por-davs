/**
 * Tipos de domínio compartilhados entre a API serverless (Vercel) e o app Angular.
 * Importar sempre por caminho relativo a partir de `api/`; a partir de `src/`,
 * usar o alias `@shared/*` configurado no tsconfig.
 */

export type GameStatus =
  | 'CONFIGURACAO'
  | 'EM_ANDAMENTO'
  | 'RODADA_FINALIZADA'
  | 'FINALIZADO';

export type GameType = 'POP_GERAIS' | 'TEMATICA' | 'DECADAS';

export interface Game {
  id: string;
  name: string;
  date: string;
  location: string;
  description?: string;
  gameType: GameType;
  rounds: number;
  questionsPerRound: number;
  status: GameStatus;
  currentRound: number;
  currentQuestion: number;
  createdAt: string;
  updatedAt: string;
}

export type NewGame = Omit<
  Game,
  'id' | 'status' | 'currentRound' | 'currentQuestion' | 'createdAt' | 'updatedAt'
>;

export interface Team {
  id: string;
  gameId: string;
  name: string;
  playersCount: number;
  order: number;
  createdAt: string;
}

export type NewTeam = Omit<Team, 'id' | 'gameId' | 'order' | 'createdAt'> & {
  order?: number;
};

export type QuestionStatus = 'REGISTRADA';

export interface Question {
  id: string;
  gameId: string;
  round: number;
  number: number;
  status: QuestionStatus;
  createdAt: string;
  updatedAt: string;
}

export interface Score {
  id: string;
  gameId: string;
  teamId: string;
  round: number;
  question: number;
  baseScore: number;
  bonus: number;
  penalty: number;
  total: number;
  createdAt: string;
  updatedAt: string;
  version: number;
}

/** Payload enviado pelo admin para registrar/corrigir uma pergunta inteira. */
export interface TeamScoreInput {
  teamId: string;
  baseScore: number;
  bonus: number;
  penalty: number;
}

export interface SubmitQuestionScoresRequest {
  round: number;
  question: number;
  scores: TeamScoreInput[];
}

export interface TeamRoundTotal {
  teamId: string;
  total: number;
}

export interface RankingEntry {
  teamId: string;
  total: number;
  position: number;
  previousPosition: number | null;
}

export interface RoundSummary {
  gameId: string;
  round: number;
  roundTotals: TeamRoundTotal[];
  overallRanking: RankingEntry[];
  winnerTeamId: string | null;
  /** Pontuação de cada equipe em cada pergunta desta rodada — pra comparar
   * pergunta a pergunta quem acertou/errou (spec "Melhorias": serve de
   * "VAR" logo depois da rodada terminar). */
  questionScores: Score[];
}

export interface ScoreboardEntry {
  teamId: string;
  teamName: string;
  /** Ordem de cadastro da equipe — só pra cor de identificação visual
   * (`teamColor`), embutida aqui porque o placar público não tem acesso à
   * lista de equipes (rota sem login, spec seção 19). */
  order: number;
  roundTotal: number;
  overallTotal: number;
  position: number;
  previousPosition: number | null;
}

export interface Scoreboard {
  gameId: string;
  status: GameStatus;
  currentRound: number;
  currentQuestion: number;
  rounds: number;
  questionsPerRound: number;
  entries: ScoreboardEntry[];
  roundTotalsByRound: Record<number, TeamRoundTotal[]>;
}
