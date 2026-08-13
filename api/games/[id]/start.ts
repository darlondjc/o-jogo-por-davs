import type { VercelRequest, VercelResponse } from '@vercel/node';
import { withHandler, requireMethod, pathParam } from '../../_lib/http/respond';
import { startGame } from '../../_lib/services/game.service';
import { requireSession } from '../../_lib/http/session';

export default withHandler(async (req: VercelRequest, res: VercelResponse) => {
  requireMethod(req, 'POST');
  requireSession(req);
  const gameId = pathParam(req, 'id');
  const game = await startGame(gameId);
  res.status(200).json({ game });
});
