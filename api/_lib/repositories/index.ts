import { isFirestoreConfigured } from './firestore/client';
import { FirestoreGameRepository } from './firestore/game.repository';
import { FirestoreQuestionRepository } from './firestore/question.repository';
import { FirestoreScoreRepository } from './firestore/score.repository';
import { FirestoreTeamRepository } from './firestore/team.repository';
import { isGoogleSheetsConfigured } from './google-sheets/client';
import { GoogleSheetsGameRepository } from './google-sheets/game.repository';
import { GoogleSheetsQuestionRepository } from './google-sheets/question.repository';
import { GoogleSheetsScoreRepository } from './google-sheets/score.repository';
import { GoogleSheetsTeamRepository } from './google-sheets/team.repository';
import { MemoryGameRepository } from './memory/game.repository';
import { MemoryQuestionRepository } from './memory/question.repository';
import { MemoryScoreRepository } from './memory/score.repository';
import { MemoryTeamRepository } from './memory/team.repository';
import type { Repositories } from './types';

let cached: Repositories | null = null;

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
 */
export function getRepositories(): Repositories {
  if (cached) return cached;

  cached = isFirestoreConfigured()
    ? {
        games: new FirestoreGameRepository(),
        teams: new FirestoreTeamRepository(),
        questions: new FirestoreQuestionRepository(),
        scores: new FirestoreScoreRepository(),
      }
    : isGoogleSheetsConfigured()
      ? {
          games: new GoogleSheetsGameRepository(),
          teams: new GoogleSheetsTeamRepository(),
          questions: new GoogleSheetsQuestionRepository(),
          scores: new GoogleSheetsScoreRepository(),
        }
      : {
          games: new MemoryGameRepository(),
          teams: new MemoryTeamRepository(),
          questions: new MemoryQuestionRepository(),
          scores: new MemoryScoreRepository(),
        };

  return cached;
}
