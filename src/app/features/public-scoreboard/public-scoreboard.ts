import {
  Component,
  DestroyRef,
  HostListener,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { HttpErrorResponse } from '@angular/common/http';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { map } from 'rxjs';
import { ApiService } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';
import { PageHeader } from '../../core/components/page-header/page-header';
import { PageFooter } from '../../core/components/page-footer/page-footer';
import { ScoreboardComponent } from '../scoreboard/scoreboard';
import { pluralize } from '../../core/models';
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

interface PixelRect {
  x: number;
  y: number;
  w: number;
  h: number;
  fill: string;
}

interface ChampionSprite {
  id: string;
  viewBox: string;
  rects: PixelRect[];
}

/** Personagens pixelizados decorativos da "Placa do campeão" — desenhos
 * originais em pixel art (nenhuma franquia/personagem de terceiros), só o
 * clima genérico de fliperama 8-bit: fantasminha, invasor, disco voador,
 * robô, estrela e joystick. Cada sprite é uma lista de retângulos com
 * run-length (uma sequência de pixels da mesma cor numa linha vira um único
 * `<rect>` mais largo, em vez de um `<rect>` por pixel) desenhada num grid
 * pequeno — ver `viewBox`. `fill` aceita `var(--token)` porque atributos de
 * apresentação de SVG resolvem custom properties normalmente nos
 * navegadores atuais. */
const CHAMPION_SPRITES: ChampionSprite[] = [
  {
    id: 'ghost',
    viewBox: '0 0 10 12',
    rects: [
      { x: 3, y: 0, w: 4, h: 1, fill: 'var(--arcade-purple)' },
      { x: 2, y: 1, w: 6, h: 1, fill: 'var(--arcade-purple)' },
      { x: 1, y: 2, w: 8, h: 6, fill: 'var(--arcade-purple)' },
      { x: 0, y: 8, w: 10, h: 1, fill: 'var(--arcade-purple)' },
      { x: 0, y: 9, w: 4, h: 1, fill: 'var(--arcade-purple)' },
      { x: 6, y: 9, w: 4, h: 1, fill: 'var(--arcade-purple)' },
      { x: 0, y: 10, w: 3, h: 1, fill: 'var(--arcade-purple)' },
      { x: 7, y: 10, w: 3, h: 1, fill: 'var(--arcade-purple)' },
      { x: 0, y: 11, w: 2, h: 1, fill: 'var(--arcade-purple)' },
      { x: 8, y: 11, w: 2, h: 1, fill: 'var(--arcade-purple)' },
      { x: 2, y: 4, w: 2, h: 2, fill: '#ffffff' },
      { x: 6, y: 4, w: 2, h: 2, fill: '#ffffff' },
      { x: 3, y: 5, w: 1, h: 1, fill: '#1b2440' },
      { x: 7, y: 5, w: 1, h: 1, fill: '#1b2440' },
    ],
  },
  {
    id: 'invader',
    viewBox: '0 0 12 8',
    rects: [
      { x: 3, y: 0, w: 6, h: 1, fill: 'var(--arcade-positive)' },
      { x: 2, y: 1, w: 8, h: 1, fill: 'var(--arcade-positive)' },
      { x: 1, y: 2, w: 10, h: 1, fill: 'var(--arcade-positive)' },
      { x: 0, y: 3, w: 12, h: 2, fill: 'var(--arcade-positive)' },
      { x: 1, y: 5, w: 10, h: 1, fill: 'var(--arcade-positive)' },
      { x: 1, y: 6, w: 2, h: 1, fill: 'var(--arcade-positive)' },
      { x: 9, y: 6, w: 2, h: 1, fill: 'var(--arcade-positive)' },
      { x: 0, y: 7, w: 2, h: 1, fill: 'var(--arcade-positive)' },
      { x: 10, y: 7, w: 2, h: 1, fill: 'var(--arcade-positive)' },
      { x: 3, y: 3, w: 2, h: 2, fill: '#0b1a12' },
      { x: 7, y: 3, w: 2, h: 2, fill: '#0b1a12' },
    ],
  },
  {
    id: 'ufo',
    viewBox: '0 0 16 8',
    rects: [
      { x: 6, y: 0, w: 4, h: 1, fill: '#eaf6ff' },
      { x: 5, y: 1, w: 6, h: 1, fill: '#eaf6ff' },
      { x: 4, y: 2, w: 8, h: 1, fill: '#eaf6ff' },
      { x: 0, y: 3, w: 16, h: 2, fill: '#9fb0d0' },
      { x: 1, y: 5, w: 14, h: 1, fill: 'var(--arcade-text-faint)' },
      { x: 2, y: 3, w: 1, h: 1, fill: 'var(--arcade-gold)' },
      { x: 6, y: 3, w: 1, h: 1, fill: 'var(--arcade-gold)' },
      { x: 10, y: 3, w: 1, h: 1, fill: 'var(--arcade-gold)' },
      { x: 13, y: 3, w: 1, h: 1, fill: 'var(--arcade-gold)' },
      { x: 5, y: 6, w: 6, h: 1, fill: 'var(--arcade-accent)' },
    ],
  },
  {
    id: 'robot',
    viewBox: '0 0 12 14',
    rects: [
      { x: 5, y: 0, w: 2, h: 1, fill: 'var(--arcade-gold)' },
      { x: 5, y: 1, w: 2, h: 1, fill: 'var(--arcade-gold)' },
      { x: 3, y: 2, w: 6, h: 4, fill: '#b8c2dd' },
      { x: 4, y: 3, w: 1, h: 2, fill: 'var(--arcade-accent)' },
      { x: 7, y: 3, w: 1, h: 2, fill: 'var(--arcade-accent)' },
      { x: 4, y: 6, w: 4, h: 1, fill: 'var(--arcade-text-faint)' },
      { x: 2, y: 7, w: 8, h: 4, fill: '#b8c2dd' },
      { x: 5, y: 8, w: 2, h: 2, fill: 'var(--arcade-gold)' },
      { x: 0, y: 7, w: 2, h: 4, fill: '#b8c2dd' },
      { x: 10, y: 7, w: 2, h: 4, fill: '#b8c2dd' },
      { x: 3, y: 11, w: 2, h: 3, fill: '#b8c2dd' },
      { x: 7, y: 11, w: 2, h: 3, fill: '#b8c2dd' },
    ],
  },
  {
    id: 'star',
    viewBox: '0 0 9 9',
    rects: [
      { x: 3, y: 3, w: 3, h: 3, fill: 'var(--arcade-gold)' },
      { x: 4, y: 0, w: 1, h: 3, fill: 'var(--arcade-gold)' },
      { x: 4, y: 6, w: 1, h: 3, fill: 'var(--arcade-gold)' },
      { x: 0, y: 4, w: 3, h: 1, fill: 'var(--arcade-gold)' },
      { x: 6, y: 4, w: 3, h: 1, fill: 'var(--arcade-gold)' },
      { x: 4, y: 4, w: 1, h: 1, fill: '#ffffff' },
    ],
  },
  {
    id: 'joystick',
    viewBox: '0 0 10 13',
    rects: [
      { x: 3, y: 0, w: 4, h: 1, fill: 'var(--arcade-negative)' },
      { x: 2, y: 1, w: 6, h: 1, fill: 'var(--arcade-negative)' },
      { x: 2, y: 2, w: 6, h: 1, fill: 'var(--arcade-negative)' },
      { x: 3, y: 3, w: 4, h: 1, fill: 'var(--arcade-negative)' },
      { x: 4, y: 4, w: 2, h: 6, fill: '#1b2440' },
      { x: 1, y: 10, w: 8, h: 2, fill: '#8894b8' },
      { x: 0, y: 12, w: 10, h: 1, fill: 'var(--arcade-text-faint)' },
    ],
  },
];

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

  /** `:id` da rota como signal (não só lido uma vez do snapshot) —
   * `jogo/:id/placar` é a mesma `Route` pra qualquer jogo, então o Angular
   * reaproveita a instância deste componente ao navegar direto de um jogo
   * pro outro nesta tela (ex: voltar/avançar do navegador): o
   * `RouteReuseStrategy` padrão não recria o componente só porque o
   * parâmetro mudou. Sem reagir a isso (ver `effect` no construtor), a
   * tela ficava presa mostrando o placar do jogo carregado na primeira
   * visita (mesmo bug corrigido em game-config.ts). */
  readonly gameId = toSignal(this.route.paramMap.pipe(map((params) => params.get('id')!)), {
    initialValue: this.route.snapshot.paramMap.get('id')!,
  });
  /** Último id efetivamente carregado — só pra o `effect` no construtor
   * saber se `gameId()` de fato mudou (reaproveitamento) ou é só o
   * primeiro disparo, que já corresponde ao load feito direto no
   * construtor (ver `loadForId`). */
  private loadedId = this.gameId();

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

  readonly cooldownSeconds = computed(() =>
    Math.max(0, Math.ceil((this.cooldownUntil() - this.now()) / 1000)),
  );
  readonly canRefresh = computed(() => !this.refreshing() && this.cooldownSeconds() === 0);

  readonly roundRows = computed<RoundRow[]>(() => {
    const board = this.scoreboard();
    if (!board) return [];
    return [...board.entries]
      .sort((a, b) => b.roundTotal - a.roundTotal)
      .map((e, i) => ({
        teamId: e.teamId,
        teamName: e.teamName,
        total: e.roundTotal,
        position: i + 1,
      }));
  });

  /** Seção "Placar geral" pode ser fechada pra dar mais espaço à rodada
   * atual (spec public-scoreboard) — fechada, o `app-scoreboard` nem fica
   * no DOM, então a animação de ultrapassagem simplesmente não roda
   * enquanto ninguém está olhando pra ela. */
  readonly boardCollapsed = signal(false);

  toggleBoard(): void {
    this.boardCollapsed.update((v) => !v);
  }

  /** Equipe campeã: só existe quando dá pra apontar uma única vencedora.
   * Em caso de empate em 1º lugar entre duas ou mais equipes, fica `null`
   * de propósito — o botão "Placa do campeão" some nesse caso (não faz
   * sentido uma placa de campeão único com um empate técnico no topo). */
  readonly champion = computed(() => {
    const board = this.scoreboard();
    if (!board || board.status !== 'FINALIZADO') return null;
    const leaders = board.entries.filter((e) => e.position === 1);
    return leaders.length === 1 ? leaders[0] : null;
  });

  /** Placa do campeão (spec: substitui "Atualizar" quando o jogo termina).
   * Overlay simples controlado por um signal, mesmo padrão do dialog de
   * correção em score-entry.ts. */
  readonly championPlaqueOpen = signal(false);
  protected readonly championSprites = CHAMPION_SPRITES;
  protected readonly pluralize = pluralize;

  openChampionPlaque(): void {
    this.championPlaqueOpen.set(true);
  }

  closeChampionPlaque(): void {
    this.championPlaqueOpen.set(false);
  }

  @HostListener('window:keydown.escape')
  onEscape(): void {
    if (this.championPlaqueOpen()) this.closeChampionPlaque();
  }

  private clockTimer?: ReturnType<typeof setInterval>;

  constructor() {
    this.loadForId(this.loadedId);

    /* Reage a trocas de `:id` na URL desta mesma instância reaproveitada
       (ver `gameId` acima). No primeiro disparo `id` já é igual a
       `loadedId`, então o guard abaixo pula — o load inicial já rodou na
       linha de cima, síncrono, sem esperar o primeiro tick do effect. */
    effect(() => {
      const id = this.gameId();
      if (id === this.loadedId) return;
      this.loadedId = id;
      this.loadForId(id);
    });

    // Só pra recalcular os computeds de contagem (`secondsSinceUpdate`,
    // `cooldownSeconds`) a cada segundo — não dispara nenhuma requisição.
    this.clockTimer = setInterval(() => this.now.set(Date.now()), 1000);
    this.destroyRef.onDestroy(() => clearInterval(this.clockTimer));
  }

  /** Extraído do construtor pra também rodar de novo quando a instância é
   * reaproveitada com outro `:id` (ver `gameId`/`effect` acima) — sem isso
   * a tela ficava presa mostrando o placar do jogo carregado na primeira
   * visita. */
  private loadForId(gameId: string): void {
    this.error.set(null);
    this.refreshError.set(null);
    const cached = this.readCache(gameId);
    if (cached) {
      // Já tem placar salvo desta visita anterior — mostra ele direto, sem
      // gastar uma requisição só por causa do reload, e mantém o cooldown
      // (se ainda estiver correndo) valendo do ponto onde parou.
      this.scoreboard.set(cached.scoreboard);
      this.lastSuccessAt.set(cached.lastSuccessAt);
      this.cooldownUntil.set(cached.cooldownUntil);
      this.loading.set(false);
    } else {
      // Reaproveitamento pra outro jogo, sem cache próprio: não deixa o
      // placar nem o cooldown do jogo anterior visíveis enquanto busca o
      // novo (o cooldown é por jogo, não faz sentido herdar o de outro).
      this.scoreboard.set(null);
      this.lastSuccessAt.set(0);
      this.cooldownUntil.set(0);
      this.loading.set(true);
      this.fetch(gameId, { isBootstrap: true });
    }
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
    this.persist(this.gameId());
    this.fetch(this.gameId(), { isBootstrap: false });
  }

  private fetch(gameId: string, opts: { isBootstrap: boolean }): void {
    this.refreshing.set(true);
    this.refreshError.set(null);
    this.api.getScoreboard(gameId).subscribe({
      next: (scoreboard) => {
        // Resposta de um fetch antigo (id trocado no meio do caminho, ver
        // `loadForId`/`effect`) chegando atrasada — ignora, senão sobrescreve
        // o placar do jogo certo com o do jogo errado.
        if (gameId !== this.gameId()) return;
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
        this.persist(gameId);
      },
      error: (err: unknown) => {
        if (gameId !== this.gameId()) return;
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
          this.persist(gameId);
        }
      },
    });
  }

  private readCache(gameId: string): PersistedState | null {
    try {
      const raw = localStorage.getItem(this.storageKeyFor(gameId));
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

  private persist(gameId: string): void {
    const board = this.scoreboard();
    if (!board) return;
    try {
      const state: PersistedState = {
        scoreboard: board,
        lastSuccessAt: this.lastSuccessAt(),
        cooldownUntil: this.cooldownUntil(),
      };
      localStorage.setItem(this.storageKeyFor(gameId), JSON.stringify(state));
    } catch {
      // Só perde a persistência entre recargas — não quebra a tela.
    }
  }

  /** Chave de cache por jogo — era um campo fixo (`storageKey`), mas com
   * `gameId` agora reativo (ver comentário lá) o cache também precisa ser
   * por chamada, não por instância, senão um reaproveitamento leria/
   * escreveria a chave do jogo anterior. */
  private storageKeyFor(gameId: string): string {
    return `ojogo:public-scoreboard:${gameId}`;
  }
}
