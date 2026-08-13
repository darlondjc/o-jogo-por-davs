import type { VercelRequest, VercelResponse } from '@vercel/node';
import { withHandler, requireMethod, HttpError } from '../_lib/http/respond';
import { parseBody, googleLoginSchema } from '../_lib/http/validation';
import { verifyGoogleIdToken, isSheetEditor } from '../_lib/services/auth.service';
import { buildSessionCookie } from '../_lib/http/session';

/**
 * Login com Google: recebe o ID token do Google Identity Services (front-end),
 * valida a assinatura/audiência e só autentica quem tiver acesso de Editor
 * na planilha do jogo (ver seção "Login" do README). Sem isso, é uma
 * recusa de negócio (403), não um erro técnico.
 */
export default withHandler(async (req: VercelRequest, res: VercelResponse) => {
  requireMethod(req, 'POST');
  const { idToken } = parseBody(googleLoginSchema, req.body);

  const user = await verifyGoogleIdToken(idToken);

  const authorized = await isSheetEditor(user.email);
  if (!authorized) {
    throw new HttpError(
      403,
      `O e-mail ${user.email} não tem permissão de edição na planilha do jogo. ` +
        'Peça a um administrador para compartilhar a planilha com o seu e-mail Google, com permissão de Editor.',
    );
  }

  res.setHeader('Set-Cookie', buildSessionCookie(user));
  res.status(200).json({ user });
});
