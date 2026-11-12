import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { PageHeader } from '../../core/components/page-header/page-header';
import { PageFooter } from '../../core/components/page-footer/page-footer';
import { ScoreboardComponent } from '../scoreboard/scoreboard';
import type { Scoreboard } from '../../core/models';
import type { SheetRankingEntry, SheetRound } from '@shared/ranking-sheet';

/** De quanto em quanto tempo busca o ranking sozinha. A API tem cache de 5s
 * na CDN, então muita gente olhando ao mesmo tempo não pesa na planilha. */
const POLL_MS = 15000;
const MANUAL_COOLDOWN_MS = 5000;

interface RankingResponse {
  /** false quando o admin ainda não escolheu (ou limpou) a planilha. */
  configured?: boolean;
  /** false enquanto o admin não liberar o placar. */
  live?: boolean;
  entries: SheetRankingEntry[];
  /** Todas as rodadas da planilha. Vazio quando o admin não habilitou o
   * placar por rodada. */
  rounds?: SheetRound[];
  fetchedAt: string;
}

/**
 * Placar ao vivo do modo planilha (rota pública `/placar`). Só lê o ranking
 * de `/api/ranking`, que vem de uma planilha atualizada por fora. Não tem
 * jogo, rodada nem lançamento de pontuação aqui.
 *
 * Atualiza sozinho a cada 15s enquanto a aba está visível (pausa em segundo
 * plano pra não gastar bateria/cota) e tem um botão pra forçar.
 */
@Component({
  selector: 'app-sheet-ranking',
  imports: [PageHeader, PageFooter, ScoreboardComponent, DatePipe, RouterLink],
  templateUrl: './sheet-ranking.html',
  styleUrls: ['../public-scoreboard/public-scoreboard.scss', './sheet-ranking.scss'],
})
export class SheetRanking {
  private readonly http = inject(HttpClient);
  private readonly destroyRef = inject(DestroyRef);
  /** Quem já está logado ganha um atalho pra trocar a planilha. */
  protected readonly auth = inject(AuthService);

  private readonly entries = signal<SheetRankingEntry[] | null>(null);
  readonly rounds = signal<SheetRound[]>([]);
  /** Aba escolhida: 'total' (geral) ou o número da rodada. */
  private readonly selectedView = signal<'total' | number>('total');
  /** Rodada escolhida que ainda não tem pontuação: mostra aviso em vez de
   * um ranking com todo mundo empatado em 0. */
  readonly roundNotStarted = computed(() => {
    const v = this.view();
    return v !== 'total' && this.rounds().some((r) => r.number === v && !r.started);
  });
  /** Aba efetiva: se a rodada escolhida sumiu (admin desligou o placar por
   * rodada), volta pro geral sozinho. */
  readonly view = computed<'total' | number>(() => {
    const v = this.selectedView();
    if (v === 'total') return v;
    return this.rounds().some((r) => r.number === v) ? v : 'total';
  });
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly refreshing = signal(false);
  readonly lastUpdate = signal<Date | null>(null);
  /** Sem planilha configurada: mostra "aguardando" e continua consultando,
   * então o ranking aparece sozinho quando o admin salvar uma. */
  readonly configured = signal(true);
  /** Placar liberado pelo admin. Junto com `configured`, decide se mostra o
   * ranking ou "Aguardando início do jogo". */
  readonly live = signal(true);
  private readonly cooldownUntil = signal(0);
  private readonly now = signal(Date.now());

  /** Quando roda a próxima busca automática. `null` com a aba em segundo
   * plano (polling pausado). */
  private readonly nextPollAt = signal<number | null>(null);
  /** Segundos até a próxima busca, pro contador discreto no rodapé. */
  readonly secondsToNext = computed(() => {
    const at = this.nextPollAt();
    if (at === null) return null;
    return Math.max(0, Math.ceil((at - this.now()) / 1000));
  });

  readonly canRefresh = computed(() => !this.refreshing() && this.now() >= this.cooldownUntil());

  /** Posição de cada equipe no último ranking em que a ordem MUDOU. Só
   * atualiza quando alguém sobe/desce, senão a seta de tendência sumiria
   * no poll seguinte mesmo sem nada ter acontecido. */
  private previousPositions = new Map<string, number>();
  private currentPositions = new Map<string, number>();
  /** Cor fixa por equipe: ordem de primeira aparição, não a posição. */
  private readonly colorOrder = new Map<string, number>();

  /** Adapta pro formato `Scoreboard` que o `app-scoreboard` já sabe desenhar.
   * Mostra o geral ou a rodada escolhida. Setas de tendência só no geral:
   * numa rodada isolada "subiu/desceu" não tem com o que comparar. */
  readonly scoreboard = computed<Scoreboard | null>(() => {
    const total = this.entries();
    if (!total) return null;
    const view = this.view();
    const entries =
      view === 'total' ? total : (this.rounds().find((r) => r.number === view)?.entries ?? []);
    return {
      gameId: 'planilha',
      status: 'EM_ANDAMENTO',
      currentRound: 0,
      currentQuestion: 0,
      rounds: 0,
      questionsPerRound: 0,
      roundTotalsByRound: {},
      entries: entries.map((e) => ({
        teamId: e.name,
        teamName: e.name,
        order: this.colorOrder.get(e.name) ?? 1,
        roundTotal: 0,
        overallTotal: e.score,
        position: e.position,
        previousPosition: view === 'total' ? (this.previousPositions.get(e.name) ?? null) : null,
      })),
    };
  });

  private pollTimer?: ReturnType<typeof setInterval>;

  constructor() {
    this.fetch();
    this.startPolling();

    const clock = setInterval(() => this.now.set(Date.now()), 1000);
    const onVisibility = () => {
      if (document.hidden) {
        clearInterval(this.pollTimer);
        this.nextPollAt.set(null);
      } else {
        this.fetch();
        this.startPolling();
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    this.destroyRef.onDestroy(() => {
      clearInterval(clock);
      clearInterval(this.pollTimer);
      document.removeEventListener('visibilitychange', onVisibility);
    });
  }

  selectView(view: 'total' | number): void {
    this.selectedView.set(view);
  }

  refresh(): void {
    if (!this.canRefresh()) return;
    this.cooldownUntil.set(Date.now() + MANUAL_COOLDOWN_MS);
    this.fetch();
    this.startPolling();
  }

  private startPolling(): void {
    clearInterval(this.pollTimer);
    this.nextPollAt.set(Date.now() + POLL_MS);
    this.pollTimer = setInterval(() => {
      this.nextPollAt.set(Date.now() + POLL_MS);
      this.fetch();
    }, POLL_MS);
  }

  private fetch(): void {
    if (this.refreshing()) return;
    this.refreshing.set(true);
    this.http.get<RankingResponse>('/api/ranking').subscribe({
      next: (res) => {
        this.configured.set(res.configured !== false);
        this.live.set(res.live !== false);
        this.applyEntries(res.entries, res.rounds ?? []);
        this.lastUpdate.set(new Date());
        this.error.set(null);
        this.loading.set(false);
        this.refreshing.set(false);
      },
      error: (err: unknown) => {
        // Mantém o último ranking na tela. Sumir com ele confunde mais.
        const reason =
          err instanceof HttpErrorResponse && typeof err.error?.error === 'string'
            ? err.error.error
            : null;
        const base = this.entries()
          ? 'Não foi possível atualizar.'
          : 'Não foi possível carregar o placar.';
        this.error.set(reason && err instanceof HttpErrorResponse && err.status !== 500 ? `${base} ${reason}` : base);
        this.loading.set(false);
        this.refreshing.set(false);
      },
    });
  }

  private applyEntries(entries: SheetRankingEntry[], rounds: SheetRound[]): void {
    // Resposta igual à anterior: não toca em nada, a tela fica parada.
    if (
      this.sameEntries(this.entries(), entries) &&
      rounds.length === this.rounds().length &&
      rounds.every(
        (r, i) =>
          r.number === this.rounds()[i].number &&
          r.started === this.rounds()[i].started &&
          this.sameEntries(this.rounds()[i].entries, r.entries),
      )
    ) {
      return;
    }
    this.rounds.set(rounds);
    for (const e of entries) {
      if (!this.colorOrder.has(e.name)) this.colorOrder.set(e.name, this.colorOrder.size + 1);
    }
    const next = new Map(entries.map((e) => [e.name, e.position]));
    const changed =
      next.size !== this.currentPositions.size ||
      [...next].some(([name, pos]) => this.currentPositions.get(name) !== pos);
    if (changed && this.currentPositions.size) this.previousPositions = this.currentPositions;
    if (changed) this.currentPositions = next;
    this.entries.set(entries);
  }

  private sameEntries(a: SheetRankingEntry[] | null, b: SheetRankingEntry[]): boolean {
    if (!a || a.length !== b.length) return false;
    return a.every(
      (e, i) => e.name === b[i].name && e.score === b[i].score && e.position === b[i].position,
    );
  }
}
