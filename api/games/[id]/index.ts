import type { VercelRequest, VercelResponse } from '@vercel/node';
import { withHandler, requireMethod, pathParam } from '../../_lib/http/respond';
import { parseBody, updateGameSchema } from '../../_lib/http/validation';
import { getGameOrThrow, updateGame } from '../../_lib/services/game.service';
import { requireSession } from '../../_lib/http/session';

export default withHandler(async (req: VercelRequest, res: VercelResponse) => {
  requireMethod(req, 'GET', 'PUT');
  requireSession(req);
  const id = pathParam(req, 'id');

  if (req.method === 'GET') {
    const game = await getGameOrThrow(id);
    res.status(200).json({ game });
    return;
  }

  const payload = parseBody(updateGameSchema, req.body);
  const game = await updateGame(id, payload);
  res.status(200).json({ game });
});
