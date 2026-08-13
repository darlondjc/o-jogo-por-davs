import type { Question } from '../../../../shared/domain/types';
import { newId, nowIso } from '../../ids';
import type { QuestionRepository } from '../types';
import { getFirestoreDb } from './client';

/** Coleção `games/{gameId}/questions/{round}-{number}` — o id do documento
 * já é a chave natural (rodada+número), então `upsertRegistered` é um
 * `set()` único, sem precisar ler tudo pra achar a linha certa como no
 * Sheets. */
export class FirestoreQuestionRepository implements QuestionRepository {
  private questionsCol(gameId: string) {
    return getFirestoreDb().collection('games').doc(gameId).collection('questions');
  }

  private docId(round: number, number: number): string {
    return `${round}-${number}`;
  }

  async findByGameId(gameId: string): Promise<Question[]> {
    const snap = await this.questionsCol(gameId).get();
    return snap.docs.map((doc) => doc.data() as Question);
  }

  async findOne(gameId: string, round: number, number: number): Promise<Question | null> {
    const doc = await this.questionsCol(gameId).doc(this.docId(round, number)).get();
    return doc.exists ? (doc.data() as Question) : null;
  }

  async upsertRegistered(gameId: string, round: number, number: number): Promise<Question> {
    const existing = await this.findOne(gameId, round, number);
    const now = nowIso();
    const question: Question = existing
      ? { ...existing, updatedAt: now }
      : { id: newId(), gameId, round, number, status: 'REGISTRADA', createdAt: now, updatedAt: now };
    await this.questionsCol(gameId).doc(this.docId(round, number)).set(question);
    return question;
  }
}
