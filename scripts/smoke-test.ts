/**
 * Smoke test manual do fluxo ponta a ponta usando o repositório em memória
 * (sem credenciais do Google Sheets). Rodar com: npx tsx scripts/smoke-test.ts
 */
import {
  createGame,
  addTeam,
  startGame,
  submitQuestionScores,
  getRoundSummary,
  getScoreboard,
  continueToNextRound,
  getLiveState,
} from '../api/_lib/services/game.service';

async function main() {
  const game = await createGame({
    name: 'Trivia Smoke Test',
    date: '2026-08-15',
    location: 'Bar XYZ',
    description: 'teste',
    gameType: 'POP_GERAIS',
    rounds: 2,
    questionsPerRound: 2,
  });
  console.log('game created', game.id, game.status);

  const teamA = await addTeam(game.id, { name: 'Os Inteligentes', playersCount: 5 });
  const teamB = await addTeam(game.id, { name: 'Sem Nome', playersCount: 4 });
  console.log('teams', teamA.name, teamB.name);

  const started = await startGame(game.id);
  console.log('started', started.status, started.currentRound, started.currentQuestion);

  let result = await submitQuestionScores(game.id, {
    round: 1,
    question: 1,
    scores: [
      { teamId: teamA.id, baseScore: 10, bonus: 0, penalty: 0 },
      { teamId: teamB.id, baseScore: 10, bonus: 5, penalty: 0 },
    ],
  });
  console.log('q1 ->', result.game.currentRound, result.game.currentQuestion, result.roundFinished);

  result = await submitQuestionScores(game.id, {
    round: 1,
    question: 2,
    scores: [
      { teamId: teamA.id, baseScore: 10, bonus: 0, penalty: 0 },
      { teamId: teamB.id, baseScore: 0, bonus: 0, penalty: -2 },
    ],
  });
  console.log('q2 ->', result.game.status, result.roundFinished);

  const summary = await getRoundSummary(game.id, 1);
  console.log('round summary', JSON.stringify(summary));

  const afterContinue = await continueToNextRound(game.id);
  console.log('continued to round', afterContinue.status, afterContinue.currentRound);

  const corrected = await submitQuestionScores(game.id, {
    round: 1,
    question: 2,
    scores: [
      { teamId: teamA.id, baseScore: 10, bonus: 0, penalty: 0 },
      { teamId: teamB.id, baseScore: 10, bonus: 0, penalty: 0 },
    ],
  });
  console.log('correction applied, scores count for q2:', corrected.scores.length);

  result = await submitQuestionScores(game.id, {
    round: 2,
    question: 1,
    scores: [
      { teamId: teamA.id, baseScore: 5, bonus: 0, penalty: 0 },
      { teamId: teamB.id, baseScore: 5, bonus: 0, penalty: 0 },
    ],
  });
  result = await submitQuestionScores(game.id, {
    round: 2,
    question: 2,
    scores: [
      { teamId: teamA.id, baseScore: 5, bonus: 0, penalty: 0 },
      { teamId: teamB.id, baseScore: 20, bonus: 0, penalty: 0 },
    ],
  });
  console.log('final ->', result.game.status, result.gameFinished);

  const scoreboard = await getScoreboard(game.id);
  console.log('scoreboard', JSON.stringify(scoreboard));

  const live = await getLiveState(game.id);
  console.log('live lastRegistered', live.lastRegistered);

  console.log('\nSMOKE TEST OK');
}

main().catch((err) => {
  console.error('SMOKE TEST FAILED', err);
  process.exit(1);
});
