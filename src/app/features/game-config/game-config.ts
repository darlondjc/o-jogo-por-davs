import { Component, inject, signal } from '@angular/core';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { GameStateService } from '../../core/services/game-state.service';
import { GAME_TYPE_OPTIONS, teamColor } from '../../core/models';
import type { GameType, Team } from '../../core/models';

@Component({
  selector: 'app-game-config',
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './game-config.html',
  styleUrl: './game-config.scss',
})
export class GameConfig {
  private readonly fb = inject(FormBuilder);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  protected readonly gameState = inject(GameStateService);

  readonly gameId = this.route.snapshot.paramMap.get('id')!;
  readonly savingGame = signal(false);
  readonly savingTeam = signal(false);
  readonly error = signal<string | null>(null);
  readonly editingTeamId = signal<string | null>(null);
  readonly gameTypeOptions = GAME_TYPE_OPTIONS;
  readonly gameSubmitted = signal(false);
  readonly teamSubmitted = signal(false);

  readonly gameForm = this.fb.nonNullable.group({
    name: ['', Validators.required],
    date: ['', Validators.required],
    location: ['', Validators.required],
    description: [''],
    gameType: ['POP_GERAIS' as GameType, Validators.required],
    rounds: [3, [Validators.required, Validators.min(1)]],
    questionsPerRound: [20, [Validators.required, Validators.min(1)]],
  });

  readonly teamForm = this.fb.nonNullable.group({
    name: ['', Validators.required],
    playersCount: [4, [Validators.required, Validators.min(0)]],
  });

  constructor() {
    this.gameState.loadGame(this.gameId).then(() => {
      if (this.gameState.notFound()) {
        this.router.navigate(['/404']);
        return;
      }
      const game = this.gameState.game();
      if (game) {
        this.gameForm.patchValue({
          name: game.name,
          date: game.date,
          location: game.location,
          description: game.description ?? '',
          gameType: game.gameType,
          rounds: game.rounds,
          questionsPerRound: game.questionsPerRound,
        });
      }
    });
  }

  teamColor(order: number): string {
    return teamColor(order);
  }

  async saveGame(): Promise<void> {
    this.gameSubmitted.set(true);
    if (this.gameForm.invalid) {
      this.gameForm.markAllAsTouched();
      this.error.set('Preencha os campos obrigatórios destacados abaixo.');
      return;
    }
    this.savingGame.set(true);
    this.error.set(null);
    try {
      const value = this.gameForm.getRawValue();
      await this.gameState.updateGame(this.gameId, {
        name: value.name,
        date: value.date,
        location: value.location,
        description: value.description || undefined,
        gameType: value.gameType,
        rounds: value.rounds,
        questionsPerRound: value.questionsPerRound,
      });
    } catch {
      this.error.set('Não foi possível salvar as configurações.');
    } finally {
      this.savingGame.set(false);
    }
  }

  startEditTeam(team: Team): void {
    this.editingTeamId.set(team.id);
    this.teamForm.setValue({ name: team.name, playersCount: team.playersCount });
  }

  cancelEditTeam(): void {
    this.editingTeamId.set(null);
    this.teamSubmitted.set(false);
    this.teamForm.reset({ name: '', playersCount: 4 });
  }

  async submitTeam(): Promise<void> {
    this.teamSubmitted.set(true);
    if (this.teamForm.invalid) {
      this.teamForm.markAllAsTouched();
      this.error.set('Preencha os campos obrigatórios da equipe.');
      return;
    }
    this.savingTeam.set(true);
    this.error.set(null);
    try {
      const value = this.teamForm.getRawValue();
      const editingId = this.editingTeamId();
      if (editingId) {
        await this.gameState.updateTeam(this.gameId, editingId, value);
      } else {
        await this.gameState.addTeam(this.gameId, value);
      }
      this.cancelEditTeam();
    } catch {
      this.error.set('Não foi possível salvar a equipe.');
    } finally {
      this.savingTeam.set(false);
    }
  }

  async removeTeam(teamId: string): Promise<void> {
    try {
      await this.gameState.deleteTeam(this.gameId, teamId);
    } catch {
      this.error.set('Não foi possível remover a equipe.');
    }
  }

  async moveTeam(team: Team, direction: -1 | 1): Promise<void> {
    const teams = [...this.gameState.teams()].sort((a, b) => a.order - b.order);
    const index = teams.findIndex((t) => t.id === team.id);
    const swapIndex = index + direction;
    if (swapIndex < 0 || swapIndex >= teams.length) return;
    const other = teams[swapIndex];
    await Promise.all([
      this.gameState.updateTeam(this.gameId, team.id, { order: other.order }),
      this.gameState.updateTeam(this.gameId, other.id, { order: team.order }),
    ]);
  }

  goToGame(): void {
    this.router.navigate(['/jogo', this.gameId]);
  }
}
