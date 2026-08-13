import type { VercelRequest, VercelResponse } from '@vercel/node';
import { withHandler, requireMethod, pathParam, badRequest } from '../../../../_lib/http/respond';
import { getRoundSummary } from '../../../../_lib/services/game.service';
import { requireSession } from '../../../../_lib/http/session';

export default withHandler(async (req: VercelRequest, res: VercelResponse) => {
  requireMethod(req, 'GET');
  requireSession(req);
  const gameId = pathParam(req, 'id');
  const roundNumber = Number(pathParam(req, 'roundNumber'));
  if (!Number.isInteger(roundNumber) || roundNumber < 1) {
    throw badRequest('Número de rodada inválido.');
  }
  const summary = await getRoundSummary(gameId, roundNumber);
  res.status(200).json({ summary });
});
