/**
 * Modo planilha: o ranking vem pronto de uma planilha mantida por fora. As
 * colunas são achadas pelo nome do cabeçalho (linha 1), não pela posição:
 *
 *   nome da equipe | rodada 1 | rodada 2 | ... | total
 *
 * - nome:   primeira coluna cujo cabeçalho começa com "nome" (senão, a coluna A).
 * - total:  coluna "total" (ou "pontuacao", formato antigo; senão, a coluna B).
 * - rodada: colunas "rodada N". Todas entram, preenchidas ou não; `started`
 *           diz se a coluna já tem algum valor.
 *
 * Fica em `shared/` pra ser testável sem a API.
 */

export interface SheetRankingEntry {
  name: string;
  score: number;
  /** Posição com empate: duas equipes com 90 ficam ambas em 2º e a
   * próxima vai pra 4º (ranking "de competição"). */
  position: number;
}

export interface SheetRound {
  number: number;
  /** false enquanto a coluna da rodada está toda vazia. */
  started: boolean;
  entries: SheetRankingEntry[];
}

export interface SheetRanking {
  total: SheetRankingEntry[];
  /** Todas as colunas "rodada N", em ordem crescente. */
  rounds: SheetRound[];
}

/** Aceita "100", "90,5", "1.234,5", "1,234.5" e "-10". Vazio ou texto vira null. */
export function parseScore(raw: unknown): number | null {
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null;
  if (typeof raw !== 'string') return null;
  let s = raw.trim().replace(/\s/g, '');
  if (!s) return null;

  const lastComma = s.lastIndexOf(',');
  const lastDot = s.lastIndexOf('.');
  if (lastComma > lastDot) {
    // Vírgula é o decimal (pt-BR): pontos são milhar.
    s = s.replace(/\./g, '').replace(',', '.');
  } else {
    // Ponto é o decimal (ou nem tem): vírgulas são milhar.
    s = s.replace(/,/g, '');
  }
  if (!/^-?\d+(\.\d+)?$/.test(s)) return null;
  return Number(s);
}

/** Minúsculo, sem acento e sem espaço sobrando: "Pontuação " -> "pontuacao". */
function normalizeHeader(raw: unknown): string {
  return String(raw ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/** Ordena e numera as posições (com empate). */
function rank(items: { name: string; score: number }[]): SheetRankingEntry[] {
  const sorted = [...items].sort(
    (a, b) => b.score - a.score || a.name.localeCompare(b.name, 'pt-BR'),
  );
  let lastScore: number | null = null;
  let lastPosition = 0;
  return sorted.map((r, i) => {
    const position = r.score === lastScore ? lastPosition : i + 1;
    lastScore = r.score;
    lastPosition = position;
    return { ...r, position };
  });
}

/** `rows` é o que o Sheets devolve pra aba inteira. */
export function parseRankingSheet(rows: unknown[][]): SheetRanking {
  const header = (rows[0] ?? []).map(normalizeHeader);
  const body = rows.slice(1);

  let nameCol = header.findIndex((h) => h.startsWith('nome'));
  if (nameCol < 0) nameCol = 0;
  let totalCol = header.findIndex((h) => h === 'total');
  if (totalCol < 0) totalCol = header.findIndex((h) => h === 'pontuacao');
  if (totalCol < 0) totalCol = 1;

  const roundCols = header
    .map((h, col) => ({ col, match: h.match(/^rodada (\d+)$/) }))
    .filter((r): r is { col: number; match: RegExpMatchArray } => r.match !== null)
    .map((r) => ({ col: r.col, number: Number(r.match[1]) }))
    .sort((a, b) => a.number - b.number);

  // Linhas sem nome são ignoradas.
  const teams = body
    .map((row) => ({ row, name: String(row?.[nameCol] ?? '').trim() }))
    .filter((t) => t.name.length > 0);

  // Nome sem pontuação válida conta como 0, pra equipe não sumir do telão
  // só porque alguém apagou a célula no meio do jogo.
  const total = rank(teams.map((t) => ({ name: t.name, score: parseScore(t.row?.[totalCol]) ?? 0 })));

  const rounds: SheetRound[] = [];
  for (const { col, number } of roundCols) {
    const values = teams.map((t) => ({ name: t.name, score: parseScore(t.row?.[col]) }));
    rounds.push({
      number,
      started: values.some((v) => v.score !== null),
      entries: rank(values.map((v) => ({ name: v.name, score: v.score ?? 0 }))),
    });
  }

  return { total, rounds };
}

/** Só o ranking geral (coluna "total"). */
export function parseRankingRows(rows: unknown[][]): SheetRankingEntry[] {
  return parseRankingSheet(rows).total;
}
