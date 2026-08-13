import type { VercelRequest, VercelResponse } from '@vercel/node';
import { withHandler, requireMethod, pathParam } from '../../../_lib/http/respond';
import { correctScoreSchema, parseBody } from '../../../_lib/http/validation';
import { correctScore } from '../../../_lib/services/game.service';
import { requireSession } from '../../../_lib/http/session';

export default withHandler(async (req: VercelRequest, res: VercelResponse) => {
  requireMethod(req, 'PUT');
  requireSession(req);
  const gameId = pathParam(req, 'id');
  const scoreId = pathParam(req, 'scoreId');
  const payload = parseBody(correctScoreSchema, req.body);
  const score = await correctScore(gameId, scoreId, payload);
  res.status(200).json({ score });
});
