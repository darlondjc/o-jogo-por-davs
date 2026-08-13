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
 * Fábrica de repositórios: usa Google Sheets quando as env vars estão
 * configuradas; caso contrário, cai para o repositório em memória com dados
 * de demonstração (spec seções 22 e 36). O restante do backend depende só
 * das interfaces em `./types`.
 */
export function getRepositories(): Repositories {
  if (cached) return cached;

  cached = isGoogleSheetsConfigured()
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
