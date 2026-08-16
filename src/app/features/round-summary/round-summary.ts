import { Component, computed, effect, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { map } from 'rxjs';
import { GameStateService } from '../../core/services/game-state.service';
import { teamColor } from '../../core/models';
import type { RoundSummary, Team } from '../../core/models';
import { Snackbar } from '../../core/components/snackbar/snackbar';
import { PageHeader } from '../../core/components/page-header/page-header';
import { PageFooter } from '../../core/components/page-footer/page-footer';

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
  imports: [RouterLink, FormsModule, Snackbar, PageHeader, PageFooter],
  templateUrl: './round-summary.html',
  styleUrl: './round-summary.scss',
})
export class RoundSummaryPage {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  protected readonly gameState = inject(GameStateService);

  /** `:id`/`:rodada` da rota como signals (não só lidos uma vez do
   * snapshot) — `jogo/:id/rodada/:rodada` é a mesma `Route` pra qualquer
   * jogo/rodada, então o Angular reaproveita a instância deste componente
   * ao navegar direto entre duas dessas telas (ex: voltar/avançar do
   * navegador): o `RouteReuseStrategy` padrão não recria o componente só
   * porque os parâmetros mudaram. Sem reagir a isso (ver `effect` no
   * construtor), a tela ficava presa mostrando o resumo da primeira visita
   * (mesmo bug corrigido em game-config.ts). */
  readonly gameId = toSignal(this.route.paramMap.pipe(map((params) => params.get('id')!)), {
    initialValue: this.route.snapshot.paramMap.get('id')!,
  });
  readonly round = toSignal(
    this.route.paramMap.pipe(map((params) => Number(params.get('rodada')))),
    {
      initialValue: Number(this.route.snapshot.paramMap.get('rodada')),
    },
  );
  /** Última combinação jogo+rodada efetivamente carregada — só pra o
   * `effect` no construtor saber se `gameId()`/`round()` de fato mudaram
   * (reaproveitamento) ou é só o primeiro disparo, que já corresponde ao
   * load feito direto no construtor (ver `loadForRound`). */
  private loadedKey = `${this.gameId()}/${this.round()}`;

  readonly summary = signal<RoundSummary | null>(null);
  readonly loading = signal(true);
  readonly continuing = signal(false);
  readonly roundCardExpanded = signal(true);
  readonly rankedCardExpanded = signal(true);
  readonly selectedTeamId = signal<string | null>(null);

  /** Correção de pontuação direto na tabela "Pergunta a pergunta" (spec
   * "Melhorias": equipes podem pedir correção ao conferir os pontos aqui) —
   * ao entrar em edição, cada célula (exceto a coluna "Pergunta") vira um
   * input; "Salvar alterações" manda só as perguntas realmente alteradas. */
  readonly editingScores = signal(false);
  readonly savingCorrections = signal(false);
  readonly correctionError = signal<string | null>(null);
  readonly correctionSnackbarVisible = signal(false);
  private correctionSnackbarTimeout?: ReturnType<typeof setTimeout>;
  /** Rascunho local dos valores em edição: pergunta → equipe → pontuação.
   * Populado a partir de `questionRows()` ao entrar em edição — fora do
   * modo de edição a tabela lê direto de `questionRows()`. */
  private readonly editedScores = signal<Map<number, Map<string, number>>>(new Map());

  private readonly teamsById = computed(() => {
    const map = new Map<string, Team>();
    for (const t of this.gameState.teams()) map.set(t.id, t);
    return map;
  });

  /** Empate quebrado por ordem alfabética do nome — sem isso a ordem seguia
   * a ordem "de chegada" das pontuações no banco (bug real: "Placar da
   * rodada" e "Placar geral" mostrando empates em ordens diferentes um do
   * outro, sem nenhum critério visível). Mesmo critério nas duas listas. */
  readonly roundRows = computed<RoundRow[]>(() => {
    const summary = this.summary();
    if (!summary) return [];
    const teams = this.teamsById();
    return summary.roundTotals
      .map((r) => ({
        teamId: r.teamId,
        teamName: teams.get(r.teamId)?.name ?? '—',
        color: teamColor(teams.get(r.teamId)?.order ?? 1),
        total: r.total,
      }))
      .sort((a, b) => b.total - a.total || a.teamName.localeCompare(b.teamName));
  });

  readonly rankingRows = computed<RankingRow[]>(() => {
    const summary = this.summary();
    if (!summary) return [];
    const teams = this.teamsById();
    return summary.overallRanking
      .map((r) => ({
        teamId: r.teamId,
        teamName: teams.get(r.teamId)?.name ?? '—',
        color: teamColor(teams.get(r.teamId)?.order ?? 1),
        total: r.total,
        position: r.position,
      }))
      .sort((a, b) => a.position - b.position || a.teamName.localeCompare(b.teamName));
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

  /** Equipe(s) no topo do placar da rodada — derivado do `roundRows` já
   * ordenado (não do `winnerTeamId` da API) pra garantir que "quem venceu"
   * e a ordem exibida na lista nunca se contradigam. Mais de uma equipe
   * aqui significa empate na liderança da rodada. */
  readonly roundWinners = computed<RoundRow[]>(() => {
    const rows = this.roundRows();
    if (!rows.length) return [];
    const topTotal = rows[0].total;
    return rows.filter((r) => r.total === topTotal);
  });

  readonly isLastRound = computed(() => {
    const game = this.gameState.game();
    return game ? this.round() >= game.rounds : false;
  });

  toggleRoundCard(): void {
    this.roundCardExpanded.set(!this.roundCardExpanded());
  }

  toggleRankedCard(): void {
    this.rankedCardExpanded.set(!this.rankedCardExpanded());
  }

  selectTeam(teamId: string): void {
    this.selectedTeamId.set(this.selectedTeamId() === teamId ? null : teamId);
  }

  constructor() {
    this.loadForRound(this.gameId(), this.round());

    /* Reage a trocas de `:id`/`:rodada` na URL desta mesma instância
       reaproveitada (ver `gameId`/`round` acima). No primeiro disparo a
       chave já é igual a `loadedKey`, então o guard abaixo pula — o load
       inicial já rodou na linha de cima, síncrono, sem esperar o primeiro
       tick do effect. */
    effect(() => {
      const gameId = this.gameId();
      const round = this.round();
      const key = `${gameId}/${round}`;
      if (key === this.loadedKey) return;
      this.loadedKey = key;
      this.loadForRound(gameId, round);
    });
  }

  /** Carrega jogo + equipes + resumo da rodada pro `gameId`/`round` dados.
   * Extraído do construtor pra também rodar de novo quando a instância é
   * reaproveitada com outro `:id`/`:rodada` (ver `effect` acima) — sem
   * isso a tela ficava presa mostrando o resumo da primeira visita. */
  private loadForRound(gameId: string, round: number): void {
    this.loading.set(true);
    // `loadLive` em vez de `loadGame`: mesmo game+teams de antes, sem
    // necessidade real de `registeredQuestions` aqui (a correção agora é
    // direto na tabela desta rodada, sem picker de pergunta), mas mantido
    // por já trazer tudo que a tela precisa numa única chamada.
    this.gameState.loadLive(gameId).then(async () => {
      if (this.gameState.notFound()) {
        await this.router.navigate(['/404']);
        return;
      }
      try {
        this.summary.set(await this.gameState.getRoundSummary(gameId, round));
      } finally {
        this.loading.set(false);
      }
    });
  }

  /** Entra em modo de edição: clona `questionRows()` pro rascunho local que
   * os inputs da tabela passam a ler/escrever. */
  startEditingScores(): void {
    if (!this.questionRows().length) return;
    const columns = this.teamColumns();
    const draft = new Map<number, Map<string, number>>();
    for (const row of this.questionRows()) {
      draft.set(row.question, new Map(columns.map((c, i) => [c.teamId, row.scores[i]])));
    }
    this.editedScores.set(draft);
    this.correctionError.set(null);
    this.editingScores.set(true);
  }

  cancelEditingScores(): void {
    this.editingScores.set(false);
    this.correctionError.set(null);
  }

  cellValue(question: number, teamId: string): number {
    return this.editedScores().get(question)?.get(teamId) ?? 0;
  }

  setCellValue(question: number, teamId: string, value: number): void {
    this.editedScores.update((draft) => {
      const next = new Map(draft);
      const inner = new Map(next.get(question));
      inner.set(teamId, Number.isFinite(value) ? value : 0);
      next.set(question, inner);
      return next;
    });
  }

  /** Manda pro servidor só as perguntas cuja pontuação de alguma equipe
   * mudou — cada envio leva a rodada inteira daquela pergunta (todas as
   * equipes), já que é assim que `submitQuestionScores` espera o payload;
   * a edição aqui é só o total por célula, então base = total editado e
   * bônus/penalidade zerados (a tabela não guarda mais essa divisão). */
  async saveCorrections(): Promise<void> {
    if (this.savingCorrections()) return;
    const columns = this.teamColumns();
    const original = new Map(this.questionRows().map((r) => [r.question, r]));
    const draft = this.editedScores();
    const changedQuestions = [...draft.entries()].filter(([question, teamValues]) => {
      const originalRow = original.get(question);
      if (!originalRow) return false;
      return columns.some((c, i) => (teamValues.get(c.teamId) ?? 0) !== originalRow.scores[i]);
    });

    if (!changedQuestions.length) {
      this.editingScores.set(false);
      return;
    }

    this.savingCorrections.set(true);
    this.correctionError.set(null);
    try {
      await Promise.all(
        changedQuestions.map(([question, teamValues]) =>
          this.gameState.submitQuestionScores(this.gameId(), {
            round: this.round(),
            question,
            scores: columns.map((c) => ({
              teamId: c.teamId,
              baseScore: teamValues.get(c.teamId) ?? 0,
              bonus: 0,
              penalty: 0,
            })),
          }),
        ),
      );
      this.summary.set(await this.gameState.getRoundSummary(this.gameId(), this.round()));
      this.editingScores.set(false);
      this.showCorrectionSnackbar();
    } catch {
      this.correctionError.set(
        'Não foi possível salvar as pontuações corrigidas. Tente novamente.',
      );
    } finally {
      this.savingCorrections.set(false);
    }
  }

  private showCorrectionSnackbar(): void {
    clearTimeout(this.correctionSnackbarTimeout);
    this.correctionSnackbarVisible.set(true);
    this.correctionSnackbarTimeout = setTimeout(
      () => this.correctionSnackbarVisible.set(false),
      2500,
    );
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
      await this.gameState.continueToNextRound(this.gameId());
      await this.router.navigate(['/jogo', this.gameId(), 'ao-vivo']);
    } finally {
      this.continuing.set(false);
    }
  }
}
