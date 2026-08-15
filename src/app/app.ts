import { Component, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { filter } from 'rxjs/operators';
import { NgProgressbar } from 'ngx-progressbar';
import { NgProgressHttp } from 'ngx-progressbar/http';
import { AuthService } from './core/services/auth.service';
import { UserChip } from './core/components/user-chip/user-chip';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, NgProgressbar, NgProgressHttp, UserChip],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {
  protected readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  /** As telas que usam `app-page-header` (home, painel do jogo, registro de
   * pontuações, configuração) já embutem o `app-user-chip` no próprio
   * cabeçalho fixo — mostrar também o chip flutuante global duplicaria a
   * informação (spec "Tela de registro de pontuações": cabeçalho com o chip
   * do lado direito). Casa `/`, `/jogo/:id`, `/jogo/:id/ao-vivo` e
   * `/jogo/:id/configuracao`, não as outras sub-rotas de jogo (rodada,
   * placar público), que continuam com o chip flutuante. */
  private static readonly PAGE_HEADER_ROUTE = /^\/$|^\/jogo\/[^/]+(\/ao-vivo|\/configuracao)?$/;
  private readonly currentUrl = signal(this.router.url);
  protected readonly showFloatingUserChip = signal(true);

  constructor() {
    void this.auth.checkSession();

    this.router.events
      .pipe(
        filter((event) => event instanceof NavigationEnd),
        takeUntilDestroyed(),
      )
      .subscribe(() => {
        this.currentUrl.set(this.router.url);
        this.showFloatingUserChip.set(!App.PAGE_HEADER_ROUTE.test(this.currentUrl()));
      });
  }
}
