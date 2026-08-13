import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import type {
  Game,
  NewGame,
  NewTeam,
  RoundSummary,
  Score,
  Scoreboard,
  SubmitQuestionScoresRequest,
  Team,
} from '../models';

export interface LiveState {
  game: Game;
  teams: Team[];
  scoreboard: Scoreboard;
  previousQuestionScores: Score[];
  lastRegistered: { round: number; question: number } | null;
}

export interface SubmitScoresResult {
  game: Game;
  scores: Score[];
  roundFinished: boolean;
  gameFinished: boolean;
  roundSummary: RoundSummary | null;
}

/**
 * Fina camada sobre HttpClient para a API serverless em `/api`. Nenhum
 * componente conhece detalhes de endpoint/rota diretamente.
 */
@Injectable({ providedIn: 'root' })
export class ApiService {
  private readonly http = inject(HttpClient);
  private readonly base = '/api/games';

  listGames(): Observable<Game[]> {
    return this.http.get<{ games: Game[] }>(this.base).pipe(map((r) => r.games));
  }

  getGame(id: string): Observable<Game> {
    return this.http.get<{ game: Game }>(`${this.base}/${id}`).pipe(map((r) => r.game));
  }

  createGame(payload: NewGame): Observable<Game> {
    return this.http.post<{ game: Game }>(this.base, payload).pipe(map((r) => r.game));
  }

  updateGame(id: string, patch: Partial<NewGame>): Observable<Game> {
    return this.http.put<{ game: Game }>(`${this.base}/${id}`, patch).pipe(map((r) => r.game));
  }

  listTeams(gameId: string): Observable<Team[]> {
    return this.http
      .get<{ teams: Team[] }>(`${this.base}/${gameId}/teams`)
      .pipe(map((r) => r.teams));
  }

  addTeam(gameId: string, payload: NewTeam): Observable<Team> {
    return this.http
      .post<{ team: Team }>(`${this.base}/${gameId}/teams`, payload)
      .pipe(map((r) => r.team));
  }

  updateTeam(gameId: string, teamId: string, patch: Partial<NewTeam>): Observable<Team> {
    return this.http
      .put<{ team: Team }>(`${this.base}/${gameId}/teams/${teamId}`, patch)
      .pipe(map((r) => r.team));
  }

  deleteTeam(gameId: string, teamId: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/${gameId}/teams/${teamId}`);
  }

  startGame(gameId: string): Observable<Game> {
    return this.http
      .post<{ game: Game }>(`${this.base}/${gameId}/start`, {})
      .pipe(map((r) => r.game));
  }

  finishGame(gameId: string): Observable<Game> {
    return this.http
      .post<{ game: Game }>(`${this.base}/${gameId}/finish`, {})
      .pipe(map((r) => r.game));
  }

  continueToNextRound(gameId: string): Observable<Game> {
    return this.http
      .post<{ game: Game }>(`${this.base}/${gameId}/continue`, {})
      .pipe(map((r) => r.game));
  }

  getLiveState(gameId: string): Observable<LiveState> {
    return this.http.get<LiveState>(`${this.base}/${gameId}/live`);
  }

  submitQuestionScores(
    gameId: string,
    payload: SubmitQuestionScoresRequest,
  ): Observable<SubmitScoresResult> {
    return this.http.post<SubmitScoresResult>(`${this.base}/${gameId}/scores`, payload);
  }

  correctScore(
    gameId: string,
    scoreId: string,
    patch: { baseScore: number; bonus: number; penalty: number },
  ): Observable<Score> {
    return this.http
      .put<{ score: Score }>(`${this.base}/${gameId}/scores/${scoreId}`, patch)
      .pipe(map((r) => r.score));
  }

  getRoundSummary(gameId: string, round: number): Observable<RoundSummary> {
    return this.http
      .get<{ summary: RoundSummary }>(`${this.base}/${gameId}/rounds/${round}/summary`)
      .pipe(map((r) => r.summary));
  }

  getScoreboard(gameId: string): Observable<Scoreboard> {
    return this.http
      .get<{ scoreboard: Scoreboard }>(`${this.base}/${gameId}/scoreboard`)
      .pipe(map((r) => r.scoreboard));
  }
}
