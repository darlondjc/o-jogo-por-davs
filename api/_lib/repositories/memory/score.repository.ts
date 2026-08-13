import type { Score } from '../../../../shared/domain/types';
import { newId, nowIso } from '../../ids';
import type { ScoreRepository, ScoreUpsertEntry } from '../types';
import { getMemoryStore } from './store';

export class MemoryScoreRepository implements ScoreRepository {
  async findByGameId(gameId: string): Promise<Score[]> {
    return getMemoryStore().scores.filter((s) => s.gameId === gameId);
  }

  async findByRound(gameId: string, round: number): Promise<Score[]> {
    return getMemoryStore().scores.filter((s) => s.gameId === gameId && s.round === round);
  }

  async findByQuestion(gameId: string, round: number, question: number): Promise<Score[]> {
    return getMemoryStore().scores.filter(
      (s) => s.gameId === gameId && s.round === round && s.question === question,
    );
  }

  async upsertMany(
    gameId: string,
    round: number,
    question: number,
    entries: ScoreUpsertEntry[],
  ): Promise<Score[]> {
    const store = getMemoryStore();
    const now = nowIso();
    const result: Score[] = [];

    for (const entry of entries) {
      const index = store.scores.findIndex(
        (s) =>
          s.gameId === gameId &&
          s.round === round &&
          s.question === question &&
          s.teamId === entry.teamId,
      );
      if (index === -1) {
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
        store.scores.push(created);
        result.push(created);
      } else {
        const existing = store.scores[index];
        const updated: Score = {
          ...existing,
          baseScore: entry.baseScore,
          bonus: entry.bonus,
          penalty: entry.penalty,
          total: entry.total,
          updatedAt: now,
          version: existing.version + 1,
        };
        store.scores[index] = updated;
        result.push(updated);
      }
    }
    return result;
  }

  async findLastRegisteredQuestion(
    gameId: string,
  ): Promise<{ round: number; question: number } | null> {
    const scores = getMemoryStore().scores.filter((s) => s.gameId === gameId);
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
