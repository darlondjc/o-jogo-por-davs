import type { NewTeam, Team } from '../../../../shared/domain/types';
import { newId, nowIso } from '../../ids';
import type { TeamRepository } from '../types';
import { getMemoryStore } from './store';

export class MemoryTeamRepository implements TeamRepository {
  async findByGameId(gameId: string): Promise<Team[]> {
    return getMemoryStore()
      .teams.filter((t) => t.gameId === gameId)
      .sort((a, b) => a.order - b.order);
  }

  async findById(gameId: string, teamId: string): Promise<Team | null> {
    return (
      getMemoryStore().teams.find((t) => t.gameId === gameId && t.id === teamId) ?? null
    );
  }

  async create(gameId: string, team: NewTeam): Promise<Team> {
    const store = getMemoryStore();
    const existing = store.teams.filter((t) => t.gameId === gameId);
    const order = team.order ?? existing.length + 1;
    const created: Team = {
      id: newId(),
      gameId,
      name: team.name,
      playersCount: team.playersCount,
      order,
      createdAt: nowIso(),
    };
    store.teams.push(created);
    return created;
  }

  async update(gameId: string, teamId: string, patch: Partial<Team>): Promise<Team> {
    const store = getMemoryStore();
    const index = store.teams.findIndex((t) => t.gameId === gameId && t.id === teamId);
    if (index === -1) throw new Error(`Equipe não encontrada: ${teamId}`);
    const updated: Team = { ...store.teams[index], ...patch, id: teamId, gameId };
    store.teams[index] = updated;
    return updated;
  }

  async delete(gameId: string, teamId: string): Promise<void> {
    const store = getMemoryStore();
    store.teams = store.teams.filter((t) => !(t.gameId === gameId && t.id === teamId));
  }
}
