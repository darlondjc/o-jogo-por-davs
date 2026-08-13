import type { NewTeam, Team } from '../../../../shared/domain/types';
import { newId, nowIso } from '../../ids';
import type { TeamRepository } from '../types';
import { SheetTable } from './sheet-table';

interface TeamRow extends Record<string, string> {
  id: string;
  jogoId: string;
  nome: string;
  quantidadeJogadores: string;
  ordem: string;
  createdAt: string;
}

const COLUMNS: readonly (keyof TeamRow & string)[] = [
  'id',
  'jogoId',
  'nome',
  'quantidadeJogadores',
  'ordem',
  'createdAt',
];

function toDomain(row: TeamRow): Team {
  return {
    id: row.id,
    gameId: row.jogoId,
    name: row.nome,
    playersCount: Number(row.quantidadeJogadores) || 0,
    order: Number(row.ordem) || 0,
    createdAt: row.createdAt,
  };
}

function toRow(team: Team): TeamRow {
  return {
    id: team.id,
    jogoId: team.gameId,
    nome: team.name,
    quantidadeJogadores: String(team.playersCount),
    ordem: String(team.order),
    createdAt: team.createdAt,
  };
}

export class GoogleSheetsTeamRepository implements TeamRepository {
  private readonly table = new SheetTable<TeamRow>('equipes', COLUMNS);

  async findByGameId(gameId: string): Promise<Team[]> {
    const rows = await this.table.readAll();
    return rows
      .filter((r) => r.jogoId === gameId)
      .map(toDomain)
      .sort((a, b) => a.order - b.order);
  }

  async findById(gameId: string, teamId: string): Promise<Team | null> {
    const rows = await this.table.readAll();
    const row = rows.find((r) => r.jogoId === gameId && r.id === teamId);
    return row ? toDomain(row) : null;
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
    await this.table.append(toRow(created));
    return created;
  }

  async update(gameId: string, teamId: string, patch: Partial<Team>): Promise<Team> {
    const current = await this.findById(gameId, teamId);
    if (!current) throw new Error(`Equipe não encontrada: ${teamId}`);
    const updated: Team = { ...current, ...patch, id: teamId, gameId };
    const result = await this.table.replaceWhere(
      (r) => r.jogoId === gameId && r.id === teamId,
      toRow(updated),
    );
    if (!result) throw new Error(`Falha ao atualizar equipe: ${teamId}`);
    return updated;
  }

  async delete(gameId: string, teamId: string): Promise<void> {
    await this.table.deleteWhere((r) => r.jogoId === gameId && r.id === teamId);
  }

  /** Só para o backup de jogo finalizado — ver `GoogleSheetsGameRepository.importRecord`. */
  async importRecord(team: Team): Promise<void> {
    await this.table.append(toRow(team));
  }
}
