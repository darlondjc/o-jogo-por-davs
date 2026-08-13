import type { Question } from '../../../../shared/domain/types';
import { newId, nowIso } from '../../ids';
import type { QuestionRepository } from '../types';
import { getMemoryStore } from './store';

export class MemoryQuestionRepository implements QuestionRepository {
  async findByGameId(gameId: string): Promise<Question[]> {
    return getMemoryStore().questions.filter((q) => q.gameId === gameId);
  }

  async findOne(gameId: string, round: number, number: number): Promise<Question | null> {
    return (
      getMemoryStore().questions.find(
        (q) => q.gameId === gameId && q.round === round && q.number === number,
      ) ?? null
    );
  }

  async upsertRegistered(gameId: string, round: number, number: number): Promise<Question> {
    const store = getMemoryStore();
    const existing = store.questions.find(
      (q) => q.gameId === gameId && q.round === round && q.number === number,
    );
    if (existing) {
      existing.updatedAt = nowIso();
      return existing;
    }
    const created: Question = {
      id: newId(),
      gameId,
      round,
      number,
      status: 'REGISTRADA',
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
    store.questions.push(created);
    return created;
  }
}
