/**
 * Servidor local que reproduz o roteamento por arquivo do Vercel (`api/**`)
 * para desenvolvimento sem depender do `vercel dev` CLI. Descobre as rotas
 * automaticamente a partir da estrutura de pastas (mesma convenção:
 * `[param]` vira segmento dinâmico, `index.ts` é a rota do diretório).
 *
 * Rodar com: npm run dev:api
 */
import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const apiRoot = path.join(__dirname, '..', 'api');
const PORT = Number(process.env['API_PORT'] ?? 3001);

interface Route {
  regex: RegExp;
  paramNames: string[];
  filePath: string;
  staticSegments: number;
}

function collectRouteFiles(dir: string, acc: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === '_lib' || entry.name === 'tsconfig.json') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      collectRouteFiles(full, acc);
    } else if (entry.name.endsWith('.ts')) {
      acc.push(full);
    }
  }
  return acc;
}

function buildRoute(filePath: string): Route {
  const relative = path.relative(apiRoot, filePath).replace(/\.ts$/, '');
  const segments = relative.split(path.sep).filter((s) => s !== 'index');
  const paramNames: string[] = [];
  let staticSegments = 0;

  const pattern = segments
    .map((segment) => {
      const match = segment.match(/^\[(.+)\]$/);
      if (match) {
        paramNames.push(match[1]);
        return '([^/]+)';
      }
      staticSegments++;
      return segment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    })
    .join('/');

  return {
    regex: new RegExp(`^/api/${pattern}/?$`),
    paramNames,
    filePath,
    staticSegments,
  };
}

async function main() {
  const files = collectRouteFiles(apiRoot);
  const routes = files.map(buildRoute).sort((a, b) => b.staticSegments - a.staticSegments);

  console.log(`Rotas descobertas (${routes.length}):`);
  for (const r of routes) console.log(`  ${r.regex}`);

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', `http://localhost:${PORT}`);
    const match = routes
      .map((r) => ({ r, m: url.pathname.match(r.regex) }))
      .find((x) => x.m);

    if (!match) {
      res.statusCode = 404;
      res.end(JSON.stringify({ error: 'Rota não encontrada.' }));
      return;
    }

    const query: Record<string, string> = {};
    for (const [key, value] of url.searchParams) query[key] = value;
    match.r.paramNames.forEach((name, i) => {
      query[name] = decodeURIComponent(match.m![i + 1]);
    });

    let body: unknown = undefined;
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      const chunks: Buffer[] = [];
      for await (const chunk of req) chunks.push(chunk as Buffer);
      const raw = Buffer.concat(chunks).toString('utf-8');
      if (raw) {
        try {
          body = JSON.parse(raw);
        } catch {
          body = raw;
        }
      }
    }

    const reqLike = { method: req.method, headers: req.headers, query, body };
    const resLike = Object.assign(res, {
      status(code: number) {
        res.statusCode = code;
        return resLike;
      },
      json(payload: unknown) {
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify(payload));
      },
    });

    try {
      const mod = await import(match.r.filePath);
      await mod.default(reqLike, resLike);
    } catch (err) {
      console.error(err);
      if (!res.headersSent) res.statusCode = 500;
      res.end(JSON.stringify({ error: 'Erro interno do servidor.' }));
    }
  });

  server.listen(PORT, () => {
    console.log(`\n✓ API de desenvolvimento em http://localhost:${PORT}`);
  });
}

main();
