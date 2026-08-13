import { isFirestoreConfigured } from '../repositories/firestore/client';
import { isGoogleSheetsConfigured } from '../repositories/google-sheets/client';
import { GoogleSheetsGameRepository } from '../repositories/google-sheets/game.repository';
import { GoogleSheetsQuestionRepository } from '../repositories/google-sheets/question.repository';
import { GoogleSheetsScoreRepository } from '../repositories/google-sheets/score.repository';
import { GoogleSheetsTeamRepository } from '../repositories/google-sheets/team.repository';
import { getRepositories } from '../repositories';

/**
 * Backup de arquivo no Google Sheets, feito uma única vez quando um jogo é
 * finalizado (spec "Melhorias de armazenamento"): durante o jogo inteiro,
 * leitura e escrita acontecem só no Firestore (rápido); ao finalizar, o
 * jogo completo é copiado de uma vez pro Sheets, como backup/arquivo. A
 * aplicação nunca volta a ler do Sheets depois disso — continua lendo do
 * Firestore normalmente, que já tem os dados.
 *
 * Só roda quando o Firestore é o repositório ativo (senão o Sheets já É o
 * repositório ativo, e copiar dele pra ele mesmo duplicaria tudo) e as
 * credenciais do Sheets também estão configuradas. Best-effort: uma falha
 * aqui nunca impede o jogo de ser finalizado — só fica registrada no log.
 */
export async function backupFinishedGameToSheets(gameId: string): Promise<void> {
  if (!isFirestoreConfigured() || !isGoogleSheetsConfigured()) return;

  try {
    const active = getRepositories();
    const [game, teams, questions, scores] = await Promise.all([
      active.games.findById(gameId),
      active.teams.findByGameId(gameId),
      active.questions.findByGameId(gameId),
      active.scores.findByGameId(gameId),
    ]);
    if (!game) return;

    const sheetsGames = new GoogleSheetsGameRepository();
    const sheetsTeams = new GoogleSheetsTeamRepository();
    const sheetsQuestions = new GoogleSheetsQuestionRepository();
    const sheetsScores = new GoogleSheetsScoreRepository();

    await sheetsGames.importRecord(game);
    for (const team of teams) await sheetsTeams.importRecord(team);
    for (const question of questions) await sheetsQuestions.importRecord(question);
    for (const score of scores) await sheetsScores.importRecord(score);
  } catch (err) {
    // Backup é best-effort — jamais deve derrubar a finalização do jogo.
    // eslint-disable-next-line no-console
    console.error(`Falha ao gravar backup do jogo ${gameId} no Google Sheets:`, err);
  }
}
