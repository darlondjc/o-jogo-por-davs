import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { ActivatedRoute, Router } from '@angular/router';
import { ApiService } from '../../core/services/api.service';
import { ScoreboardComponent } from '../scoreboard/scoreboard';
import type { Scoreboard } from '../../core/models';

const POLL_INTERVAL_MS = 3000;
/** Enquanto o jogo ainda não começou não há nada novo pra mostrar a cada 3s
 * — só precisa descobrir quando ele começa, então o polling fica bem mais
 * espaçado (spec: "quando o jogo ainda não iniciou" deve parar de ficar
 * requisitando, igual já acontece com o jogo finalizado). */
const WAITING_POLL_INTERVAL_MS = 15000;

interface RoundRow {
  teamId: string;
  teamName: string;
  total: number;
  position: number;
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
      .map((e, i) => ({ teamId: e.teamId, teamName: e.teamName, total: e.roundTotal, position: i + 1 }));
  });

  /** Seção "Placar geral" pode ser fechada pra dar mais espaço à rodada
   * atual (spec public-scoreboard) — fechada, o `app-scoreboard` nem fica
   * no DOM, então a animação de ultrapassagem simplesmente não roda
   * enquanto ninguém está olhando pra ela. */
  readonly boardCollapsed = signal(false);

  toggleBoard(): void {
    this.boardCollapsed.update((v) => !v);
  }

  private pollTimer?: ReturnType<typeof setTimeout>;
  private clockTimer?: ReturnType<typeof setInterval>;

  constructor() {
    this.poll();
    this.clockTimer = setInterval(() => this.now.set(Date.now()), 1000);
    this.destroyRef.onDestroy(() => {
      clearTimeout(this.pollTimer);
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
        this.scheduleNextPoll(scoreboard.status);
      },
      error: (err: unknown) => {
        this.loading.set(false);

        if (err instanceof HttpErrorResponse && err.status === 404) {
          clearTimeout(this.pollTimer);
          clearInterval(this.clockTimer);
          this.router.navigate(['/404']);
          return;
        }

        // Não some com o placar já carregado — só sinaliza que ele pode
        // estar desatualizado. Some silenciosamente é o que mais confunde
        // quem está acompanhando ao vivo.
        this.error.set('Não foi possível atualizar o placar.');
        this.scheduleNextPoll(this.scoreboard()?.status ?? 'EM_ANDAMENTO');
      },
    });
  }

  /**
   * Decide o próximo polling a partir do status: jogo finalizado não muda
   * mais e não reagenda nada; jogo ainda não iniciado reagenda bem mais
   * devagar (só pra notar quando começar); o resto mantém o ritmo normal de
   * 3s (spec: "quando o jogo ainda não iniciou" deve se comportar como o
   * jogo finalizado — parar de bater na API toda hora).
   */
  private scheduleNextPoll(status: Scoreboard['status']): void {
    clearTimeout(this.pollTimer);
    if (status === 'FINALIZADO') {
      clearInterval(this.clockTimer);
      return;
    }
    const delay = status === 'CONFIGURACAO' ? WAITING_POLL_INTERVAL_MS : POLL_INTERVAL_MS;
    this.pollTimer = setTimeout(() => this.poll(), delay);
  }
}
