import type { VercelRequest, VercelResponse } from '@vercel/node';
import { withHandler, requireMethod } from '../_lib/http/respond';
import { isGoogleLoginConfigured } from '../_lib/services/auth.service';

/** Config pública (sem segredos) que o Angular precisa para montar o botão do Google. */
export default withHandler(async (req: VercelRequest, res: VercelResponse) => {
  requireMethod(req, 'GET');
  res.status(200).json({
    googleClientId: process.env['GOOGLE_CLIENT_ID'] ?? null,
    configured: isGoogleLoginConfigured(),
  });
});
