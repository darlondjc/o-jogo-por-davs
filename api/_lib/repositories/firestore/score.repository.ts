import type { Score } from '../../../../shared/domain/types';
import { newId, nowIso } from '../../ids';
import type { ScoreRepository, ScoreUpsertEntry } from '../types';
import { getFirestoreDb } from './client';

/** Coleção `games/{gameId}/scores/{round}-{question}-{teamId}` — id do
 * documento é a própria chave de idempotência (jogo+equipe+rodada+pergunta,
 * ver README "Idempotência e correção"), então `upsertMany` é um batch de
 * `set()`s diretos, sem ler a aba inteira pra achar cada linha como no
 * Sheets — é essa troca que deixa o lançamento de pontuação rápido. */
export class FirestoreScoreRepository implements ScoreRepository {
  private scoresCol(gameId: string) {
    return getFirestoreDb().collection('games').doc(gameId).collection('scores');
  }

  private docId(round: number, question: number, teamId: string): string {
    return `${round}-${question}-${teamId}`;
  }

  async findByGameId(gameId: string): Promise<Score[]> {
    const snap = await this.scoresCol(gameId).get();
    return snap.docs.map((doc) => doc.data() as Score);
  }

  async findByRound(gameId: string, round: number): Promise<Score[]> {
    const snap = await this.scoresCol(gameId).where('round', '==', round).get();
    return snap.docs.map((doc) => doc.data() as Score);
  }

  async findByQuestion(gameId: string, round: number, question: number): Promise<Score[]> {
    const snap = await this.scoresCol(gameId)
      .where('round', '==', round)
      .where('question', '==', question)
      .get();
    return snap.docs.map((doc) => doc.data() as Score);
  }

  async upsertMany(
    gameId: string,
    round: number,
    question: number,
    entries: ScoreUpsertEntry[],
  ): Promise<Score[]> {
    const now = nowIso();
    const existingForQuestion = await this.findByQuestion(gameId, round, question);
    const existingByTeam = new Map(existingForQuestion.map((s) => [s.teamId, s]));

    const col = this.scoresCol(gameId);
    const batch = getFirestoreDb().batch();
    const result: Score[] = [];

    for (const entry of entries) {
      const existing = existingByTeam.get(entry.teamId);
      const score: Score = existing
        ? {
            ...existing,
            baseScore: entry.baseScore,
            bonus: entry.bonus,
            penalty: entry.penalty,
            total: entry.total,
            updatedAt: now,
            version: existing.version + 1,
          }
        : {
            id: newId(),
            gameId,
            teamId: entry.teamId,
            round,
            question,
            baseScore: entry.baseScore,
            bonus: entry.bonus,
            penalty: entry.penalty,
            total: entry.total,
            createdAt: now,
            updatedAt: now,
            version: 1,
          };
      batch.set(col.doc(this.docId(round, question, entry.teamId)), score);
      result.push(score);
    }

    await batch.commit();
    return result;
  }

  async findLastRegisteredQuestion(
    gameId: string,
  ): Promise<{ round: number; question: number } | null> {
    const scores = await this.findByGameId(gameId);
    if (!scores.length) return null;
    let last = { round: scores[0].round, question: scores[0].question };
    for (const s of scores) {
      if (s.round > last.round || (s.round === last.round && s.question > last.question)) {
        last = { round: s.round, question: s.question };
      }
    }
    return last;
  }
}
