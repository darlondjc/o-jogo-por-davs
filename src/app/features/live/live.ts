import { Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { GameStateService } from '../../core/services/game-state.service';
import { ScoreEntry } from './score-entry/score-entry';
import { ScoreboardComponent } from '../scoreboard/scoreboard';
import { PageHeader } from '../../core/components/page-header/page-header';
import type { Scoreboard, Score, SubmitQuestionScoresRequest } from '../../core/models';

interface CorrectionTarget {
  round: number;
  question: number;
}

@Component({
  selector: 'app-live',
  imports: [ScoreEntry, ScoreboardComponent, PageHeader],
  templateUrl: './live.html',
  styleUrl: './live.scss',
})
export class Live {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  protected readonly gameState = inject(GameStateService);

  readonly gameId = this.route.snapshot.paramMap.get('id')!;
  readonly loading = signal(true);
  readonly submitting = signal(false);
  readonly error = signal<string | null>(null);
  readonly justRegisteredQuestion = signal<number | null>(null);

  /** No mobile a sidebar (placar da rodada/geral) vira uma gaveta que desliza
   * por cima do conteúdo em vez de empilhar embaixo do formulário — sem
   * isso, o placar ficava enterrado depois de uma lista de equipes longa.
   * Só importa abaixo de 960px; em telas largas a sidebar já fica sempre
   * visível e esse estado nunca é lido pelo template. */
  readonly sideOpen = signal(false);

  toggleSide(): void {
    this.sideOpen.update((open) => !open);
  }

  closeSide(): void {
    this.sideOpen.set(false);
  }

  /** Resposta em andamento pro dialog "corrigir perguntas anteriores" (ver
   * `score-entry.ts`): busca as pontuações da pergunta escolhida e devolve
   * pro componente via `correctionData`. */
  readonly correctionData = signal<{ target: CorrectionTarget; scores: Score[] } | null>(null);

  /**
   * Reaproveita o `app-scoreboard` (mesmo visual, mesma animação de
   * ultrapassagem) pra mostrar a pontuação só desta rodada, na metade de
   * cima da sidebar — rankeado pelo total da rodada em vez do total geral.
   * Sem posição anterior conhecida por rodada (só o back-end rastreia isso
   * pro total geral), então a seta de tendência fica neutra aqui.
   */
  readonly roundScoreboard = computed<Scoreboard | null>(() => {
    const board = this.gameState.scoreboard();
    if (!board) return null;
    const entries = [...board.entries]
      .sort((a, b) => b.roundTotal - a.roundTotal)
      .map((entry, i) => ({
        ...entry,
        overallTotal: entry.roundTotal,
        position: i + 1,
        previousPosition: null,
      }));
    return { ...board, entries };
  });

  constructor() {
    this.refresh();
  }

  async onCorrectionRequested(target: CorrectionTarget): Promise<void> {
    const scores = await this.gameState.getQuestionScores(this.gameId, target.round, target.question);
    this.correctionData.set({ target, scores });
  }

  private async refresh(): Promise<void> {
    const state = await this.gameState.loadLive(this.gameId);
    this.loading.set(false);
    if (this.gameState.notFound()) {
      await this.router.navigate(['/404']);
      return;
    }
    if (state?.game.status === 'RODADA_FINALIZADA') {
      await this.router.navigate(['/jogo', this.gameId, 'rodada', state.game.currentRound - 1]);
      return;
    }
    // Jogo já finalizado (ex: recarregou a tela ao vivo depois da última
    // pergunta) — mesmo destino do fluxo normal em `onSubmit`: o resumo da
    // última rodada, não o placar público direto (ver comentário lá).
    if (state?.game.status === 'FINALIZADO') {
      await this.router.navigate(['/jogo', this.gameId, 'rodada', state.game.currentRound]);
    }
  }

  async onSubmit(payload: SubmitQuestionScoresRequest): Promise<void> {
    this.submitting.set(true);
    this.error.set(null);
    try {
      const result = await this.gameState.submitQuestionScores(this.gameId, payload);
      this.justRegisteredQuestion.set(payload.question);
      setTimeout(() => this.justRegisteredQuestion.set(null), 1800);

      // `gameFinished` sempre vem acompanhado de `roundFinished` (é a
      // última pergunta da última rodada) — então tanto terminar uma
      // rodada quanto terminar o jogo inteiro levam pro mesmo resumo de
      // rodada. Lá, "Ver placar final" já aparece no lugar de "Continuar"
      // quando é a última rodada (ver `RoundSummaryPage.isLastRound`), e
      // "Voltar ao painel" leva pros dados gerais do jogo — não faz
      // sentido pular direto pro placar público sem passar por ali.
      if (result.roundFinished) {
        await this.router.navigate(['/jogo', this.gameId, 'rodada', payload.round]);
        return;
      }
      await this.refresh();
    } catch {
      this.error.set('Não foi possível registrar a pergunta. Tente novamente.');
    } finally {
      this.submitting.set(false);
    }
  }
}
