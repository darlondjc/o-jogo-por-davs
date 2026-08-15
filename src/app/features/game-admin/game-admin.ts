import { Component, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { GameStateService } from '../../core/services/game-state.service';
import { ScoreboardComponent } from '../scoreboard/scoreboard';
import { PageHeader } from '../../core/components/page-header/page-header';
import { PageFooter } from '../../core/components/page-footer/page-footer';
import { gameTypeLabel, pluralize, statusLabel, teamColor } from '../../core/models';

interface RoundBreakdownRow {
  teamId: string;
  teamName: string;
  color: string;
  /** Índice 0 = rodada 1, e assim por diante. */
  roundTotals: number[];
  overallTotal: number;
}

@Component({
  selector: 'app-game-admin',
  imports: [RouterLink, DatePipe, ScoreboardComponent, PageHeader, PageFooter],
  templateUrl: './game-admin.html',
  styleUrl: './game-admin.scss',
})
export class GameAdmin {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  protected readonly gameState = inject(GameStateService);

  readonly gameId = this.route.snapshot.paramMap.get('id')!;
  readonly starting = signal(false);
  readonly finishing = signal(false);
  readonly error = signal<string | null>(null);
  readonly linkCopied = signal(false);
  readonly qrImageCopied = signal(false);

  readonly publicUrl = computed(() => `${location.origin}/jogo/${this.gameId}/placar`);
  readonly qrDataUrl = signal<string | null>(null);
  protected readonly statusLabel = statusLabel;
  protected readonly gameTypeLabel = gameTypeLabel;
  protected readonly pluralize = pluralize;

  readonly roundNumbers = computed<number[]>(() => {
    const game = this.gameState.game();
    return game ? Array.from({ length: game.rounds }, (_, i) => i + 1) : [];
  });

  /** Pontuação de cada equipe, rodada a rodada — não existia nenhuma forma
   * de ver isso depois de um jogo pronto (melhorias doc: "consigo olhar
   * como ficou a pontuação de cada rodada das equipes?"). Os totais por
   * rodada já vinham prontos do back-end (`Scoreboard.roundTotalsByRound`),
   * só faltava expor numa tabela. */
  readonly roundBreakdown = computed<RoundBreakdownRow[]>(() => {
    const board = this.gameState.scoreboard();
    const game = this.gameState.game();
    if (!board || !game) return [];
    return [...board.entries]
      .sort((a, b) => a.position - b.position)
      .map((entry) => ({
        teamId: entry.teamId,
        teamName: entry.teamName,
        color: teamColor(entry.order),
        roundTotals: this.roundNumbers().map(
          (round) => board.roundTotalsByRound[round]?.find((r) => r.teamId === entry.teamId)?.total ?? 0,
        ),
        overallTotal: entry.overallTotal,
      }));
  });

  /** Usado pra mostrar o aviso "Cadastre ao menos duas equipes." ao lado
   * do título do card "Placar geral" — mais perto de onde a pessoa
   * realmente vai cadastrar as equipes do que a lista de bloqueios no
   * rodapé (ver `configBlockers` abaixo). */
  readonly needsMoreTeams = computed(() => this.gameState.teams().length < 2);

  /** Bloqueios de configuração do jogo mostrados no rodapé, ao lado do
   * botão "Iniciar o jogo". O de equipes fica de fora daqui de propósito:
   * tem aviso próprio junto do card "Placar geral" (`needsMoreTeams`
   * acima) pra não repetir o mesmo aviso duas vezes na tela. */
  readonly configBlockers = computed<string[]>(() => {
    const game = this.gameState.game();
    const blockers: string[] = [];
    if (game && game.rounds <= 0) blockers.push('Defina ao menos uma rodada.');
    if (game && game.questionsPerRound <= 0) blockers.push('Defina ao menos uma pergunta por rodada.');
    return blockers;
  });

  /** Todos os bloqueios que impedem iniciar o jogo, equipes incluídas —
   * usado só pra desabilitar o botão "Iniciar o jogo" (o texto em si é
   * exibido em dois lugares diferentes, ver `needsMoreTeams` e
   * `configBlockers`). */
  readonly startBlockers = computed<string[]>(() => {
    const blockers = [...this.configBlockers()];
    if (this.needsMoreTeams()) blockers.unshift('Cadastre ao menos duas equipes.');
    return blockers;
  });

  constructor() {
    this.gameState.loadGame(this.gameId).then(() => {
      if (this.gameState.notFound()) {
        this.router.navigate(['/404']);
        return;
      }
      this.gameState.loadScoreboard(this.gameId);
    });
    import('qrcode').then((QRCode) =>
      QRCode.toDataURL(this.publicUrl(), { margin: 1, width: 176 }).then((url) =>
        this.qrDataUrl.set(url),
      ),
    );
  }

  async start(): Promise<void> {
    if (this.startBlockers().length) return;
    this.starting.set(true);
    this.error.set(null);
    try {
      await this.gameState.startGame(this.gameId);
      await this.router.navigate(['/jogo', this.gameId, 'ao-vivo']);
    } catch {
      this.error.set('Não foi possível iniciar o jogo.');
    } finally {
      this.starting.set(false);
    }
  }

  /** Ação destrutiva e sem volta (não existe botão nem endpoint pra
   * reabrir um jogo já finalizado) — pede confirmação antes de seguir, e
   * ao terminar redireciona pra esta mesma tela (jogo/:id), que passa a
   * funcionar como o resumo do jogo assim que o status vira FINALIZADO
   * (placar final + pontuação por rodada, sem mais o rodapé de ações). */
  async finish(): Promise<void> {
    if (!window.confirm('Finalizar o jogo? Depois de finalizado não será possível registrar mais pontuações.')) {
      return;
    }
    this.finishing.set(true);
    this.error.set(null);
    try {
      await this.gameState.finishGame(this.gameId);
      await this.router.navigate(['/jogo', this.gameId]);
    } catch {
      this.error.set('Não foi possível finalizar o jogo.');
    } finally {
      this.finishing.set(false);
    }
  }

  async copyLink(): Promise<void> {
    try {
      await navigator.clipboard.writeText(this.publicUrl());
      this.linkCopied.set(true);
      setTimeout(() => this.linkCopied.set(false), 2000);
    } catch {
      /* clipboard indisponível — o link continua visível na tela */
    }
  }

  async copyQrImage(): Promise<void> {
    const dataUrl = this.qrDataUrl();
    if (!dataUrl) return;
    try {
      const blob = await (await fetch(dataUrl)).blob();
      await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })]);
      this.qrImageCopied.set(true);
      setTimeout(() => this.qrImageCopied.set(false), 2000);
    } catch {
      /* Clipboard de imagem indisponível (navegador sem suporte ou fora de contexto seguro) —
         a imagem continua visível na tela e pode ser copiada manualmente. */
    }
  }
}
