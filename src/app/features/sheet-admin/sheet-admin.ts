import { Component, inject, signal } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { PageHeader } from '../../core/components/page-header/page-header';
import type { SheetRankingEntry } from '@shared/ranking-sheet';

interface RankingConfig {
  sheetId: string;
  /** Placar liberado pro público. */
  live: boolean;
  /** Público pode ver o placar de cada rodada. */
  roundsEnabled: boolean;
  updatedAt: string;
  updatedBy: string;
}

/**
 * Admin do modo planilha (`/admin`, exige login). Troca (ou limpa) qual
 * planilha o placar público lê. Cada jogo pode ter a sua. A aba é fixa,
 * definida no servidor. Ao salvar, a API lê a
 * planilha antes de gravar, então link errado ou falta de compartilhamento
 * aparece aqui, não no telão.
 */
@Component({
  selector: 'app-sheet-admin',
  imports: [PageHeader, FormsModule, RouterLink, DatePipe],
  templateUrl: './sheet-admin.html',
  styleUrl: './sheet-admin.scss',
})
export class SheetAdmin {
  private readonly http = inject(HttpClient);

  sheet = '';
  /** Nome fixo da aba, vem do servidor. Só exibido, não editável. */
  readonly tab = signal('Ranking');

  readonly current = signal<RankingConfig | null>(null);
  readonly serviceAccountEmail = signal<string | null>(null);
  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly clearing = signal(false);
  readonly togglingLive = signal(false);
  readonly togglingRounds = signal(false);
  /** Bloco "Dados da planilha" (link, aba, instruções). Começa fechado
   * quando já existe planilha salva: no dia a dia o admin vem aqui pelo QR,
   * não pra trocar a planilha. Sem planilha, começa aberto. */
  readonly formOpen = signal(false);
  readonly error = signal<string | null>(null);
  readonly preview = signal<SheetRankingEntry[] | null>(null);
  readonly copied = signal(false);

  /** Link público do placar, pro QR e pro botão de copiar. */
  readonly publicUrl = `${location.origin}/placar`;
  readonly qrDataUrl = signal<string | null>(null);
  readonly linkCopied = signal(false);
  readonly qrCopied = signal(false);

  constructor() {
    // `{ default: QRCode }` e não o namespace: no build de produção só a
    // chave `default` existe (mesmo cuidado de game-admin.ts).
    import('qrcode')
      .then(({ default: QRCode }) => QRCode.toDataURL(this.publicUrl, { margin: 1, width: 176 }))
      .then((url) => this.qrDataUrl.set(url))
      .catch(() => this.qrDataUrl.set(null));

    this.http
      .get<{ config: RankingConfig | null; tab?: string; serviceAccountEmail: string | null }>(
        '/api/ranking?config=1',
      )
      .subscribe({
        next: (res) => {
          this.current.set(res.config);
          this.formOpen.set(!res.config);
          this.serviceAccountEmail.set(res.serviceAccountEmail);
          this.tab.set(res.tab ?? 'Ranking');
          if (res.config) this.sheet = this.sheetUrl(res.config.sheetId);
          this.loading.set(false);
        },
        error: (err) => {
          this.error.set(this.messageFrom(err, 'Não foi possível carregar a configuração.'));
          this.formOpen.set(true);
          this.loading.set(false);
        },
      });
  }

  save(): void {
    if (this.saving()) return;
    if (!this.sheet.trim()) {
      this.error.set('Cole o link da planilha.');
      return;
    }
    this.saving.set(true);
    this.error.set(null);
    this.preview.set(null);
    this.http
      .put<{ config: RankingConfig; entries: SheetRankingEntry[] }>('/api/ranking', {
        sheet: this.sheet,
      })
      .subscribe({
        next: (res) => {
          this.current.set(res.config);
          this.sheet = this.sheetUrl(res.config.sheetId);
          this.preview.set(res.entries);
          this.formOpen.set(false);
          this.saving.set(false);
        },
        error: (err) => {
          this.error.set(this.messageFrom(err, 'Não foi possível salvar.'));
          this.saving.set(false);
        },
      });
  }

  /** Libera ou oculta o placar pro público. Ocultar pede confirmação,
   * porque some com o placar da tela de todo mundo. */
  setLive(live: boolean): void {
    if (this.togglingLive()) return;
    if (!live && !window.confirm('Ocultar o placar? Quem estiver olhando volta a ver "Aguardando início do jogo".')) {
      return;
    }
    this.togglingLive.set(true);
    this.error.set(null);
    this.http.patch<{ config: RankingConfig }>('/api/ranking', { live }).subscribe({
      next: (res) => {
        this.current.set(res.config);
        this.togglingLive.set(false);
      },
      error: (err) => {
        this.error.set(this.messageFrom(err, 'Não foi possível alterar o placar.'));
        this.togglingLive.set(false);
      },
    });
  }

  /** Liga/desliga o placar por rodada na tela pública. */
  setRounds(enabled: boolean): void {
    if (this.togglingRounds()) return;
    this.togglingRounds.set(true);
    this.error.set(null);
    this.http.patch<{ config: RankingConfig }>('/api/ranking', { rounds: enabled }).subscribe({
      next: (res) => {
        this.current.set(res.config);
        this.togglingRounds.set(false);
      },
      error: (err) => {
        this.error.set(this.messageFrom(err, 'Não foi possível alterar o placar por rodada.'));
        this.togglingRounds.set(false);
      },
    });
  }

  toggleForm(): void {
    this.formOpen.update((open) => !open);
  }

  /** Tira a planilha do placar. Quem estiver olhando passa a ver
   * "aguardando" até uma nova ser salva. */
  clear(): void {
    if (this.clearing()) return;
    if (!window.confirm('Remover a planilha? O placar fica vazio até uma nova ser salva.')) return;
    this.clearing.set(true);
    this.error.set(null);
    this.http.delete('/api/ranking').subscribe({
      next: () => {
        this.current.set(null);
        this.preview.set(null);
        this.sheet = '';
        this.formOpen.set(true);
        this.clearing.set(false);
      },
      error: (err) => {
        this.error.set(this.messageFrom(err, 'Não foi possível limpar.'));
        this.clearing.set(false);
      },
    });
  }

  async copyEmail(): Promise<void> {
    const email = this.serviceAccountEmail();
    if (!email) return;
    try {
      await navigator.clipboard.writeText(email);
      this.copied.set(true);
      setTimeout(() => this.copied.set(false), 2000);
    } catch {
      // Sem permissão de clipboard: o e-mail continua visível pra copiar na mão.
    }
  }

  async copyLink(): Promise<void> {
    try {
      await navigator.clipboard.writeText(this.publicUrl);
      this.linkCopied.set(true);
      setTimeout(() => this.linkCopied.set(false), 2000);
    } catch {
      // Clipboard indisponível: o link continua visível na tela.
    }
  }

  async copyQrImage(): Promise<void> {
    const dataUrl = this.qrDataUrl();
    if (!dataUrl) return;
    try {
      const blob = await (await fetch(dataUrl)).blob();
      await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })]);
      this.qrCopied.set(true);
      setTimeout(() => this.qrCopied.set(false), 2000);
    } catch {
      // Sem suporte a copiar imagem: o QR continua na tela pra print.
    }
  }

  sheetUrl(id: string): string {
    return `https://docs.google.com/spreadsheets/d/${id}/edit`;
  }

  private messageFrom(err: unknown, fallback: string): string {
    if (err instanceof HttpErrorResponse && err.status !== 500) {
      const msg = err.error?.error;
      if (typeof msg === 'string') return msg;
    }
    return fallback;
  }
}
