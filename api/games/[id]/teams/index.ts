import type { VercelRequest, VercelResponse } from '@vercel/node';
import { withHandler, requireMethod, pathParam } from '../../../_lib/http/respond';
import { parseBody, newTeamSchema } from '../../../_lib/http/validation';
import { addTeam, listTeams } from '../../../_lib/services/game.service';
import { requireSession } from '../../../_lib/http/session';

export default withHandler(async (req: VercelRequest, res: VercelResponse) => {
  requireMethod(req, 'GET', 'POST');
  requireSession(req);
  const gameId = pathParam(req, 'id');

  if (req.method === 'GET') {
    const teams = await listTeams(gameId);
    res.status(200).json({ teams });
    return;
  }

  const payload = parseBody(newTeamSchema, req.body);
  const team = await addTeam(gameId, payload);
  res.status(201).json({ team });
});
