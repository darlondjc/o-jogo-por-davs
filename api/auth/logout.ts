import type { VercelRequest, VercelResponse } from '@vercel/node';
import { withHandler, requireMethod } from '../_lib/http/respond';
import { buildLogoutCookie } from '../_lib/http/session';

export default withHandler(async (req: VercelRequest, res: VercelResponse) => {
  requireMethod(req, 'POST');
  res.setHeader('Set-Cookie', buildLogoutCookie());
  res.status(204).end();
});
