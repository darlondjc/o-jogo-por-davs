import type { VercelRequest, VercelResponse } from '@vercel/node';
import { withHandler, requireMethod, pathParam } from '../../_lib/http/respond';
import { getLiveState } from '../../_lib/services/game.service';
import { requireSession } from '../../_lib/http/session';

export default withHandler(async (req: VercelRequest, res: VercelResponse) => {
  requireMethod(req, 'GET');
  requireSession(req);
  const gameId = pathParam(req, 'id');
  const state = await getLiveState(gameId);
  res.status(200).json(state);
});
