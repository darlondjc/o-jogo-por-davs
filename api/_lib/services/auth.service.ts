import { OAuth2Client } from 'google-auth-library';
import { HttpError } from '../http/respond';
import { getDriveClient, getSheetId, isGoogleSheetsConfigured } from '../repositories/google-sheets/client';
import type { SessionUser } from '../http/session';

/**
 * Login: Google Sign-In (ver seção "login" do README) + checagem de que o
 * e-mail autenticado é Editor da planilha do jogo. A planilha é a própria
 * fonte de verdade de "quem pode operar o sistema" — dar/tirar acesso é
 * simplesmente compartilhar/descompartilhar a planilha com o e-mail Google
 * da pessoa, sem precisar de uma tela de gestão de usuários separada.
 */

function getGoogleClientId(): string | null {
  return process.env['GOOGLE_CLIENT_ID'] ?? null;
}

export function isGoogleLoginConfigured(): boolean {
  return Boolean(getGoogleClientId());
}

let cachedOAuthClient: OAuth2Client | null = null;

function getOAuthClient(): OAuth2Client {
  if (cachedOAuthClient) return cachedOAuthClient;
  const clientId = getGoogleClientId();
  if (!clientId) {
    throw new HttpError(500, 'Login com Google não configurado (GOOGLE_CLIENT_ID ausente).');
  }
  cachedOAuthClient = new OAuth2Client(clientId);
  return cachedOAuthClient;
}

/** Verifica o ID token emitido pelo Google Identity Services no front-end. */
export async function verifyGoogleIdToken(idToken: string): Promise<SessionUser> {
  const clientId = getGoogleClientId();
  if (!clientId) {
    throw new HttpError(500, 'Login com Google não configurado (GOOGLE_CLIENT_ID ausente).');
  }

  let ticket;
  try {
    ticket = await getOAuthClient().verifyIdToken({ idToken, audience: clientId });
  } catch {
    throw new HttpError(401, 'Não foi possível validar o login do Google. Tente novamente.');
  }

  const payload = ticket.getPayload();
  if (!payload?.email) {
    throw new HttpError(401, 'Não foi possível validar o login do Google. Tente novamente.');
  }
  if (!payload.email_verified) {
    throw new HttpError(403, 'Seu e-mail do Google ainda não foi verificado.');
  }

  return {
    email: payload.email.toLowerCase(),
    name: payload.name ?? payload.email,
    picture: payload.picture ?? null,
  };
}

/**
 * true se `email` tiver acesso de Editor (ou Proprietário) na planilha
 * configurada em GOOGLE_SHEET_ID. Em modo demo (sem planilha configurada),
 * qualquer login válido do Google é aceito.
 */
export async function isSheetEditor(email: string): Promise<boolean> {
  if (!isGoogleSheetsConfigured()) return true;

  const drive = getDriveClient();
  let permissions;
  try {
    const res = await drive.permissions.list({
      fileId: getSheetId(),
      fields: 'permissions(emailAddress,role,deleted)',
      supportsAllDrives: true,
    });
    permissions = res.data.permissions ?? [];
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('Falha ao consultar permissões da planilha no Drive:', err);
    throw new HttpError(
      500,
      'Não foi possível verificar as permissões da planilha. Confirme se a Service Account tem acesso a ela.',
    );
  }

  const normalized = email.toLowerCase();
  return permissions.some(
    (p) =>
      !p.deleted &&
      p.emailAddress?.toLowerCase() === normalized &&
      (p.role === 'writer' || p.role === 'owner'),
  );
}
