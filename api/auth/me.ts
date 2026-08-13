import type { VercelRequest, VercelResponse } from '@vercel/node';
import { withHandler, requireMethod } from '../_lib/http/respond';
import { getSessionUser } from '../_lib/http/session';

/** Consultado pelo front-end no boot da aplicação e pelo guard de rota. */
export default withHandler(async (req: VercelRequest, res: VercelResponse) => {
  requireMethod(req, 'GET');
  const user = getSessionUser(req);
  if (!user) {
    res.status(401).json({ error: 'Não autenticado.' });
    return;
  }
  res.status(200).json({ user });
});
