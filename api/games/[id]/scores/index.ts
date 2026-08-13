import type { VercelRequest, VercelResponse } from '@vercel/node';
import { badRequest, withHandler, requireMethod, pathParam } from '../../../_lib/http/respond';
import { parseBody, submitScoresSchema } from '../../../_lib/http/validation';
import { getQuestionScores, submitQuestionScores } from '../../../_lib/services/game.service';
import { requireSession } from '../../../_lib/http/session';

export default withHandler(async (req: VercelRequest, res: VercelResponse) => {
  requireSession(req);
  const gameId = pathParam(req, 'id');

  if (req.method === 'GET') {
    const round = Number(req.query['round']);
    const question = Number(req.query['question']);
    if (!round || !question) {
      throw badRequest('Informe os parâmetros round e question.');
    }
    const scores = await getQuestionScores(gameId, round, question);
    res.status(200).json({ scores });
    return;
  }

  requireMethod(req, 'POST');
  const payload = parseBody(submitScoresSchema, req.body);
  const result = await submitQuestionScores(gameId, payload);
  res.status(200).json(result);
});
