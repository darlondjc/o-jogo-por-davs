import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ApiService } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';
import { PageHeader } from '../../core/components/page-header/page-header';
import { PageFooter } from '../../core/components/page-footer/page-footer';
import { ScoreboardComponent } from '../scoreboard/scoreboard';
import type { Scoreboard } from '../../core/models';

const REFRESH_COOLDOWN_MS = 10000;

interface RoundRow {
  teamId: string;
  teamName: string;
  total: number;
  position: number;
}

/** O que fica salvo no localStorage entre recargas — ver comentário da
 * classe sobre por que isso existe. */
interface PersistedState {
  scoreboard: Scoreboard;
  lastSuccessAt: number;
  cooldownUntil: number;
}

/**
 * Placar público (spec seção 19). Sem login, mobile-first.
 *
 * Não atualiza mais sozinho (era polling automático a cada 10s): só busca
 * dado novo na primeira visita, quando ainda não existe nada em cache, ou
 * quando a pessoa aperta "Atualizar" — e o botão fica desabilitado por 10s a
 * cada clique. Esse cooldown (junto com o último placar carregado) fica
 * salvo no localStorage por jogo, então dar F5 não é um jeito de furar o
 * limite: a página volta mostrando o que já tinha, sem disparar requisição
 * nenhuma, e o botão continua desabilitado pelo tempo que faltava.
 */
@Component({
  selector: 'app-public-scoreboard',
  imports: [PageHeader, PageFooter, ScoreboardComponent, RouterLink],
  templateUrl: './public-scoreboard.html',
  styleUrl: './public-scoreboard.scss',
})
export class PublicScoreboard {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly api = inject(ApiService);
  private readonly destroyRef = inject(DestroyRef);
  /** Placar público é uma tela sem login (spec seção 19) — mas quem chegou
   * aqui já logado (ex: operador testando o link que vai mandar pros
   * espectadores) ganha um atalho de volta pro painel do jogo, em vez de
   * precisar navegar até lá manualmente (ver `.back-to-panel` no template). */
  protected readonly auth = inject(AuthService);

  readonly gameId = this.route.snapshot.paramMap.get('id')!;
  private readonly storageKey = `ojogo:public-scoreboard:${this.gameId}`;

  readonly scoreboard = signal<Scoreboard | null>(null);
  /** Só true durante a primeiríssima busca (sem nada em cache ainda pra
   * mostrar enquanto isso). Uma atualização manual usa `refreshing`, não
   * essa aqui — o placar já carregado continua na tela durante ela. */
  readonly loading = signal(true);
  /** Erro da busca inicial (sem cache, sem placar nenhum pra mostrar). */
  readonly error = signal<string | null>(null);
  /** Erro de um clique em "Atualizar" que falhou — não apaga o placar já
   * carregado (mesma lógica de antes: sumir é o que mais confunde quem tá
   * acompanhando). */
  readonly refreshError = signal<string | null>(null);
  readonly refreshing = signal(false);

  private readonly lastSuccessAt = signal(0);
  private readonly cooldownUntil = signal(0);
  private readonly now = signal(Date.now());

  readonly cooldownSeconds = computed(() => Math.max(0, Math.ceil((this.cooldownUntil() - this.now()) / 1000)));
  readonly canRefresh = computed(() => !this.refreshing() && this.cooldownSeconds() === 0);

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

  private clockTimer?: ReturnType<typeof setInterval>;

  constructor() {
    const cached = this.readCache();
    if (cached) {
      // Já tem placar salvo desta visita anterior — mostra ele direto, sem
      // gastar uma requisição só por causa do reload, e mantém o cooldown
      // (se ainda estiver correndo) valendo do ponto onde parou.
      this.scoreboard.set(cached.scoreboard);
      this.lastSuccessAt.set(cached.lastSuccessAt);
      this.cooldownUntil.set(cached.cooldownUntil);
      this.loading.set(false);
    } else {
      this.fetch({ isBootstrap: true });
    }

    // Só pra recalcular os computeds de contagem (`secondsSinceUpdate`,
    // `cooldownSeconds`) a cada segundo — não dispara nenhuma requisição.
    this.clockTimer = setInterval(() => this.now.set(Date.now()), 1000);
    this.destroyRef.onDestroy(() => clearInterval(this.clockTimer));
  }

  /** Clique em "Atualizar". O cooldown "de verdade" (os 10s mostrados no
   * botão) só começa a contar quando a resposta chega — ver `fetch()` —
   * senão o tempo exibido varia com a latência da requisição (bug real: uma
   * requisição de 3s deixava só 7s de cooldown visíveis). Aqui só fica um
   * piso defensivo, salvo imediatamente: mesmo que a pessoa recarregue a
   * página antes da API responder (a requisição em andamento se perde no
   * reload, sem `next`/`error` pra estender o cooldown de verdade), o botão
   * continua bloqueado por pelo menos os 10s a partir do clique. */
  refresh(): void {
    if (!this.canRefresh()) return;
    this.cooldownUntil.set(Date.now() + REFRESH_COOLDOWN_MS);
    this.persist();
    this.fetch({ isBootstrap: false });
  }

  private fetch(opts: { isBootstrap: boolean }): void {
    this.refreshing.set(true);
    this.refreshError.set(null);
    this.api.getScoreboard(this.gameId).subscribe({
      next: (scoreboard) => {
        this.scoreboard.set(scoreboard);
        this.loading.set(false);
        this.error.set(null);
        this.refreshing.set(false);
        this.lastSuccessAt.set(Date.now());
        this.now.set(Date.now());
        // Cooldown de verdade começa agora, na resposta — não no clique (ver
        // `refresh()`). Sempre estende pra frente (a requisição sempre leva
        // >0ms), então isso nunca afrouxa o piso defensivo já salvo lá.
        this.cooldownUntil.set(Date.now() + REFRESH_COOLDOWN_MS);
        this.persist();
      },
      error: (err: unknown) => {
        this.loading.set(false);
        this.refreshing.set(false);

        if (err instanceof HttpErrorResponse && err.status === 404) {
          clearInterval(this.clockTimer);
          this.router.navigate(['/404']);
          return;
        }

        if (opts.isBootstrap) {
          this.error.set('Não foi possível carregar o placar.');
        } else {
          // Não some com o placar já carregado — só sinaliza que a
          // atualização falhou. Some silenciosamente é o que mais confunde.
          this.refreshError.set('Não foi possível atualizar o placar.');
          // Mesma lógica do sucesso: o cooldown de verdade começa quando a
          // requisição termina, mesmo em erro — sem isso um erro rápido
          // liberava "Atualizar" de novo quase na hora.
          this.cooldownUntil.set(Date.now() + REFRESH_COOLDOWN_MS);
          this.persist();
        }
      },
    });
  }

  private readCache(): PersistedState | null {
    try {
      const raw = localStorage.getItem(this.storageKey);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as Partial<PersistedState> | null;
      if (!parsed?.scoreboard || typeof parsed.lastSuccessAt !== 'number') return null;
      return {
        scoreboard: parsed.scoreboard,
        lastSuccessAt: parsed.lastSuccessAt,
        cooldownUntil: typeof parsed.cooldownUntil === 'number' ? parsed.cooldownUntil : 0,
      };
    } catch {
      // localStorage indisponível (modo privado, quota etc.) ou JSON
      // corrompido — só cai pra buscar da API como se fosse a 1ª visita.
      return null;
    }
  }

  private persist(): void {
    const board = this.scoreboard();
    if (!board) return;
    try {
      const state: PersistedState = {
        scoreboard: board,
        lastSuccessAt: this.lastSuccessAt(),
        cooldownUntil: this.cooldownUntil(),
      };
      localStorage.setItem(this.storageKey, JSON.stringify(state));
    } catch {
  // Só perde a persistência entre recargas — não quebra a tela.
    }
  }
}
