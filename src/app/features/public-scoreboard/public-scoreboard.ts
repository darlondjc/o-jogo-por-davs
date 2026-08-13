import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { ActivatedRoute, Router } from '@angular/router';
import { ApiService } from '../../core/services/api.service';
import { ScoreboardComponent } from '../scoreboard/scoreboard';
import type { Scoreboard } from '../../core/models';

const POLL_INTERVAL_MS = 3000;

interface RoundRow {
  teamId: string;
  teamName: string;
  total: number;
}

/**
 * Placar público (spec seção 19). Sem login, mobile-first, atualizado por
 * polling (não fala com o Google Sheets diretamente — passa pela API, que
 * mantém um cache curto).
 */
@Component({
  selector: 'app-public-scoreboard',
  imports: [ScoreboardComponent],
  templateUrl: './public-scoreboard.html',
  styleUrl: './public-scoreboard.scss',
})
export class PublicScoreboard {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly api = inject(ApiService);
  private readonly destroyRef = inject(DestroyRef);

  readonly gameId = this.route.snapshot.paramMap.get('id')!;
  readonly scoreboard = signal<Scoreboard | null>(null);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);

  /**
   * O placar público atualiza sozinho a cada 3s sem nenhuma ação do
   * usuário — sem um sinal de "isso está vivo", quem está com o celular
   * na mão não tem como distinguir "parou de atualizar" de "ninguém
   * pontuou ainda". `lastSuccessAt` + `now` (que só existe pra forçar o
   * computed abaixo a recalcular a cada segundo) resolvem isso.
   */
  private readonly lastSuccessAt = signal(Date.now());
  private readonly now = signal(Date.now());
  readonly secondsSinceUpdate = computed(() => Math.floor((this.now() - this.lastSuccessAt()) / 1000));
  readonly stale = computed(() => this.secondsSinceUpdate() > 3 * (POLL_INTERVAL_MS / 1000));

  readonly roundRows = computed<RoundRow[]>(() => {
    const board = this.scoreboard();
    if (!board) return [];
    return [...board.entries]
      .sort((a, b) => b.roundTotal - a.roundTotal)
      .map((e) => ({ teamId: e.teamId, teamName: e.teamName, total: e.roundTotal }));
  });

  private pollTimer?: ReturnType<typeof setInterval>;
  private clockTimer?: ReturnType<typeof setInterval>;

  constructor() {
    this.poll();
    this.pollTimer = setInterval(() => this.poll(), POLL_INTERVAL_MS);
    this.clockTimer = setInterval(() => this.now.set(Date.now()), 1000);
    this.destroyRef.onDestroy(() => {
      clearInterval(this.pollTimer);
      clearInterval(this.clockTimer);
    });
  }

  private poll(): void {
    this.api.getScoreboard(this.gameId).subscribe({
      next: (scoreboard) => {
        this.scoreboard.set(scoreboard);
        this.loading.set(false);
        this.error.set(null);
        this.lastSuccessAt.set(Date.now());
        this.now.set(Date.now());

        // Jogo acabou: o placar não muda mais, então não há motivo pra
        // continuar batendo na API a cada 3s.
        if (scoreboard.status === 'FINALIZADO') {
          clearInterval(this.pollTimer);
          clearInterval(this.clockTimer);
        }
      },
      error: (err: unknown) => {
        this.loading.set(false);

        if (err instanceof HttpErrorResponse && err.status === 404) {
          clearInterval(this.pollTimer);
          clearInterval(this.clockTimer);
          this.router.navigate(['/404']);
          return;
        }

        // Não some com o placar já carregado — só sinaliza que ele pode
        // estar desatualizado. Some silenciosamente é o que mais confunde
        // quem está acompanhando ao vivo.
        this.error.set('Não foi possível atualizar o placar.');
      },
    });
  }
}
