import {
  advanceAfterQuestion,
  computeFinalScore,
  computeOverallTotals,
  computeRanking,
  computeRoundTotals,
  validateQuestionScores,
} from '@shared/scoring';
import type { Score } from '@shared/domain/types';

function makeScore(partial: Partial<Score>): Score {
  return {
    id: 's1',
    gameId: 'g1',
    teamId: 't1',
    round: 1,
    question: 1,
    baseScore: 0,
    bonus: 0,
    penalty: 0,
    total: 0,
    createdAt: '',
    updatedAt: '',
    version: 1,
    ...partial,
  };
}

describe('computeFinalScore', () => {
  it('soma base + bonus + penalidade', () => {
    expect(computeFinalScore({ baseScore: 10, bonus: 5, penalty: -2 })).toBe(13);
  });

  it('aceita apenas penalidade', () => {
    expect(computeFinalScore({ baseScore: 0, bonus: 0, penalty: -2 })).toBe(-2);
  });
});

describe('computeRoundTotals', () => {
  it('soma somente perguntas da rodada informada, por equipe', () => {
    const scores: Score[] = [
      makeScore({ teamId: 'A', round: 1, total: 10 }),
      makeScore({ teamId: 'A', round: 1, total: 5 }),
      makeScore({ teamId: 'A', round: 2, total: 100 }),
      makeScore({ teamId: 'B', round: 1, total: 7 }),
    ];
    const totals = computeRoundTotals(scores, 1);
    expect(totals.find((t) => t.teamId === 'A')?.total).toBe(15);
    expect(totals.find((t) => t.teamId === 'B')?.total).toBe(7);
  });
});

describe('computeOverallTotals', () => {
  it('soma todas as rodadas por equipe', () => {
    const scores: Score[] = [
      makeScore({ teamId: 'A', round: 1, total: 10 }),
      makeScore({ teamId: 'A', round: 2, total: 20 }),
      makeScore({ teamId: 'B', round: 1, total: 5 }),
    ];
    const totals = computeOverallTotals(scores);
    expect(totals.find((t) => t.teamId === 'A')?.total).toBe(30);
    expect(totals.find((t) => t.teamId === 'B')?.total).toBe(5);
  });

  it('inclui equipes sem nenhuma pontuação lançada quando knownTeamIds é informado', () => {
    // Regressão: jogo recém-criado, nenhuma pontuação ainda — sem isso as
    // equipes somem do ranking e caem no fallback "último lugar" pra todo
    // mundo (bug visual: "②" em todas as equipes no placar geral).
    const totals = computeOverallTotals([], ['A', 'B']);
    expect(totals).toEqual([
      { teamId: 'A', total: 0 },
      { teamId: 'B', total: 0 },
    ]);
  });
});

describe('computeRanking', () => {
  it('ordena por total decrescente', () => {
    const ranking = computeRanking([
      { teamId: 'A', total: 10 },
      { teamId: 'B', total: 30 },
      { teamId: 'C', total: 20 },
    ]);
    expect(ranking.map((r) => r.teamId)).toEqual(['B', 'C', 'A']);
    expect(ranking.map((r) => r.position)).toEqual([1, 2, 3]);
  });

  it('mantém equipes empatadas na mesma posição', () => {
    const ranking = computeRanking([
      { teamId: 'A', total: 20 },
      { teamId: 'B', total: 20 },
      { teamId: 'C', total: 10 },
    ]);
    expect(ranking.find((r) => r.teamId === 'A')?.position).toBe(1);
    expect(ranking.find((r) => r.teamId === 'B')?.position).toBe(1);
    expect(ranking.find((r) => r.teamId === 'C')?.position).toBe(3);
  });

  it('aponta posição anterior para indicar variação', () => {
    const ranking = computeRanking(
      [
        { teamId: 'A', total: 20 },
        { teamId: 'B', total: 10 },
      ],
      [
        { teamId: 'A', total: 5 },
        { teamId: 'B', total: 15 },
      ],
    );
    expect(ranking.find((r) => r.teamId === 'A')?.previousPosition).toBe(2);
    expect(ranking.find((r) => r.teamId === 'B')?.previousPosition).toBe(1);
  });
});

describe('advanceAfterQuestion', () => {
  it('avança para a próxima pergunta dentro da rodada', () => {
    const result = advanceAfterQuestion({ round: 1, question: 5, rounds: 3, questionsPerRound: 20 });
    expect(result).toEqual({ round: 1, question: 6, roundFinished: false, gameFinished: false });
  });

  it('avança para a próxima rodada ao terminar as perguntas', () => {
    const result = advanceAfterQuestion({ round: 1, question: 20, rounds: 3, questionsPerRound: 20 });
    expect(result).toEqual({ round: 2, question: 1, roundFinished: true, gameFinished: false });
  });

  it('sinaliza fim de jogo na última pergunta da última rodada', () => {
    const result = advanceAfterQuestion({ round: 3, question: 20, rounds: 3, questionsPerRound: 20 });
    expect(result).toEqual({ round: 3, question: 20, roundFinished: true, gameFinished: true });
  });
});

describe('validateQuestionScores', () => {
  const base = {
    rounds: 3,
    questionsPerRound: 20,
    knownTeamIds: ['A', 'B'],
  };

  it('aceita payload válido', () => {
    const errors = validateQuestionScores({
      ...base,
      round: 1,
      question: 1,
      scores: [{ teamId: 'A', baseScore: 10, bonus: 0, penalty: 0 }],
    });
    expect(errors).toEqual([]);
  });

  it('rejeita rodada fora do intervalo', () => {
    const errors = validateQuestionScores({
      ...base,
      round: 5,
      question: 1,
      scores: [{ teamId: 'A', baseScore: 10, bonus: 0, penalty: 0 }],
    });
    expect(errors.some((e) => e.field === 'round')).toBeTrue();
  });

  it('rejeita equipe desconhecida', () => {
    const errors = validateQuestionScores({
      ...base,
      round: 1,
      question: 1,
      scores: [{ teamId: 'Z', baseScore: 10, bonus: 0, penalty: 0 }],
    });
    expect(errors.some((e) => e.field === 'scores')).toBeTrue();
  });

  it('rejeita payload sem equipes', () => {
    const errors = validateQuestionScores({ ...base, round: 1, question: 1, scores: [] });
    expect(errors.some((e) => e.field === 'scores')).toBeTrue();
  });
});
