import { Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { GameStateService } from '../../core/services/game-state.service';
import { teamColor } from '../../core/models';
import type { RoundSummary, Team } from '../../core/models';

interface RoundRow {
  teamId: string;
  teamName: string;
  color: string;
  total: number;
}

interface RankingRow {
  teamId: string;
  teamName: string;
  color: string;
  total: number;
  position: number;
}

interface TeamColumn {
  teamId: string;
  teamName: string;
  color: string;
}

interface QuestionRow {
  question: number;
  /** Alinhado com `teamColumns()` — mesma ordem, mesmo índice. */
  scores: number[];
}

@Component({
  selector: 'app-round-summary',
  imports: [RouterLink],
  templateUrl: './round-summary.html',
  styleUrl: './round-summary.scss',
})
export class RoundSummaryPage {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  protected readonly gameState = inject(GameStateService);

  readonly gameId = this.route.snapshot.paramMap.get('id')!;
  readonly round = Number(this.route.snapshot.paramMap.get('rodada'));

  readonly summary = signal<RoundSummary | null>(null);
  readonly loading = signal(true);
  readonly continuing = signal(false);
  readonly roundCardExpanded = signal(true);
  readonly rankedCardExpanded = signal(true);
  readonly selectedTeamId = signal<string | null>(null);

  private readonly teamsById = computed(() => {
    const map = new Map<string, Team>();
    for (const t of this.gameState.teams()) map.set(t.id, t);
    return map;
  });

  readonly roundRows = computed<RoundRow[]>(() => {
    const summary = this.summary();
    if (!summary) return [];
    const teams = this.teamsById();
    return [...summary.roundTotals]
      .sort((a, b) => b.total - a.total)
      .map((r) => ({
        teamId: r.teamId,
        teamName: teams.get(r.teamId)?.name ?? '—',
        color: teamColor(teams.get(r.teamId)?.order ?? 1),
        total: r.total,
      }));
  });

  readonly rankingRows = computed<RankingRow[]>(() => {
    const summary = this.summary();
    if (!summary) return [];
    const teams = this.teamsById();
    return summary.overallRanking.map((r) => ({
      teamId: r.teamId,
      teamName: teams.get(r.teamId)?.name ?? '—',
      color: teamColor(teams.get(r.teamId)?.order ?? 1),
      total: r.total,
      position: r.position,
    }));
  });

  /** Colunas da tabela pergunta-a-pergunta, na mesma ordem de cadastro das
   * equipes (não na ordem de pontuação — comparar fica mais fácil quando a
   * equipe sempre aparece na mesma coluna, pergunta após pergunta). */
  readonly teamColumns = computed<TeamColumn[]>(() =>
    [...this.gameState.teams()]
      .sort((a, b) => a.order - b.order)
      .map((t) => ({ teamId: t.id, teamName: t.name, color: teamColor(t.order) })),
  );

  /**
   * Pontuação de cada equipe em cada pergunta desta rodada, lado a lado —
   * pra comparar pergunta por pergunta quem acertou/errou (spec
   * "Melhorias": serve de "VAR" logo depois da rodada terminar).
   */
  readonly questionRows = computed<QuestionRow[]>(() => {
    const summary = this.summary();
    if (!summary) return [];
    const columns = this.teamColumns();
    const byQuestion = new Map<number, Map<string, number>>();
    for (const s of summary.questionScores) {
      if (!byQuestion.has(s.question)) byQuestion.set(s.question, new Map());
      byQuestion.get(s.question)!.set(s.teamId, s.total);
    }
    return [...byQuestion.keys()]
      .sort((a, b) => a - b)
      .map((question) => ({
        question,
        scores: columns.map((c) => byQuestion.get(question)?.get(c.teamId) ?? 0),
      }));
  });

  readonly winnerName = computed(() => {
    const summary = this.summary();
    if (!summary?.winnerTeamId) return null;
    return this.teamsById().get(summary.winnerTeamId)?.name ?? null;
  });

  readonly isLastRound = computed(() => {
    const game = this.gameState.game();
    return game ? this.round >= game.rounds : false;
  });

  toggleRoundCard(): void {
    this.roundCardExpanded.set(!this.roundCardExpanded());
  }

  toggleRankedCard(): void {
    this.rankedCardExpanded.set(!this.rankedCardExpanded());
  }

  selectTeam(teamId: string): void {
    this.selectedTeamId.set(
      this.selectedTeamId() === teamId ? null : teamId
    );
  }

  constructor() {
    this.gameState.loadGame(this.gameId).then(async () => {
      if (this.gameState.notFound()) {
        await this.router.navigate(['/404']);
        return;
      }
      try {
        this.summary.set(await this.gameState.getRoundSummary(this.gameId, this.round));
      } finally {
        this.loading.set(false);
      }
    });
  }

  medal(position: number): string | null {
    if (position === 1) return '①';
    if (position === 2) return '②';
    if (position === 3) return '③';
    return null;
  }

  async continueGame(): Promise<void> {
    this.continuing.set(true);
    try {
      await this.gameState.continueToNextRound(this.gameId);
      await this.router.navigate(['/jogo', this.gameId, 'ao-vivo']);
    } finally {
      this.continuing.set(false);
    }
  }
}
