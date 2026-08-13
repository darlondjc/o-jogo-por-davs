import { Component, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { GameStateService } from '../../core/services/game-state.service';
import { ScoreEntry } from './score-entry/score-entry';
import { ScoreboardComponent } from '../scoreboard/scoreboard';
import type { SubmitQuestionScoresRequest } from '../../core/models';

@Component({
  selector: 'app-live',
  imports: [RouterLink, ScoreEntry, ScoreboardComponent],
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

  constructor() {
    this.refresh();
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
