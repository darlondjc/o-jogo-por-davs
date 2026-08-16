import { isFirestoreConfigured } from '../repositories/firestore/client';
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
  if (!isFirestoreConfigured()) return;

  try {
    // `isGoogleSheetsConfigured` e as classes do repositório do Sheets só
    // são importadas aqui dentro, dinamicamente — e só depois de já saber
    // que o Firestore está ativo (o caminho comum em produção). Um import
    // estático no topo do arquivo, mesmo só da função de checagem, traria
    // o `googleapis` (o SDK inteiro do Google) pro bundle desta função
    // mesmo nos jogos em andamento, quando o backup nem chega a rodar.
    const { isGoogleSheetsConfigured } = await import('../repositories/google-sheets/client');
    if (!isGoogleSheetsConfigured()) return;

    const active = await getRepositories();
    const [game, teams, questions, scores] = await Promise.all([
      active.games.findById(gameId),
      active.teams.findByGameId(gameId),
      active.questions.findByGameId(gameId),
      active.scores.findByGameId(gameId),
    ]);
    if (!game) return;

    const [
      { GoogleSheetsGameRepository },
      { GoogleSheetsTeamRepository },
      { GoogleSheetsQuestionRepository },
      { GoogleSheetsScoreRepository },
    ] = await Promise.all([
      import('../repositories/google-sheets/game.repository'),
      import('../repositories/google-sheets/team.repository'),
      import('../repositories/google-sheets/question.repository'),
      import('../repositories/google-sheets/score.repository'),
    ]);

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
