import type { NewTeam, Team } from '../../../../shared/domain/types';
import { newId, nowIso } from '../../ids';
import type { TeamRepository } from '../types';
import { getFirestoreDb } from './client';

/** Coleção `games/{gameId}/teams/{teamId}` — subcoleção do jogo, então
 * listar as equipes de um jogo nunca varre dados de outros jogos (ao
 * contrário da aba única do Sheets, filtrada por `jogoId` em toda leitura). */
export class FirestoreTeamRepository implements TeamRepository {
  private teamsCol(gameId: string) {
    return getFirestoreDb().collection('games').doc(gameId).collection('teams');
  }

  async findByGameId(gameId: string): Promise<Team[]> {
    const snap = await this.teamsCol(gameId).orderBy('order', 'asc').get();
    return snap.docs.map((doc) => doc.data() as Team);
  }

  /** Consulta de agregação: 1 leitura faturada, sem baixar os documentos das
   * equipes — bem mais barato que `findByGameId(gameId).length` quando só o
   * número importa (painel de jogos). */
  async countByGameId(gameId: string): Promise<number> {
    const snap = await this.teamsCol(gameId).count().get();
    return snap.data().count;
  }

  async findById(gameId: string, teamId: string): Promise<Team | null> {
    const doc = await this.teamsCol(gameId).doc(teamId).get();
    return doc.exists ? (doc.data() as Team) : null;
  }

  async create(gameId: string, team: NewTeam): Promise<Team> {
    const existing = await this.findByGameId(gameId);
    const order = team.order ?? existing.length + 1;
    const created: Team = {
      id: newId(),
      gameId,
      name: team.name,
      playersCount: team.playersCount,
      order,
      createdAt: nowIso(),
    };
    await this.teamsCol(gameId).doc(created.id).set(created);
    return created;
  }

  async update(gameId: string, teamId: string, patch: Partial<Team>): Promise<Team> {
    const current = await this.findById(gameId, teamId);
    if (!current) throw new Error(`Equipe não encontrada: ${teamId}`);
    const updated: Team = { ...current, ...patch, id: teamId, gameId };
    await this.teamsCol(gameId).doc(teamId).set(updated);
    return updated;
  }

  async delete(gameId: string, teamId: string): Promise<void> {
    await this.teamsCol(gameId).doc(teamId).delete();
  }
}
