import type { Question } from '../../../../shared/domain/types';
import { newId, nowIso } from '../../ids';
import type { QuestionRepository } from '../types';
import { SheetTable } from './sheet-table';

interface QuestionRow extends Record<string, string> {
  id: string;
  jogoId: string;
  rodada: string;
  numero: string;
  status: string;
  createdAt: string;
  updatedAt: string;
}

const COLUMNS: readonly (keyof QuestionRow & string)[] = [
  'id',
  'jogoId',
  'rodada',
  'numero',
  'status',
  'createdAt',
  'updatedAt',
];

function toDomain(row: QuestionRow): Question {
  return {
    id: row.id,
    gameId: row.jogoId,
    round: Number(row.rodada) || 0,
    number: Number(row.numero) || 0,
    status: 'REGISTRADA',
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function toRow(question: Question): QuestionRow {
  return {
    id: question.id,
    jogoId: question.gameId,
    rodada: String(question.round),
    numero: String(question.number),
    status: question.status,
    createdAt: question.createdAt,
    updatedAt: question.updatedAt,
  };
}

export class GoogleSheetsQuestionRepository implements QuestionRepository {
  private readonly table = new SheetTable<QuestionRow>('perguntas', COLUMNS);

  async findByGameId(gameId: string): Promise<Question[]> {
    const rows = await this.table.readAll();
    return rows.filter((r) => r.jogoId === gameId).map(toDomain);
  }

  async findOne(gameId: string, round: number, number: number): Promise<Question | null> {
    const rows = await this.table.readAll();
    const row = rows.find(
      (r) => r.jogoId === gameId && Number(r.rodada) === round && Number(r.numero) === number,
    );
    return row ? toDomain(row) : null;
  }

  async upsertRegistered(gameId: string, round: number, number: number): Promise<Question> {
    const existing = await this.findOne(gameId, round, number);
    const now = nowIso();
    if (existing) {
      const updated: Question = { ...existing, updatedAt: now };
      await this.table.replaceWhere((r) => r.id === existing.id, toRow(updated));
      return updated;
    }
    const created: Question = {
      id: newId(),
      gameId,
      round,
      number,
      status: 'REGISTRADA',
      createdAt: now,
      updatedAt: now,
    };
    await this.table.append(toRow(created));
    return created;
  }
}
