import { Component, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { GameStateService } from '../../core/services/game-state.service';
import { ScoreboardComponent } from '../scoreboard/scoreboard';
import { gameTypeLabel, statusLabel } from '../../core/models';

@Component({
  selector: 'app-game-admin',
  imports: [RouterLink, DatePipe, ScoreboardComponent],
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

  readonly startBlockers = computed<string[]>(() => {
    const game = this.gameState.game();
    const teams = this.gameState.teams();
    const blockers: string[] = [];
    if (!teams.length) blockers.push('Cadastre ao menos uma equipe.');
    if (game && game.rounds <= 0) blockers.push('Defina ao menos uma rodada.');
    if (game && game.questionsPerRound <= 0) blockers.push('Defina ao menos uma pergunta por rodada.');
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

  async finish(): Promise<void> {
    this.finishing.set(true);
    this.error.set(null);
    try {
      await this.gameState.finishGame(this.gameId);
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
