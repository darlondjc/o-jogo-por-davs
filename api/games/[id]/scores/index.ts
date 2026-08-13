import type { VercelRequest, VercelResponse } from '@vercel/node';
import { withHandler, requireMethod, pathParam } from '../../../_lib/http/respond';
import { parseBody, submitScoresSchema } from '../../../_lib/http/validation';
import { submitQuestionScores } from '../../../_lib/services/game.service';
import { requireSession } from '../../../_lib/http/session';

export default withHandler(async (req: VercelRequest, res: VercelResponse) => {
  requireMethod(req, 'POST');
  requireSession(req);
  const gameId = pathParam(req, 'id');
  const payload = parseBody(submitScoresSchema, req.body);
  const result = await submitQuestionScores(gameId, payload);
  res.status(200).json(result);
});
