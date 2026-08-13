import type { VercelRequest, VercelResponse } from '@vercel/node';

export class HttpError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
  }
}

export function badRequest(message: string, details?: unknown): HttpError {
  return new HttpError(400, message, details);
}

export function notFound(message: string): HttpError {
  return new HttpError(404, message);
}

export function methodNotAllowed(allowed: string[]): HttpError {
  return new HttpError(405, `Método não permitido. Use: ${allowed.join(', ')}.`);
}

/** Envolve um handler assíncrono padronizando resposta de erro e CORS básico. */
export function withHandler(
  fn: (req: VercelRequest, res: VercelResponse) => Promise<void>,
) {
  return async (req: VercelRequest, res: VercelResponse): Promise<void> => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
      res.status(204).end();
      return;
    }

    try {
      await fn(req, res);
    } catch (err) {
      if (err instanceof HttpError) {
        res.status(err.status).json({ error: err.message, details: err.details ?? null });
        return;
      }
      // eslint-disable-next-line no-console
      console.error(err);
      res.status(500).json({ error: 'Erro interno do servidor.' });
    }
  };
}

export function requireMethod(req: VercelRequest, ...methods: string[]): void {
  if (!req.method || !methods.includes(req.method)) {
    throw methodNotAllowed(methods);
  }
}

export function pathParam(req: VercelRequest, name: string): string {
  const value = req.query[name];
  if (typeof value !== 'string' || !value) {
    throw badRequest(`Parâmetro de rota ausente: ${name}`);
  }
  return value;
}
