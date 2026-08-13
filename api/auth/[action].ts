import type { VercelRequest, VercelResponse } from '@vercel/node';
import { withHandler, requireMethod, HttpError, pathParam } from '../_lib/http/respond';
import { parseBody, googleLoginSchema } from '../_lib/http/validation';
import {
  verifyGoogleIdToken,
  isSheetEditor,
  isGoogleLoginConfigured,
} from '../_lib/services/auth.service';
import { buildSessionCookie, buildLogoutCookie, getSessionUser } from '../_lib/http/session';

/**
 * Agrupa as rotas de autenticação (config, google, logout, me) num único
 * arquivo para caber no limite de Serverless Functions do plano Hobby da
 * Vercel (máx. 12). A URL pública de cada rota não muda: o segmento
 * dinâmico `[action]` mapeia /api/auth/<config|google|logout|me> para cá.
 */
export default withHandler(async (req: VercelRequest, res: VercelResponse) => {
  const action = pathParam(req, 'action');

  switch (action) {
    case 'config':
      return handleConfig(req, res);
    case 'google':
      return handleGoogle(req, res);
    case 'logout':
      return handleLogout(req, res);
    case 'me':
      return handleMe(req, res);
    default:
      throw new HttpError(404, `Rota de autenticação desconhecida: ${action}`);
  }
});

/** Config pública (sem segredos) que o Angular precisa para montar o botão do Google. */
async function handleConfig(req: VercelRequest, res: VercelResponse): Promise<void> {
  requireMethod(req, 'GET');
  res.status(200).json({
    googleClientId: process.env['GOOGLE_CLIENT_ID'] ?? null,
    configured: isGoogleLoginConfigured(),
  });
}

/**
 * Login com Google: recebe o ID token do Google Identity Services (front-end),
 * valida a assinatura/audiência e só autentica quem tiver acesso de Editor
 * na planilha do jogo (ver seção "Login" do README). Sem isso, é uma
 * recusa de negócio (403), não um erro técnico.
 */
async function handleGoogle(req: VercelRequest, res: VercelResponse): Promise<void> {
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
}

async function handleLogout(req: VercelRequest, res: VercelResponse): Promise<void> {
  requireMethod(req, 'POST');
  res.setHeader('Set-Cookie', buildLogoutCookie());
  res.status(204).end();
}

/** Consultado pelo front-end no boot da aplicação e pelo guard de rota. */
async function handleMe(req: VercelRequest, res: VercelResponse): Promise<void> {
  requireMethod(req, 'GET');
  const user = getSessionUser(req);
  if (!user) {
    res.status(401).json({ error: 'Não autenticado.' });
    return;
  }
  res.status(200).json({ user });
}
