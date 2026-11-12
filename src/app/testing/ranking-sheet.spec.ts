import { parseRankingRows, parseRankingSheet, parseScore } from '@shared/ranking-sheet';

describe('ranking da planilha', () => {
  it('pula o cabeçalho e ordena por pontuação', () => {
    const r = parseRankingRows([
      ['nome', 'pontuacao'],
      ['lambida', 90],
      ['bitches', '100'],
    ]);
    expect(r.map((e) => [e.name, e.score, e.position])).toEqual([
      ['bitches', 100, 1],
      ['lambida', 90, 2],
    ]);
  });

  it('dá a mesma posição em empate e pula a seguinte', () => {
    const r = parseRankingRows([['nome', 'pontuacao'], ['a', 90], ['b', 100], ['c', 90], ['d', 10]]);
    expect(r.map((e) => e.position)).toEqual([1, 2, 2, 4]);
  });

  it('ignora linha sem nome e trata pontuação vazia como 0', () => {
    const r = parseRankingRows([['nome', 'pontuacao'], ['', 50], ['x', ''], []]);
    expect(r).toEqual([{ name: 'x', score: 0, position: 1 }]);
  });

  it('entende número em formato brasileiro', () => {
    expect(parseScore('1.234,5')).toBe(1234.5);
    expect(parseScore('90,5')).toBe(90.5);
    expect(parseScore('-10')).toBe(-10);
    expect(parseScore('1,234.5')).toBe(1234.5);
    expect(parseScore('abc')).toBeNull();
  });

  describe('formato com rodadas', () => {
    const header = ['Nome da equipe', 'rodada 1', 'Rodada 2', 'rodada 3', 'Total'];

    it('lê o geral pela coluna "total", mesmo fora da coluna B', () => {
      const { total } = parseRankingSheet([header, ['a', 10, 5, '', 15], ['b', 20, 30, '', 50]]);
      expect(total.map((e) => [e.name, e.score, e.position])).toEqual([
        ['b', 50, 1],
        ['a', 15, 2],
      ]);
    });

    it('mostra todas as rodadas, marcando quais já começaram', () => {
      const { rounds } = parseRankingSheet([header, ['a', 10, '', '', 10], ['b', 20, '', '', 20]]);
      expect(rounds.map((r) => [r.number, r.started])).toEqual([
        [1, true],
        [2, false],
        [3, false],
      ]);
      expect(rounds[0].entries.map((e) => [e.name, e.position])).toEqual([
        ['b', 1],
        ['a', 2],
      ]);
    });

    it('rodada parcialmente preenchida: quem está vazio conta 0', () => {
      const { rounds } = parseRankingSheet([header, ['a', '', 7, '', 7], ['b', '', '', '', 0]]);
      expect(rounds[1].started).toBe(true);
      expect(rounds[1].entries).toEqual([
        { name: 'a', score: 7, position: 1 },
        { name: 'b', score: 0, position: 2 },
      ]);
    });

    it('ordena rodadas pelo número, não pela posição da coluna', () => {
      const { rounds } = parseRankingSheet([
        ['nome', 'rodada 2', 'rodada 1', 'total'],
        ['a', 1, 2, 3],
      ]);
      expect(rounds.map((r) => r.number)).toEqual([1, 2]);
    });

    it('sem nada preenchido: ninguém some do geral e nenhuma rodada começou', () => {
      const r = parseRankingSheet([header, ['a'], ['b']]);
      expect(r.total.map((e) => e.score)).toEqual([0, 0]);
      expect(r.rounds.map((x) => x.started)).toEqual([false, false, false]);
    });
  });
});
