/**
 * Re-exporta os tipos de domínio compartilhados (shared/domain/types.ts) para
 * o app Angular. Manter um único ponto de import (`@app/core/models`) evita
 * espalhar o caminho `@shared/...` pelos componentes.
 */
export * from '@shared/domain/types';
import type { Game, GameStatus, GameType } from '@shared/domain/types';

/** Cores de identificação visual por equipe (spec seção 3: "equipes visualmente diferenciadas"). */
export const TEAM_COLORS = [
  '#3b82f6', // azul
  '#22c55e', // verde
  '#eab308', // amarelo
  '#ef4444', // vermelho
  '#a855f7', // roxo
  '#06b6d4', // ciano
  '#f97316', // laranja
  '#ec4899', // rosa
] as const;

export function teamColor(order: number): string {
  return TEAM_COLORS[(order - 1) % TEAM_COLORS.length];
}

const STATUS_LABELS: Record<GameStatus, string> = {
  CONFIGURACAO: 'Em configuração',
  EM_ANDAMENTO: 'Em andamento',
  RODADA_FINALIZADA: 'Rodada finalizada',
  FINALIZADO: 'Finalizado',
};

export function statusLabel(status: GameStatus): string {
  return STATUS_LABELS[status];
}

/** Ordem dos grupos de status na lista de jogos da home: em andamento/no
 * intervalo primeiro (o que precisa de atenção agora), depois os a
 * iniciar, e por último os já finalizados. */
const STATUS_GROUP_RANK: Record<GameStatus, number> = {
  EM_ANDAMENTO: 0,
  RODADA_FINALIZADA: 0,
  CONFIGURACAO: 1,
  FINALIZADO: 2,
};

/** Comparador da lista de jogos da home (spec "home/dashboard"): agrupa por
 * status (em andamento/no intervalo → a iniciar → finalizados) e, dentro de
 * cada grupo, ordena por data decrescente. */
export function compareGamesForDashboard(a: Game, b: Game): number {
  const rankDiff = STATUS_GROUP_RANK[a.status] - STATUS_GROUP_RANK[b.status];
  if (rankDiff !== 0) return rankDiff;
  return new Date(b.date).getTime() - new Date(a.date).getTime();
}

export const GAME_TYPE_OPTIONS: { value: GameType; label: string }[] = [
  { value: 'POP_GERAIS', label: 'POP + GERAIS' },
  { value: 'TEMATICA', label: 'TEMÁTICA' },
  { value: 'DECADAS', label: 'DÉCADAS' },
];

const GAME_TYPE_LABELS: Record<GameType, string> = {
  POP_GERAIS: 'POP + GERAIS',
  TEMATICA: 'TEMÁTICA',
  DECADAS: 'DÉCADAS',
};

export function gameTypeLabel(gameType: GameType): string {
  return GAME_TYPE_LABELS[gameType];
}

/** Concordância singular/plural simples pros contadores da UI ("1 rodada" vs "2 rodadas"). */
export function pluralize(count: number, singular: string, plural: string): string {
  return count === 1 ? singular : plural;
}
