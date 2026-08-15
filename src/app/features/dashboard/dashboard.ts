import { Component, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { ApiService } from '../../core/services/api.service';
import { compareGamesForDashboard, gameTypeLabel, pluralize, statusLabel } from '../../core/models';
import type { Game } from '../../core/models';
import { PageHeader } from '../../core/components/page-header/page-header';
import { PageFooter } from '../../core/components/page-footer/page-footer';

@Component({
  selector: 'app-dashboard',
  imports: [RouterLink, DatePipe, PageHeader, PageFooter],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.scss',
})
export class Dashboard {
  private readonly api = inject(ApiService);

  readonly games = signal<Game[]>([]);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);

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
}
