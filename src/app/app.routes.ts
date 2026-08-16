import { Routes } from '@angular/router';
import { authGuard } from './core/guards/auth.guard';

export const routes: Routes = [
  {
    path: 'login',
    loadComponent: () => import('./features/login/login').then((m) => m.Login),
  },
  {
    path: '',
    canActivate: [authGuard],
    loadComponent: () => import('./features/dashboard/dashboard').then((m) => m.Dashboard),
  },
  {
    // Sem `game-form` próprio — `GameConfig` cobre os dois casos (criar e
    // editar), já que os campos são idênticos e o cadastro de equipes
    // já era feito em rascunho local até "Salvar" mesmo pra jogo
    // existente (spec: "game-form não faz sentido, dá pra fazer tudo em
    // game-config"). Precisa vir antes de `jogo/:id` abaixo, senão
    // "novo" seria interpretado como um id de jogo.
    path: 'jogo/novo',
    canActivate: [authGuard],
    loadComponent: () => import('./features/game-config/game-config').then((m) => m.GameConfig),
  },
  {
    path: 'jogo/:id',
    canActivate: [authGuard],
    loadComponent: () => import('./features/game-admin/game-admin').then((m) => m.GameAdmin),
  },
  {
    path: 'jogo/:id/configuracao',
    canActivate: [authGuard],
    loadComponent: () => import('./features/game-config/game-config').then((m) => m.GameConfig),
  },
  {
    path: 'jogo/:id/ao-vivo',
    canActivate: [authGuard],
    loadComponent: () => import('./features/live/live').then((m) => m.Live),
  },
  {
    path: 'jogo/:id/rodada/:rodada',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/round-summary/round-summary').then((m) => m.RoundSummaryPage),
  },
  {
    // Placar público, sem login — pensado para espectadores (ver README seção "Login").
    path: 'jogo/:id/placar',
    loadComponent: () =>
      import('./features/public-scoreboard/public-scoreboard').then((m) => m.PublicScoreboard),
  },
  {
    path: '404',
    loadComponent: () => import('./features/not-found/not-found').then((m) => m.NotFound),
  },
  {
    // Qualquer rota que não bateu em nada acima — inclui ids de jogo
    // inexistentes, tratados via redirect nas próprias telas (ver
    // GameStateService.notFound).
    path: '**',
    loadComponent: () => import('./features/not-found/not-found').then((m) => m.NotFound),
  },
];
