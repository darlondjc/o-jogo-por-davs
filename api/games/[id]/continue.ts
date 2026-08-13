import type { VercelRequest, VercelResponse } from '@vercel/node';
import { withHandler, requireMethod, pathParam } from '../../_lib/http/respond';
import { continueToNextRound } from '../../_lib/services/game.service';
import { requireSession } from '../../_lib/http/session';

/** Avança de RODADA_FINALIZADA para EM_ANDAMENTO após o resumo (seção 17). */
export default withHandler(async (req: VercelRequest, res: VercelResponse) => {
  requireMethod(req, 'POST');
  requireSession(req);
  const gameId = pathParam(req, 'id');
  const game = await continueToNextRound(gameId);
  res.status(200).json({ game });
});
