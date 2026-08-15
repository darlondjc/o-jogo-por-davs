import { Component, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { catchError, forkJoin, map, of } from 'rxjs';
import { ApiService } from '../../core/services/api.service';
import { compareGamesForDashboard, gameTypeLabel, pluralize, statusLabel } from '../../core/models';
import type { Game } from '../../core/models';
import { PageHeader } from '../../core/components/page-header/page-header';
import { PageFooter } from '../../core/components/page-footer/page-footer';
import { Snackbar } from '../../core/components/snackbar/snackbar';

@Component({
  selector: 'app-dashboard',
  imports: [RouterLink, DatePipe, PageHeader, PageFooter, Snackbar],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.scss',
})
export class Dashboard {
  private readonly api = inject(ApiService);

  readonly games = signal<Game[]>([]);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);

  /** Modo "Apagar jogos": os cards param de navegar e passam a marcar/
   * desmarcar seleção; o rodapé troca pra "Cancelar"/"Excluir (N)". */
  readonly selectionMode = signal(false);
  readonly selectedIds = signal<ReadonlySet<string>>(new Set());
  readonly deleting = signal(false);
  readonly deleteError = signal<string | null>(null);
  /** Snackbar de confirmação depois de excluir com sucesso — mesmo padrão
   * de `game-config.ts` (some sozinha depois de um tempo). */
  readonly deleteConfirmationVisible = signal(false);
  readonly deleteConfirmationMessage = signal('');
  private deleteConfirmationTimeout?: ReturnType<typeof setTimeout>;

  constructor() {
    this.api.listGames().subscribe({
      next: (games) => {
        this.games.set([...games].sort(compareGamesForDashboard));
        this.loading.set(false);
      },
      error: () => {
        this.error.set('Não foi possível carregar os jogos.');
        this.loading.set(false);
      },
    });
  }

  protected readonly statusLabel = statusLabel;
  protected readonly gameTypeLabel = gameTypeLabel;
  protected readonly pluralize = pluralize;

  isSelected(id: string): boolean {
    return this.selectedIds().has(id);
  }

  enterSelectionMode(): void {
    this.selectionMode.set(true);
    this.selectedIds.set(new Set());
    this.deleteError.set(null);
  }

  cancelSelection(): void {
    this.selectionMode.set(false);
    this.selectedIds.set(new Set());
    this.deleteError.set(null);
  }

  /** Enquanto em modo seleção, clicar no card marca/desmarca em vez de
   * navegar pro jogo. O `routerLink` no template já vira `null` nesse modo
   * (sem `href`, a diretiva não intercepta o clique pra navegar) —
   * `preventDefault` aqui é só reforço, caso sobre algum comportamento
   * padrão do navegador. */
  onCardClick(event: MouseEvent, id: string): void {
    if (!this.selectionMode()) return;
    event.preventDefault();
    const next = new Set(this.selectedIds());
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    this.selectedIds.set(next);
  }

  confirmDelete(): void {
    const ids = [...this.selectedIds()];
    if (!ids.length || this.deleting()) return;

    const confirmed = window.confirm(
      ids.length === 1
        ? 'Apagar o jogo selecionado? Essa ação não pode ser desfeita.'
        : `Apagar os ${ids.length} jogos selecionados? Essa ação não pode ser desfeita.`,
    );
    if (!confirmed) return;

    this.deleting.set(true);
    this.deleteError.set(null);

    // Cada exclusão é reportada individualmente (`catchError` por item) pra
    // uma falha isolada não derrubar as outras — importante porque o
    // usuário selecionou vários jogos de uma vez.
    forkJoin(
      ids.map((id) =>
        this.api.deleteGame(id).pipe(
          map(() => ({ id, ok: true as const })),
          catchError(() => of({ id, ok: false as const })),
        ),
      ),
    ).subscribe((results) => {
      const deletedIds = new Set(results.filter((r) => r.ok).map((r) => r.id));
      const failedIds = results.filter((r) => !r.ok).map((r) => r.id);

      this.games.set(this.games().filter((g) => !deletedIds.has(g.id)));
      this.deleting.set(false);

      if (deletedIds.size) {
        this.showDeleteConfirmation(
          deletedIds.size === 1 ? 'Jogo apagado!' : `${deletedIds.size} jogos apagados!`,
        );
      }

      if (failedIds.length) {
        this.deleteError.set(
          failedIds.length === results.length
            ? 'Não foi possível apagar os jogos selecionados.'
            : failedIds.length === 1
              ? '1 jogo não pôde ser apagado.'
              : `${failedIds.length} jogos não puderam ser apagados.`,
        );
        this.selectedIds.set(new Set(failedIds));
      } else {
        this.selectionMode.set(false);
        this.selectedIds.set(new Set());
      }
    });
  }

  private showDeleteConfirmation(message: string): void {
    clearTimeout(this.deleteConfirmationTimeout);
    this.deleteConfirmationMessage.set(message);
    this.deleteConfirmationVisible.set(true);
    this.deleteConfirmationTimeout = setTimeout(() => this.deleteConfirmationVisible.set(false), 2500);
  }
}
