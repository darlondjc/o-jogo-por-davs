import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import type { VercelRequest } from '@vercel/node';
import { HttpError } from './respond';

/**
 * Sessão do usuário logado — armazenada em um cookie HttpOnly assinado
 * (HMAC-SHA256), sem dependências externas. Não é um JWT padrão, mas segue
 * a mesma ideia: payload + assinatura, para o servidor confiar no conteúdo
 * sem precisar de um banco de sessões.
 */

const COOKIE_NAME = 'jogo_session';
const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12h — cobre a duração de um jogo ao vivo.

export interface SessionUser {
  email: string;
  name: string;
  picture: string | null;
}

interface SessionPayload extends SessionUser {
  exp: number; // epoch ms
}

// Sem SESSION_SECRET configurado (dev/demo local), usamos um segredo gerado
// em memória do processo — sessões existentes só sobrevivem enquanto a
// função serverless ficar "quente". Isso é aceitável fora de produção; em
// produção o segredo deve vir de variável de ambiente para sobreviver a
// cold starts e ser consistente entre instâncias.
let ephemeralSecret: string | null = null;

function getSecret(): string {
  const fromEnv = process.env['SESSION_SECRET'];
  if (fromEnv) return fromEnv;
  if (!ephemeralSecret) {
    // eslint-disable-next-line no-console
    console.warn(
      'SESSION_SECRET não definido — usando segredo temporário do processo (ok em dev, defina em produção).',
    );
    ephemeralSecret = randomBytes(32).toString('hex');
  }
  return ephemeralSecret;
}

function sign(data: string): string {
  return createHmac('sha256', getSecret()).update(data).digest('base64url');
}

function encode(payload: SessionPayload): string {
  const data = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const signature = sign(data);
  return `${data}.${signature}`;
}

function decode(token: string): SessionPayload | null {
  const [data, signature] = token.split('.');
  if (!data || !signature) return null;

  const expected = sign(data);
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  try {
    const payload = JSON.parse(Buffer.from(data, 'base64url').toString('utf8')) as SessionPayload;
    if (typeof payload.exp !== 'number' || payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

/** Cookie a devolver no header `Set-Cookie` após um login bem-sucedido. */
export function buildSessionCookie(user: SessionUser): string {
  const exp = Date.now() + SESSION_TTL_MS;
  const token = encode({ ...user, exp });
  const secure = process.env['VERCEL_ENV'] ? '; Secure' : '';
  return `${COOKIE_NAME}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}${secure}`;
}

/** Cookie a devolver para encerrar a sessão (logout). */
export function buildLogoutCookie(): string {
  const secure = process.env['VERCEL_ENV'] ? '; Secure' : '';
  return `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`;
}

function readCookie(req: VercelRequest, name: string): string | null {
  const header = req.headers['cookie'];
  if (!header) return null;
  const parts = Array.isArray(header) ? header.join('; ') : header;
  for (const pair of parts.split(';')) {
    const idx = pair.indexOf('=');
    if (idx === -1) continue;
    const key = pair.slice(0, idx).trim();
    if (key === name) return decodeURIComponent(pair.slice(idx + 1).trim());
  }
  return null;
}

/** Retorna o usuário da sessão atual, ou `null` se não houver sessão válida. */
export function getSessionUser(req: VercelRequest): SessionUser | null {
  const token = readCookie(req, COOKIE_NAME);
  if (!token) return null;
  const payload = decode(token);
  if (!payload) return null;
  const { exp: _exp, ...user } = payload;
  return user;
}

/** Como `getSessionUser`, mas lança 401 se não houver sessão válida. */
export function requireSession(req: VercelRequest): SessionUser {
  const user = getSessionUser(req);
  if (!user) {
    throw new HttpError(401, 'Sessão expirada ou inexistente. Faça login novamente.');
  }
  return user;
}
