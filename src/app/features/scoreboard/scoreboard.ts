import { Component, computed, effect, ElementRef, input, signal, viewChildren } from '@angular/core';
import type { Scoreboard, Team } from '../../core/models';
import { teamColor } from '../../core/models';

export interface ScoreboardRow {
  teamId: string;
  teamName: string;
  color: string;
  overallTotal: number;
  roundTotal: number;
  position: number;
  trend: 'up' | 'down' | 'same';
}

/**
 * Ranking + total acumulado + pontuação da rodada + variação de posição
 * (spec seção 27). Reutilizado no painel admin, no resumo de rodada e no
 * placar público.
 */
@Component({
  selector: 'app-scoreboard',
  templateUrl: './scoreboard.html',
  styleUrl: './scoreboard.scss',
})
export class ScoreboardComponent {
  readonly scoreboard = input.required<Scoreboard | null>();
  readonly teams = input<Team[]>([]);
  readonly compact = input(false);
  /** `arcade` liga o visual HUD de fliperama (redesign de live/public-scoreboard).
   * O `game-admin` não passa esse input e continua com o visual padrão. */
  readonly variant = input<'default' | 'arcade'>('default');

  private readonly teamOrderById = computed(() => {
    const map = new Map<string, number>();
    for (const team of this.teams()) map.set(team.id, team.order);
    return map;
  });

  readonly rows = computed<ScoreboardRow[]>(() => {
    const board = this.scoreboard();
    if (!board) return [];
    const orderById = this.teamOrderById();
    return board.entries.map((entry) => {
      const order = orderById.get(entry.teamId) ?? 1;
      let trend: ScoreboardRow['trend'] = 'same';
      if (entry.previousPosition !== null) {
        if (entry.position < entry.previousPosition) trend = 'up';
        else if (entry.position > entry.previousPosition) trend = 'down';
      }
      return {
        teamId: entry.teamId,
        teamName: entry.teamName,
        color: teamColor(order),
        overallTotal: entry.overallTotal,
        roundTotal: entry.roundTotal,
        position: entry.position,
        trend,
      };
    });
  });

  /**
   * Equipes cujo total mudou desde a última atualização — usado para dar um
   * flash rápido na linha, confirmando visualmente "isso acabou de mudar".
   * Sem isso, um total que muda no meio de uma lista silenciosa obriga quem
   * está olhando (operador ou público) a caçar o número que mudou.
   */
  private readonly previousTotals = new Map<string, number>();
  readonly changedIds = signal<Set<string>>(new Set());
  private clearTimer?: ReturnType<typeof setTimeout>;

  /**
   * Referência de cada `<li>` da lista, na mesma ordem de `rows()` — usada
   * para animar a ultrapassagem (técnica FLIP): quando uma equipe muda de
   * posição, o Angular já reordenou o DOM; em vez de deixar a lista "saltar"
   * para o novo lugar, a gente mede onde cada linha estava, aplica um
   * transform que a devolve visualmente à posição antiga e anima até zero —
   * dando a sensação de que a equipe realmente subiu (e as outras desceram).
   */
  private readonly rowEls = viewChildren<ElementRef<HTMLLIElement>>('rowEl');
  private previousTops = new Map<string, number>();

  constructor() {
    effect(() => {
      const rows = this.rows();
      const changed = new Set<string>();
      for (const row of rows) {
        const prevTotal = this.previousTotals.get(row.teamId);
        if (prevTotal !== undefined && prevTotal !== row.overallTotal) changed.add(row.teamId);
        this.previousTotals.set(row.teamId, row.overallTotal);
      }
      if (changed.size) {
        this.changedIds.set(changed);
        clearTimeout(this.clearTimer);
        this.clearTimer = setTimeout(() => this.changedIds.set(new Set()), 1000);
      }
    });

    effect(() => {
      const rows = this.rows();
      const els = this.rowEls();
      if (!els.length || els.length !== rows.length) return;

      const newTops = new Map<string, number>();
      els.forEach((ref, i) => newTops.set(rows[i].teamId, ref.nativeElement.getBoundingClientRect().top));

      els.forEach((ref, i) => {
        const teamId = rows[i].teamId;
        const el = ref.nativeElement;
        const oldTop = this.previousTops.get(teamId);
        const newTop = newTops.get(teamId)!;
        const delta = oldTop === undefined ? 0 : oldTop - newTop;
        if (Math.abs(delta) < 1) return;

        // delta > 0: a linha estava mais embaixo antes (topo maior) e subiu
        // — equipe ultrapassou alguém. delta < 0: desceu.
        const rising = delta > 0;
        el.classList.remove('rising', 'falling');
        el.classList.add(rising ? 'rising' : 'falling');

        // First: salta instantaneamente de volta pra posição (e leve escala)
        // antiga, sem transição — quem sobe parte um pouco "encolhida" e
        // cresce até o tamanho normal; quem desce parte um pouco maior e
        // "assenta". Reforça visualmente qual das duas ultrapassagens é essa.
        el.style.transition = 'none';
        el.style.transform = `translateY(${delta}px) scale(${rising ? 0.96 : 1.04})`;
        el.classList.add('flip-moving');
        el.getBoundingClientRect(); // força reflow antes de animar (senão o browser agrupa os dois estilos)

        // Play: solta pra posição e escala normais, agora com transição — é isso que anima.
        requestAnimationFrame(() => {
          el.style.transition =
            'transform 0.55s cubic-bezier(0.22, 1, 0.36, 1), box-shadow 0.55s ease, background 0.55s ease';
          el.style.transform = '';
        });
        el.addEventListener(
          'transitionend',
          () => {
            el.style.transition = '';
            el.classList.remove('flip-moving', 'rising', 'falling');
          },
          { once: true },
        );
      });

      this.previousTops = newTops;
    });
  }

  medal(position: number): string | null {
    if (this.variant() === 'arcade') {
      if (position === 1) return '①';
      if (position === 2) return '②';
      if (position === 3) return '③';
      return null;
    }
    if (position === 1) return '🥇';
    if (position === 2) return '🥈';
    if (position === 3) return '🥉';
    return null;
  }

  trendIcon(trend: ScoreboardRow['trend']): string {
    if (this.variant() !== 'arcade') return trend === 'up' ? '↑' : trend === 'down' ? '↓' : '—';
    return trend === 'up' ? '▲' : trend === 'down' ? '▼' : '—';
  }
}
