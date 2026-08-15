import type { Game, NewGame } from '../../../../shared/domain/types';
import { newId, nowIso } from '../../ids';
import type { GameRepository } from '../types';
import { getFirestoreDb } from './client';

const COLLECTION = 'games';

/**
 * Repositório de jogos no Firestore — coleção `games/{gameId}`, um
 * documento por jogo com os mesmos campos do tipo `Game` (ao contrário do
 * Sheets, o Firestore guarda o objeto tipado direto, sem conversão
 * linha↔objeto). Usado como repositório ativo durante o jogo inteiro
 * (spec "Melhorias de armazenamento"); a cópia no Google Sheets só acontece
 * como backup ao finalizar (ver `services/backup.service.ts`).
 */
export class FirestoreGameRepository implements GameRepository {
  private get collection() {
    return getFirestoreDb().collection(COLLECTION);
  }

  async findAll(): Promise<Game[]> {
    const snap = await this.collection.orderBy('createdAt', 'desc').get();
    return snap.docs.map((doc) => doc.data() as Game);
  }

  async findById(id: string): Promise<Game | null> {
    const doc = await this.collection.doc(id).get();
    return doc.exists ? (doc.data() as Game) : null;
  }

  async create(game: NewGame): Promise<Game> {
    const now = nowIso();
    const full: Game = {
      ...game,
      id: newId(),
      status: 'CONFIGURACAO',
      currentRound: 1,
      currentQuestion: 1,
      createdAt: now,
      updatedAt: now,
    };
    await this.collection.doc(full.id).set(full);
    return full;
  }

  async update(id: string, patch: Partial<Game>): Promise<Game> {
    const current = await this.findById(id);
    if (!current) throw new Error(`Jogo não encontrado: ${id}`);
    const updated: Game = { ...current, ...patch, id, updatedAt: nowIso() };
    await this.collection.doc(id).set(updated);
    return updated;
  }

  /** `recursiveDelete` apaga o documento do jogo e todas as suas subcoleções
   * (`teams`, `questions`, `scores`) numa tacada só — sem isso elas ficariam
   * órfãs no Firestore, sem nenhum jogo pra referenciar. */
  async delete(id: string): Promise<void> {
    await getFirestoreDb().recursiveDelete(this.collection.doc(id));
  }
}
