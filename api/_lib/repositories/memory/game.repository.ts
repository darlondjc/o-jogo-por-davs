import type { Game, NewGame } from '../../../../shared/domain/types';
import { newId, nowIso } from '../../ids';
import type { GameRepository } from '../types';
import { getMemoryStore } from './store';

export class MemoryGameRepository implements GameRepository {
  async findAll(): Promise<Game[]> {
    return [...getMemoryStore().games].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async findById(id: string): Promise<Game | null> {
    return getMemoryStore().games.find((g) => g.id === id) ?? null;
  }

  async create(game: NewGame): Promise<Game> {
    const now = nowIso();
    const created: Game = {
      ...game,
      id: newId(),
      status: 'CONFIGURACAO',
      currentRound: 1,
      currentQuestion: 1,
      createdAt: now,
      updatedAt: now,
    };
    getMemoryStore().games.push(created);
    return created;
  }

  async update(id: string, patch: Partial<Game>): Promise<Game> {
    const store = getMemoryStore();
    const index = store.games.findIndex((g) => g.id === id);
    if (index === -1) throw new Error(`Jogo não encontrado: ${id}`);
    const updated: Game = { ...store.games[index], ...patch, id, updatedAt: nowIso() };
    store.games[index] = updated;
    return updated;
  }
}
