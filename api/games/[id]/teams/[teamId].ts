import type { VercelRequest, VercelResponse } from '@vercel/node';
import { withHandler, requireMethod, pathParam } from '../../../_lib/http/respond';
import { parseBody, updateTeamSchema } from '../../../_lib/http/validation';
import { deleteTeam, updateTeam } from '../../../_lib/services/game.service';
import { requireSession } from '../../../_lib/http/session';

export default withHandler(async (req: VercelRequest, res: VercelResponse) => {
  requireMethod(req, 'PUT', 'DELETE');
  requireSession(req);
  const gameId = pathParam(req, 'id');
  const teamId = pathParam(req, 'teamId');

  if (req.method === 'DELETE') {
    await deleteTeam(gameId, teamId);
    res.status(204).end();
    return;
  }

  const payload = parseBody(updateTeamSchema, req.body);
  const team = await updateTeam(gameId, teamId, payload);
  res.status(200).json({ team });
});
