import { getFirestoreDb, isFirestoreConfigured } from '../repositories/firestore/client';
import { getSheetsClient } from '../repositories/google-sheets/client';
import { HttpError } from '../http/respond';

/**
 * Qual planilha o placar do modo planilha lê. Cada jogo pode usar uma
 * planilha diferente, então isso é trocado (ou limpo) pela tela /admin e
 * fica salvo no Firestore (doc `config/ranking`). Sem nada salvo, o placar
 * fica em "aguardando". De propósito não existe fallback pra variável de
 * ambiente: senão "Limpar" voltaria a mostrar uma planilha antiga.
 */

/** Nome fixo da aba lida em qualquer planilha. */
export const RANKING_TAB = 'Ranking';

export interface RankingConfig {
  sheetId: string;
  /** Placar liberado pro público. Enquanto false, quem abre o placar vê
   * "Aguardando início do jogo" e a planilha nem é lida. */
  live: boolean;
  /** Público pode ver o placar de cada rodada (colunas "rodada N"), além
   * do geral. */
  roundsEnabled: boolean;
  updatedAt: string;
  updatedBy: string;
}

/** Fallback quando o Firestore não está configurado (dev/demo): vive só
 * enquanto o processo estiver de pé. */
let memoryConfig: RankingConfig | null = null;

function configDoc() {
  return getFirestoreDb().collection('config').doc('ranking');
}

export async function getRankingConfig(): Promise<RankingConfig | null> {
  if (!isFirestoreConfigured()) return memoryConfig;
  const data = (await configDoc().get()).data() as Partial<RankingConfig> | undefined;
  if (!data?.sheetId) return null;
  return {
    sheetId: data.sheetId,
    live: data.live === true,
    roundsEnabled: data.roundsEnabled === true,
    updatedAt: data.updatedAt ?? '',
    updatedBy: data.updatedBy ?? '',
  };
}

export async function saveRankingConfig(config: RankingConfig): Promise<void> {
  if (isFirestoreConfigured()) await configDoc().set(config);
  else memoryConfig = config;
}

export async function clearRankingConfig(): Promise<void> {
  if (isFirestoreConfigured()) await configDoc().delete();
  else memoryConfig = null;
}

/** Aceita o link inteiro da planilha ou só o ID. */
export function extractSheetId(input: string): string | null {
  const trimmed = input.trim();
  const fromUrl = trimmed.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
  if (fromUrl) return fromUrl[1];
  return /^[a-zA-Z0-9_-]{20,}$/.test(trimmed) ? trimmed : null;
}

/** Lê a aba fixa inteira (nome, rodadas e total). Erros comuns de configuração viram
 * mensagem legível em vez de um 500 genérico. */
export async function readRankingRows(sheetId: string): Promise<unknown[][]> {
  try {
    const res = await getSheetsClient().spreadsheets.values.get(
      {
        spreadsheetId: sheetId,
        range: `'${RANKING_TAB}'`,
        valueRenderOption: 'UNFORMATTED_VALUE',
      },
      { timeout: 8000 },
    );
    return (res.data.values as unknown[][] | undefined) ?? [];
  } catch (err) {
    const status = (err as { status?: number }).status;
    const message = String((err as Error).message ?? '');
    if (status === 400 && message.includes('Unable to parse range')) {
      throw new HttpError(404, `Aba "${RANKING_TAB}" não encontrada na planilha.`);
    }
    if (status === 403) {
      throw new HttpError(
        403,
        'Sem permissão para ler a planilha. Compartilhe com a service account.',
      );
    }
    if (status === 404) {
      throw new HttpError(404, 'Planilha não encontrada. Confira o link.');
    }
    throw err;
  }
}
