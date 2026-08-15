/**
 * Contratos de repositório. O restante do backend (services, endpoints) só
 * conhece estas interfaces — nunca detalhes do Google Sheets. Isso permite
 * trocar a persistência (Supabase/Postgres/Firebase/etc.) sem tocar no resto
 * da aplicação (spec seção 22).
 */
import type { Game, NewGame, NewTeam, Question, Score, Team } from '../../../shared/domain/types';

export interface GameRepository {
  findAll(): Promise<Game[]>;
  findById(id: string): Promise<Game | null>;
  create(game: NewGame): Promise<Game>;
  update(id: string, patch: Partial<Game>): Promise<Game>;
  /** Opcional: o repositório do Google Sheets não implementa — ele só serve
   * de cópia de backup write-only de jogos finalizados (nunca é lido de
   * volta, ver `services/backup.service.ts`) e não é o repositório ativo em
   * produção. Quando é [modo sem Firestore configurado], `game.service.ts`
   * recusa a exclusão com um erro claro em vez de simular sucesso. */
  delete?(id: string): Promise<void>;
}

export interface TeamRepository {
  findByGameId(gameId: string): Promise<Team[]>;
  findById(gameId: string, teamId: string): Promise<Team | null>;
  create(gameId: string, team: NewTeam): Promise<Team>;
  update(gameId: string, teamId: string, patch: Partial<Team>): Promise<Team>;
  delete(gameId: string, teamId: string): Promise<void>;
}

export interface QuestionRepository {
  findByGameId(gameId: string): Promise<Question[]>;
  findOne(gameId: string, round: number, number: number): Promise<Question | null>;
  upsertRegistered(gameId: string, round: number, number: number): Promise<Question>;
}

export interface ScoreUpsertEntry {
  teamId: string;
  baseScore: number;
  bonus: number;
  penalty: number;
  total: number;
}

export interface ScoreRepository {
  findByGameId(gameId: string): Promise<Score[]>;
  findByRound(gameId: string, round: number): Promise<Score[]>;
  findByQuestion(gameId: string, round: number, question: number): Promise<Score[]>;
  /** Upsert idempotente: uma chamada repetida para a mesma pergunta substitui, não duplica. */
  upsertMany(
    gameId: string,
    round: number,
    question: number,
    entries: ScoreUpsertEntry[],
  ): Promise<Score[]>;
  findLastRegisteredQuestion(
    gameId: string,
  ): Promise<{ round: number; question: number } | null>;
}

export interface Repositories {
  games: GameRepository;
  teams: TeamRepository;
  questions: QuestionRepository;
  scores: ScoreRepository;
}
