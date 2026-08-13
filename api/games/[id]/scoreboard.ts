import type { VercelRequest, VercelResponse } from '@vercel/node';
import { withHandler, requireMethod, pathParam } from '../../_lib/http/respond';
import { getScoreboard } from '../../_lib/services/game.service';
import type { Scoreboard } from '../../../shared/domain/types';

/**
 * Endpoint consultado pelo placar público via polling (seção 20). Mantém um
 * cache curto em memória do processo para evitar bater no Google Sheets a
 * cada requisição de cada participante.
 *
 * Propositalmente NÃO exige sessão: é a única tela pensada para ser vista
 * por espectadores sem login (ver login/AuthGuard no front-end).
 */
const CACHE_TTL_MS = 2000;
const cache = new Map<string, { at: number; data: Scoreboard }>();

export default withHandler(async (req: VercelRequest, res: VercelResponse) => {
  requireMethod(req, 'GET');
  const gameId = pathParam(req, 'id');

  const cached = cache.get(gameId);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
    res.status(200).json({ scoreboard: cached.data });
    return;
  }

  const scoreboard = await getScoreboard(gameId);
  cache.set(gameId, { at: Date.now(), data: scoreboard });
  res.status(200).json({ scoreboard });
});
