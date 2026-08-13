import type { VercelRequest, VercelResponse } from '@vercel/node';
import { withHandler, requireMethod, pathParam, HttpError } from '../../_lib/http/respond';
import {
  startGame,
  continueToNextRound,
  finishGame,
  getLiveState,
  getScoreboard,
} from '../../_lib/services/game.service';
import { requireSession } from '../../_lib/http/session';
import type { Scoreboard } from '../../../shared/domain/types';

/**
 * Agrupa as ações de um jogo (start, continue, finish, live, scoreboard)
 * num único arquivo para caber no limite de Serverless Functions do plano
 * Hobby da Vercel (máx. 12). A URL pública de cada rota não muda: o
 * segmento dinâmico `[action]` mapeia /api/games/:id/<ação> para cá.
 */
export default withHandler(async (req: VercelRequest, res: VercelResponse) => {
  const action = pathParam(req, 'action');

  switch (action) {
    case 'start':
      return handleStart(req, res);
    case 'continue':
      return handleContinue(req, res);
    case 'finish':
      return handleFinish(req, res);
    case 'live':
      return handleLive(req, res);
    case 'scoreboard':
      return handleScoreboard(req, res);
    default:
      throw new HttpError(404, `Ação de jogo desconhecida: ${action}`);
  }
});

async function handleStart(req: VercelRequest, res: VercelResponse): Promise<void> {
  requireMethod(req, 'POST');
  requireSession(req);
  const gameId = pathParam(req, 'id');
  const game = await startGame(gameId);
  res.status(200).json({ game });
}

/** Avança de RODADA_FINALIZADA para EM_ANDAMENTO após o resumo (seção 17). */
async function handleContinue(req: VercelRequest, res: VercelResponse): Promise<void> {
  requireMethod(req, 'POST');
  requireSession(req);
  const gameId = pathParam(req, 'id');
  const game = await continueToNextRound(gameId);
  res.status(200).json({ game });
}

async function handleFinish(req: VercelRequest, res: VercelResponse): Promise<void> {
  requireMethod(req, 'POST');
  requireSession(req);
  const gameId = pathParam(req, 'id');
  const game = await finishGame(gameId);
  res.status(200).json({ game });
}

async function handleLive(req: VercelRequest, res: VercelResponse): Promise<void> {
  requireMethod(req, 'GET');
  requireSession(req);
  const gameId = pathParam(req, 'id');
  const state = await getLiveState(gameId);
  res.status(200).json(state);
}

/**
 * Consultado pelo placar público via polling (seção 20). Mantém um cache
 * curto em memória do processo para evitar bater no Google Sheets a cada
 * requisição de cada participante.
 *
 * Propositalmente NÃO exige sessão: é a única tela pensada para ser vista
 * por espectadores sem login (ver login/AuthGuard no front-end).
 */
const SCOREBOARD_CACHE_TTL_MS = 2000;
const scoreboardCache = new Map<string, { at: number; data: Scoreboard }>();

async function handleScoreboard(req: VercelRequest, res: VercelResponse): Promise<void> {
  requireMethod(req, 'GET');
  const gameId = pathParam(req, 'id');

  const cached = scoreboardCache.get(gameId);
  if (cached && Date.now() - cached.at < SCOREBOARD_CACHE_TTL_MS) {
    res.status(200).json({ scoreboard: cached.data });
    return;
  }

  const scoreboard = await getScoreboard(gameId);
  scoreboardCache.set(gameId, { at: Date.now(), data: scoreboard });
  res.status(200).json({ scoreboard });
}
