import {
  ApplicationConfig,
  provideBrowserGlobalErrorListeners,
  provideZoneChangeDetection,
} from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { progressInterceptor } from 'ngx-progressbar/http';

import { routes } from './app.routes';
import { authInterceptor } from './core/interceptors/auth.interceptor';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(routes),
    // O interceptor liga/desliga a barra de progresso automaticamente junto
    // com o ciclo de vida de cada requisição HTTP (ver <ng-progress ngProgressHttp/> no app root).
    // authInterceptor: uma 401 durante o uso do app (sessão expirou) manda de volta pro /login.
    provideHttpClient(withInterceptors([progressInterceptor, authInterceptor])),
  ],
};
