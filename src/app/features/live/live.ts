import { Component, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { GameStateService } from '../../core/services/game-state.service';
import { ScoreEntry } from './score-entry/score-entry';
import { ScoreboardComponent } from '../scoreboard/scoreboard';
import { UserChip } from '../../core/components/user-chip/user-chip';
import type { Score, SubmitQuestionScoresRequest } from '../../core/models';

interface CorrectionTarget {
  round: number;
  question: number;
}

@Component({
  selector: 'app-live',
  imports: [RouterLink, ScoreEntry, ScoreboardComponent, UserChip],
  templateUrl: './live.html',
  styleUrl: './live.scss',
})
export class Live {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  protected readonly gameState = inject(GameStateService);

  readonly gameId = this.route.snapshot.paramMap.get('id')!;
  readonly loading = signal(true);
  readonly submitting = signal(false);
  readonly error = signal<string | null>(null);
  readonly justRegisteredQuestion = signal<number | null>(null);

  /** Resposta em andamento pro dialog "corrigir perguntas anteriores" (ver
   * `score-entry.ts`): busca as pontuações da pergunta escolhida e devolve
   * pro componente via `correctionData`. */
  readonly correctionData = signal<{ target: CorrectionTarget; scores: Score[] } | null>(null);

  constructor() {
    this.refresh();
  }

  async onCorrectionRequested(target: CorrectionTarget): Promise<void> {
    const scores = await this.gameState.getQuestionScores(this.gameId, target.round, target.question);
    this.correctionData.set({ target, scores });
  }

  private async refresh(): Promise<void> {
    const state = await this.gameState.loadLive(this.gameId);
    this.loading.set(false);
    if (this.gameState.notFound()) {
      await this.router.navigate(['/404']);
      return;
    }
    if (state?.game.status === 'RODADA_FINALIZADA') {
      await this.router.navigate(['/jogo', this.gameId, 'rodada', state.game.currentRound - 1]);
    }
  }

  async onSubmit(payload: SubmitQuestionScoresRequest): Promise<void> {
    this.submitting.set(true);
    this.error.set(null);
    try {
      const result = await this.gameState.submitQuestionScores(this.gameId, payload);
      this.justRegisteredQuestion.set(payload.question);
      setTimeout(() => this.justRegisteredQuestion.set(null), 1800);

      if (result.gameFinished) {
        await this.router.navigate(['/jogo', this.gameId, 'placar']);
        return;
      }
      if (result.roundFinished) {
        await this.router.navigate(['/jogo', this.gameId, 'rodada', payload.round]);
        return;
      }
      await this.refresh();
    } catch {
      this.error.set('Não foi possível registrar a pergunta. Tente novamente.');
    } finally {
      this.submitting.set(false);
    }
  }
}
