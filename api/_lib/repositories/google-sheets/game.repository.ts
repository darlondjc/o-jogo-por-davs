import type { Game, GameStatus, GameType, NewGame } from '../../../../shared/domain/types';
import { newId, nowIso } from '../../ids';
import type { GameRepository } from '../types';
import { SheetTable } from './sheet-table';

interface GameRow extends Record<string, string> {
  id: string;
  nome: string;
  data: string;
  local: string;
  descricao: string;
  tipoJogo: string;
  quantidadeRodadas: string;
  perguntasPorRodada: string;
  status: string;
  rodadaAtual: string;
  perguntaAtual: string;
  createdAt: string;
  updatedAt: string;
}

const COLUMNS: readonly (keyof GameRow & string)[] = [
  'id',
  'nome',
  'data',
  'local',
  'descricao',
  'tipoJogo',
  'quantidadeRodadas',
  'perguntasPorRodada',
  'status',
  'rodadaAtual',
  'perguntaAtual',
  'createdAt',
  'updatedAt',
];

function toDomain(row: GameRow): Game {
  return {
    id: row.id,
    name: row.nome,
    date: row.data,
    location: row.local,
    description: row.descricao || undefined,
    gameType: (row.tipoJogo || 'POP_GERAIS') as GameType,
    rounds: Number(row.quantidadeRodadas) || 0,
    questionsPerRound: Number(row.perguntasPorRodada) || 0,
    status: (row.status || 'CONFIGURACAO') as GameStatus,
    currentRound: Number(row.rodadaAtual) || 1,
    currentQuestion: Number(row.perguntaAtual) || 1,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function toRow(game: Game): GameRow {
  return {
    id: game.id,
    nome: game.name,
    data: game.date,
    local: game.location,
    descricao: game.description ?? '',
    tipoJogo: game.gameType,
    quantidadeRodadas: String(game.rounds),
    perguntasPorRodada: String(game.questionsPerRound),
    status: game.status,
    rodadaAtual: String(game.currentRound),
    perguntaAtual: String(game.currentQuestion),
    createdAt: game.createdAt,
    updatedAt: game.updatedAt,
  };
}

export class GoogleSheetsGameRepository implements GameRepository {
  private readonly table = new SheetTable<GameRow>('jogos', COLUMNS);

  async findAll(): Promise<Game[]> {
    const rows = await this.table.readAll();
    return rows.map(toDomain).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async findById(id: string): Promise<Game | null> {
    const rows = await this.table.readAll();
    const row = rows.find((r) => r.id === id);
    return row ? toDomain(row) : null;
  }

  async create(game: NewGame): Promise<Game> {
    const now = nowIso();
    const full: Game = {
      ...game,
      id: newId(),
      status: 'CONFIGURACAO',
      currentRound: 1,
      currentQuestion: 1,
      createdAt: now,
      updatedAt: now,
    };
    await this.table.append(toRow(full));
    return full;
  }

  async update(id: string, patch: Partial<Game>): Promise<Game> {
    const current = await this.findById(id);
    if (!current) throw new Error(`Jogo não encontrado: ${id}`);
    const updated: Game = { ...current, ...patch, id, updatedAt: nowIso() };
    const result = await this.table.replaceWhere((r) => r.id === id, toRow(updated));
    if (!result) throw new Error(`Falha ao atualizar jogo: ${id}`);
    return updated;
  }

  /** Só para o backup de jogo finalizado (ver `services/backup.service.ts`):
   * grava o registro tal como veio do repositório ativo (Firestore),
   * preservando o `id` original em vez de gerar um novo. */
  async importRecord(game: Game): Promise<void> {
    await this.table.append(toRow(game));
  }
}
