import { Injectable, inject, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { ApiService, type LiveState, type RegisteredQuestion } from './api.service';
import type {
  Game,
  NewGame,
  NewTeam,
  RoundSummary,
  Scoreboard,
  Score,
  SubmitQuestionScoresRequest,
  Team,
} from '../models';

/**
 * Estado de sessão do jogo corrente, em Signals. Evita recarregar o app
 * inteiro a cada ação (spec seção 29): as telas chamam métodos aqui, que
 * atualizam somente os signals afetados.
 */
@Injectable({ providedIn: 'root' })
export class GameStateService {
  private readonly api = inject(ApiService);

  readonly game = signal<Game | null>(null);
  readonly teams = signal<Team[]>([]);
  readonly scoreboard = signal<Scoreboard | null>(null);
  readonly previousQuestionScores = signal<Score[]>([]);
  readonly lastRegistered = signal<{ round: number; question: number } | null>(null);
  readonly registeredQuestions = signal<RegisteredQuestion[]>([]);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  /** Id da rota não corresponde a nenhum jogo (API respondeu 404) — telas
   * que carregam um jogo por id checam isso pra mostrar "Jogo não
   * encontrado" em vez de ficar presas em "Carregando…" pra sempre. */
  readonly notFound = signal(false);

  async loadGame(gameId: string): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    this.notFound.set(false);
    try {
      const [game, teams] = await Promise.all([
        firstValueFrom(this.api.getGame(gameId)),
        firstValueFrom(this.api.listTeams(gameId)),
      ]);
      this.game.set(game);
      this.teams.set(teams);
    } catch (err) {
      if (err instanceof HttpErrorResponse && err.status === 404) {
        this.notFound.set(true);
      } else {
        this.error.set('Não foi possível carregar o jogo.');
      }
    } finally {
      this.loading.set(false);
    }
  }

  async loadLive(gameId: string): Promise<LiveState | null> {
    this.loading.set(true);
    this.error.set(null);
    this.notFound.set(false);
    try {
      const state = await firstValueFrom(this.api.getLiveState(gameId));
      this.game.set(state.game);
      this.teams.set(state.teams);
      this.scoreboard.set(state.scoreboard);
      this.previousQuestionScores.set(state.previousQuestionScores);
      this.lastRegistered.set(state.lastRegistered);
      this.registeredQuestions.set(state.registeredQuestions);
      return state;
    } catch (err) {
      if (err instanceof HttpErrorResponse && err.status === 404) {
        this.notFound.set(true);
      } else {
        this.error.set('Não foi possível carregar o estado ao vivo.');
      }
      return null;
    } finally {
      this.loading.set(false);
    }
  }

  async loadScoreboard(gameId: string): Promise<void> {
    try {
      const scoreboard = await firstValueFrom(this.api.getScoreboard(gameId));
      this.scoreboard.set(scoreboard);
    } catch {
      this.error.set('Não foi possível carregar o placar.');
    }
  }

  async createGame(payload: NewGame): Promise<Game> {
    const game = await firstValueFrom(this.api.createGame(payload));
    this.game.set(game);
    return game;
  }

  async updateGame(gameId: string, patch: Partial<NewGame>): Promise<Game> {
    const game = await firstValueFrom(this.api.updateGame(gameId, patch));
    this.game.set(game);
    return game;
  }

  async addTeam(gameId: string, payload: NewTeam): Promise<Team> {
    const team = await firstValueFrom(this.api.addTeam(gameId, payload));
    this.teams.update((teams) => [...teams, team].sort((a, b) => a.order - b.order));
    return team;
  }

  async updateTeam(gameId: string, teamId: string, patch: Partial<NewTeam>): Promise<Team> {
    const team = await firstValueFrom(this.api.updateTeam(gameId, teamId, patch));
    this.teams.update((teams) =>
      teams.map((t) => (t.id === teamId ? team : t)).sort((a, b) => a.order - b.order),
    );
    return team;
  }

  async deleteTeam(gameId: string, teamId: string): Promise<void> {
    await firstValueFrom(this.api.deleteTeam(gameId, teamId));
    this.teams.update((teams) => teams.filter((t) => t.id !== teamId));
  }

  async startGame(gameId: string): Promise<Game> {
    const game = await firstValueFrom(this.api.startGame(gameId));
    this.game.set(game);
    return game;
  }

  async finishGame(gameId: string): Promise<Game> {
    const game = await firstValueFrom(this.api.finishGame(gameId));
    this.game.set(game);
    return game;
  }

  async continueToNextRound(gameId: string): Promise<Game> {
    const game = await firstValueFrom(this.api.continueToNextRound(gameId));
    this.game.set(game);
    return game;
  }

  async submitQuestionScores(gameId: string, payload: SubmitQuestionScoresRequest) {
    const result = await firstValueFrom(this.api.submitQuestionScores(gameId, payload));
    this.game.set(result.game);
    return result;
  }

  async getRoundSummary(gameId: string, round: number): Promise<RoundSummary> {
    return firstValueFrom(this.api.getRoundSummary(gameId, round));
  }

  /** Pontuações já registradas de uma pergunta específica — usado pelo
   * dialog "corrigir perguntas anteriores" da tela ao vivo. */
  async getQuestionScores(gameId: string, round: number, question: number): Promise<Score[]> {
    return firstValueFrom(this.api.getQuestionScores(gameId, round, question));
  }
}
