import { Component, inject, signal } from '@angular/core';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { GameStateService } from '../../core/services/game-state.service';
import { GAME_TYPE_OPTIONS } from '../../core/models';
import type { GameType } from '../../core/models';

function todayIsoDate(): string {
  const now = new Date();
  const offsetMs = now.getTimezoneOffset() * 60_000;
  return new Date(now.getTime() - offsetMs).toISOString().slice(0, 10);
}

@Component({
  selector: 'app-game-form',
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './game-form.html',
  styleUrl: './game-form.scss',
})
export class GameForm {
  private readonly fb = inject(FormBuilder);
  private readonly gameState = inject(GameStateService);
  private readonly router = inject(Router);

  readonly saving = signal(false);
  readonly error = signal<string | null>(null);
  readonly submitted = signal(false);
  readonly gameTypeOptions = GAME_TYPE_OPTIONS;

  readonly form = this.fb.nonNullable.group({
    name: ['', Validators.required],
    date: [todayIsoDate(), Validators.required],
    location: ['', Validators.required],
    description: [''],
    gameType: ['POP_GERAIS' as GameType, Validators.required],
    rounds: [3, [Validators.required, Validators.min(1)]],
    questionsPerRound: [20, [Validators.required, Validators.min(1)]],
  });

  async submit(): Promise<void> {
    this.submitted.set(true);
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.error.set('Preencha os campos obrigatórios destacados abaixo.');
      return;
    }
    this.saving.set(true);
    this.error.set(null);
    try {
      const value = this.form.getRawValue();
      const game = await this.gameState.createGame({
        name: value.name,
        date: value.date,
        location: value.location,
        description: value.description || undefined,
        gameType: value.gameType,
        rounds: value.rounds,
        questionsPerRound: value.questionsPerRound,
      });
      await this.router.navigate(['/jogo', game.id, 'configuracao']);
    } catch {
      this.error.set('Não foi possível criar o jogo. Tente novamente.');
    } finally {
      this.saving.set(false);
    }
  }
}
