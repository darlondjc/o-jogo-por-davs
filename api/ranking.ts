import type { VercelRequest, VercelResponse } from '@vercel/node';
import { z } from 'zod';
import { withHandler, requireMethod, badRequest } from './_lib/http/respond';
import { parseBody } from './_lib/http/validation';
import { requireSession } from './_lib/http/session';
import {
  RANKING_TAB,
  clearRankingConfig,
  extractSheetId,
  getRankingConfig,
  readRankingRows,
  saveRankingConfig,
} from './_lib/services/ranking-config.service';
import { requireAdmin } from './_lib/services/auth.service';
import { parseRankingSheet } from '../shared/ranking-sheet';

/**
 * Modo planilha. Um arquivo só (limite de 12 funções do plano Hobby):
 *
 *   GET    /api/ranking            público: ranking da planilha configurada
 *   GET    /api/ranking?config=1   admin: planilha atual + e-mail da service account
 *   PUT    /api/ranking            admin: troca a planilha (valida lendo antes de salvar)
 *   PATCH  /api/ranking            admin: { live?, rounds? } libera/oculta o placar e o
 *                                  placar por rodada
 *   DELETE /api/ranking            admin: limpa a planilha; o placar fica em "aguardando"
 *
 * A aba lida é sempre "Ranking". Colunas achadas pelo cabeçalho (linha 1),
 * ver shared/ranking-sheet.ts:
 *   nome da equipe | rodada 1 | rodada 2 | ... | total
 *
 * A planilha precisa estar compartilhada com a service account
 * (GOOGLE_SERVICE_ACCOUNT_EMAIL) como leitora. Sem credenciais do Google,
 * devolve um ranking de demonstração pra dar pra rodar local.
 */

const DEMO_ROWS = [
  ['nome da equipe', 'rodada 1', 'rodada 2', 'rodada 3', 'total'],
  ['bitches', 40, 60, '', 100],
  ['lambida', 50, 40, '', 90],
  ['os sem nome', 30, 45, '', 75],
  ['time da casa', 25, 15, '', 40],
];

const configSchema = z.object({
  sheet: z.string().trim().min(1, 'Informe o link da planilha.'),
});

const patchSchema = z
  .object({ live: z.boolean().optional(), rounds: z.boolean().optional() })
  .refine((b) => b.live !== undefined || b.rounds !== undefined, 'Nada para alterar.');

/**
 * Leitura compartilhada da planilha no GET público. A Vercel atende várias
 * requisições na mesma instância: se 100 pessoas apertam "Atualizar" juntas
 * com o cache da CDN frio (ex: logo depois de liberar o placar), todas
 * esperam a mesma leitura em vez de cada uma ler a planilha (cota do Google:
 * 60 leituras/min). Erro não fica guardado.
 */
const SHARED_READ_MS = 3000;
let sharedRead: { sheetId: string; at: number; rows: Promise<unknown[][]> } | null = null;

function readRankingRowsShared(sheetId: string): Promise<unknown[][]> {
  const now = Date.now();
  if (sharedRead && sharedRead.sheetId === sheetId && now - sharedRead.at < SHARED_READ_MS) {
    return sharedRead.rows;
  }
  const rows = readRankingRows(sheetId);
  const entry = { sheetId, at: now, rows };
  sharedRead = entry;
  rows.catch(() => {
    if (sharedRead === entry) sharedRead = null;
  });
  return rows;
}

function sheetsReady(): boolean {
  return Boolean(
    process.env['GOOGLE_SERVICE_ACCOUNT_EMAIL'] && process.env['GOOGLE_PRIVATE_KEY'],
  );
}

export default withHandler(async (req: VercelRequest, res: VercelResponse) => {
  requireMethod(req, 'GET', 'PUT', 'PATCH', 'DELETE');

  if (req.method === 'PUT') {
    const user = requireSession(req);
    await requireAdmin(user);
    const body = parseBody(configSchema, req.body);
    const sheetId = extractSheetId(body.sheet);
    if (!sheetId) throw badRequest('Link da planilha inválido.');

    // Lê antes de salvar: link errado ou planilha não compartilhada aparece
    // na hora, pra quem está configurando, e não no telão.
    const rows = sheetsReady() ? await readRankingRows(sheetId) : DEMO_ROWS;
    // Planilha nova começa oculta (o admin libera quando o jogo começar).
    // Salvar de novo a mesma planilha, ex: corrigir o link, mantém o estado.
    // A opção de placar por rodada é preferência do admin: atravessa a troca.
    const previous = await getRankingConfig();
    const live = previous?.sheetId === sheetId ? previous.live : false;
    const config = {
      sheetId,
      live,
      roundsEnabled: previous?.roundsEnabled ?? false,
      updatedAt: new Date().toISOString(),
      updatedBy: user.email,
    };
    await saveRankingConfig(config);
    res.status(200).json({ config, entries: parseRankingSheet(rows).total });
    return;
  }

  if (req.method === 'PATCH') {
    const user = requireSession(req);
    await requireAdmin(user);
    const patch = parseBody(patchSchema, req.body);
    const current = await getRankingConfig();
    if (!current) throw badRequest('Salve uma planilha antes de liberar o placar.');
    const config = {
      ...current,
      live: patch.live ?? current.live,
      roundsEnabled: patch.rounds ?? current.roundsEnabled,
      updatedAt: new Date().toISOString(),
      updatedBy: user.email,
    };
    await saveRankingConfig(config);
    res.status(200).json({ config });
    return;
  }

  if (req.method === 'DELETE') {
    await requireAdmin(requireSession(req));
    await clearRankingConfig();
    res.status(204).end();
    return;
  }

  if (req.query['config'] !== undefined) {
    await requireAdmin(requireSession(req));
    res.setHeader('Cache-Control', 'no-store');
    res.status(200).json({
      config: await getRankingConfig(),
      tab: RANKING_TAB,
      serviceAccountEmail: process.env['GOOGLE_SERVICE_ACCOUNT_EMAIL'] ?? null,
    });
    return;
  }

  // Cache curto na CDN: com muita gente olhando o placar ao mesmo tempo, a
  // planilha recebe no máximo ~1 leitura a cada 5s (a cota do Sheets é por
  // minuto), e quem chega nesse meio-tempo pega a cópia da borda.
  res.setHeader('Cache-Control', 'public, s-maxage=5, stale-while-revalidate=25');

  let rows: unknown[][] = DEMO_ROWS;
  let roundsEnabled = true;
  if (sheetsReady()) {
    const config = await getRankingConfig();
    if (!config || !config.live) {
      // Sem planilha ou ainda não liberado: não lê a planilha, então nada
      // vaza pro público antes da hora.
      res.status(200).json({
        configured: Boolean(config),
        live: false,
        entries: [],
        fetchedAt: new Date().toISOString(),
      });
      return;
    }
    rows = await readRankingRowsShared(config.sheetId);
    roundsEnabled = config.roundsEnabled;
  }
  const sheet = parseRankingSheet(rows);
  res.status(200).json({
    configured: true,
    live: true,
    entries: sheet.total,
    // Só vai pro público se o admin habilitou; senão nem sai do servidor.
    rounds: roundsEnabled ? sheet.rounds : [],
    fetchedAt: new Date().toISOString(),
  });
});
