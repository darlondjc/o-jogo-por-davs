import type { Game, Question, Score, Team } from '../../../../shared/domain/types';
import { newId, nowIso } from '../../ids';

/**
 * Estado em memória (por instância do processo), usado como fallback quando
 * as variáveis de ambiente do Google Sheets não estão configuradas — permite
 * rodar o fluxo completo localmente sem credenciais (spec seção 36).
 *
 * Não é multi-instância nem durável entre deploys: é um modo de demonstração.
 */
export interface MemoryStore {
  games: Game[];
  teams: Team[];
  questions: Question[];
  scores: Score[];
}

function buildSeed(): MemoryStore {
  const gameId = 'demo-jogo-1';
  const now = nowIso();

  const game: Game = {
    id: gameId,
    name: 'O Jogo — Demo',
    date: new Date().toISOString().slice(0, 10),
    location: 'Bar XYZ',
    description: 'Dados de demonstração para desenvolvimento local.',
    gameType: 'POP_GERAIS',
    rounds: 3,
    questionsPerRound: 20,
    status: 'CONFIGURACAO',
    currentRound: 1,
    currentQuestion: 1,
    createdAt: now,
    updatedAt: now,
  };

  const teamNames = ['Os Inteligentes', 'Mestres do Quiz', 'Sem Nome', 'Só os Fortes'];
  const teams: Team[] = teamNames.map((name, index) => ({
    id: newId(),
    gameId,
    name,
    playersCount: 4 + (index % 3),
    order: index + 1,
    createdAt: now,
  }));

  return { games: [game], teams, questions: [], scores: [] };
}

let store: MemoryStore | null = null;

/** Store singleton por processo (reaproveitado entre invocações com Fluid Compute). */
export function getMemoryStore(): MemoryStore {
  if (!store) {
    store = buildSeed();
  }
  return store;
}
