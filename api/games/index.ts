import type { VercelRequest, VercelResponse } from '@vercel/node';
import { withHandler, requireMethod } from '../_lib/http/respond';
import { parseBody, newGameSchema } from '../_lib/http/validation';
import { createGame, listGames } from '../_lib/services/game.service';
import { requireSession } from '../_lib/http/session';

export default withHandler(async (req: VercelRequest, res: VercelResponse) => {
  requireMethod(req, 'GET', 'POST');
  requireSession(req);

  if (req.method === 'GET') {
    const games = await listGames();
    res.status(200).json({ games });
    return;
  }

  const payload = parseBody(newGameSchema, req.body);
  const game = await createGame(payload);
  res.status(201).json({ game });
});
