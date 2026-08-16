import { isFirestoreConfigured } from './firestore/client';
import { FirestoreGameRepository } from './firestore/game.repository';
import { FirestoreQuestionRepository } from './firestore/question.repository';
import { FirestoreScoreRepository } from './firestore/score.repository';
import { FirestoreTeamRepository } from './firestore/team.repository';
import { MemoryGameRepository } from './memory/game.repository';
import { MemoryQuestionRepository } from './memory/question.repository';
import { MemoryScoreRepository } from './memory/score.repository';
import { MemoryTeamRepository } from './memory/team.repository';
import type { Repositories } from './types';

let cached: Promise<Repositories> | null = null;

/**
 * Fábrica de repositórios, em ordem de prioridade (spec "Melhorias de
 * armazenamento"):
 *
 * 1. Firestore, quando configurado — repositório ativo durante o jogo
 *    inteiro (leitura e escrita rápidas). O Google Sheets, se também
 *    configurado, só recebe uma cópia de backup quando o jogo finaliza (ver
 *    `services/backup.service.ts`) — não é lido nem escrito durante o jogo.
 * 2. Google Sheets, quando configurado e o Firestore não está — mantém o
 *    comportamento anterior à migração, sem precisar do Firestore pra
 *    funcionar.
 * 3. Memória, com dados de demonstração — quando nenhum dos dois está
 *    configurado (dev local sem credenciais).
 *
 * O restante do backend depende só das interfaces em `./types`.
 *
 * As classes do Google Sheets só são importadas (dinamicamente) dentro do
 * branch que de fato precisa delas. O pacote `googleapis` é enorme — o SDK
 * inteiro do Google, todas as APIs, não só Sheets — e um `import` estático
 * no topo do arquivo entra no bundle de toda função serverless que toca
 * `getRepositories()` (ou seja, praticamente toda a API), mesmo em produção
 * com o Firestore configurado e ativo, onde o Sheets nunca chega a ser
 * usado pra nada além do backup ao finalizar um jogo. Isso vira essa função
 * assíncrona; `repos()` em `game.service.ts` e o uso direto em
 * `backup.service.ts` já esperam por ela.
 */
export function getRepositories(): Promise<Repositories> {
  if (cached) return cached;

  cached = load().catch((err) => {
    // Não deixa uma falha de import (ex: erro transitório de carregamento
    // de módulo) presa em cache pra sempre — a próxima chamada tenta de novo.
    cached = null;
    throw err;
  });
  return cached;
}

async function load(): Promise<Repositories> {
  if (isFirestoreConfigured()) {
    return {
      games: new FirestoreGameRepository(),
      teams: new FirestoreTeamRepository(),
      questions: new FirestoreQuestionRepository(),
      scores: new FirestoreScoreRepository(),
    };
  }

  const { isGoogleSheetsConfigured } = await import('./google-sheets/client');
  if (isGoogleSheetsConfigured()) {
    const [
      { GoogleSheetsGameRepository },
      { GoogleSheetsTeamRepository },
      { GoogleSheetsQuestionRepository },
      { GoogleSheetsScoreRepository },
    ] = await Promise.all([
      import('./google-sheets/game.repository'),
      import('./google-sheets/team.repository'),
      import('./google-sheets/question.repository'),
      import('./google-sheets/score.repository'),
    ]);
    return {
      games: new GoogleSheetsGameRepository(),
      teams: new GoogleSheetsTeamRepository(),
      questions: new GoogleSheetsQuestionRepository(),
      scores: new GoogleSheetsScoreRepository(),
    };
  }

  return {
    games: new MemoryGameRepository(),
    teams: new MemoryTeamRepository(),
    questions: new MemoryQuestionRepository(),
    scores: new MemoryScoreRepository(),
  };
}
