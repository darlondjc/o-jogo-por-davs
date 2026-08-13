import type { Score } from '../../../../shared/domain/types';
import { newId, nowIso } from '../../ids';
import type { ScoreRepository, ScoreUpsertEntry } from '../types';
import { SheetTable } from './sheet-table';

interface ScoreRow extends Record<string, string> {
  id: string;
  jogoId: string;
  equipeId: string;
  rodada: string;
  pergunta: string;
  pontuacaoBase: string;
  bonus: string;
  penalidade: string;
  pontuacaoFinal: string;
  createdAt: string;
  updatedAt: string;
  version: string;
}

const COLUMNS: readonly (keyof ScoreRow & string)[] = [
  'id',
  'jogoId',
  'equipeId',
  'rodada',
  'pergunta',
  'pontuacaoBase',
  'bonus',
  'penalidade',
  'pontuacaoFinal',
  'createdAt',
  'updatedAt',
  'version',
];

function toDomain(row: ScoreRow): Score {
  return {
    id: row.id,
    gameId: row.jogoId,
    teamId: row.equipeId,
    round: Number(row.rodada) || 0,
    question: Number(row.pergunta) || 0,
    baseScore: Number(row.pontuacaoBase) || 0,
    bonus: Number(row.bonus) || 0,
    penalty: Number(row.penalidade) || 0,
    total: Number(row.pontuacaoFinal) || 0,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    version: Number(row.version) || 1,
  };
}

function toRow(score: Score): ScoreRow {
  return {
    id: score.id,
    jogoId: score.gameId,
    equipeId: score.teamId,
    rodada: String(score.round),
    pergunta: String(score.question),
    pontuacaoBase: String(score.baseScore),
    bonus: String(score.bonus),
    penalidade: String(score.penalty),
    pontuacaoFinal: String(score.total),
    createdAt: score.createdAt,
    updatedAt: score.updatedAt,
    version: String(score.version),
  };
}

export class GoogleSheetsScoreRepository implements ScoreRepository {
  private readonly table = new SheetTable<ScoreRow>('pontuacoes', COLUMNS);

  async findByGameId(gameId: string): Promise<Score[]> {
    const rows = await this.table.readAll();
    return rows.filter((r) => r.jogoId === gameId).map(toDomain);
  }

  async findByRound(gameId: string, round: number): Promise<Score[]> {
    const all = await this.findByGameId(gameId);
    return all.filter((s) => s.round === round);
  }

  async findByQuestion(gameId: string, round: number, question: number): Promise<Score[]> {
    const all = await this.findByGameId(gameId);
    return all.filter((s) => s.round === round && s.question === question);
  }

  async upsertMany(
    gameId: string,
    round: number,
    question: number,
    entries: ScoreUpsertEntry[],
  ): Promise<Score[]> {
    const now = nowIso();
    const existingForQuestion = await this.findByQuestion(gameId, round, question);
    const result: Score[] = [];

    for (const entry of entries) {
      const existing = existingForQuestion.find((s) => s.teamId === entry.teamId);
      if (existing) {
        const updated: Score = {
          ...existing,
          baseScore: entry.baseScore,
          bonus: entry.bonus,
          penalty: entry.penalty,
          total: entry.total,
          updatedAt: now,
          version: existing.version + 1,
        };
        await this.table.replaceWhere((r) => r.id === existing.id, toRow(updated));
        result.push(updated);
      } else {
        const created: Score = {
          id: newId(),
          gameId,
          teamId: entry.teamId,
          round,
          question,
          baseScore: entry.baseScore,
          bonus: entry.bonus,
          penalty: entry.penalty,
          total: entry.total,
          createdAt: now,
          updatedAt: now,
          version: 1,
        };
        await this.table.append(toRow(created));
        result.push(created);
      }
    }
    return result;
  }

  /** Só para o backup de jogo finalizado — ver `GoogleSheetsGameRepository.importRecord`. */
  async importRecord(score: Score): Promise<void> {
    await this.table.append(toRow(score));
  }

  async findLastRegisteredQuestion(
    gameId: string,
  ): Promise<{ round: number; question: number } | null> {
    const scores = await this.findByGameId(gameId);
    if (!scores.length) return null;
    let last = { round: scores[0].round, question: scores[0].question };
    for (const s of scores) {
      if (s.round > last.round || (s.round === last.round && s.question > last.question)) {
        last = { round: s.round, question: s.question };
      }
    }
    return last;
  }
}
