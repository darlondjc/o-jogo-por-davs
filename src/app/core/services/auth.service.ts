import { HttpClient } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { catchError, firstValueFrom, of } from 'rxjs';

export interface AuthUser {
  email: string;
  name: string;
  picture: string | null;
}

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize(config: {
            client_id: string;
            callback: (response: { credential: string }) => void;
          }): void;
          renderButton(parent: HTMLElement, options: Record<string, unknown>): void;
        };
      };
    };
  }
}

const GIS_SCRIPT_SRC = 'https://accounts.google.com/gsi/client';

/**
 * Login com a conta Google (ver seção "Login" do README): nada de
 * usuário/senha — quem entra é validado no back-end contra a lista de
 * editores da planilha do jogo. Este serviço só cuida do lado do
 * front-end: carregar o widget do Google, trocar o ID token pela sessão, e
 * manter o usuário atual em um signal para o resto do app consultar.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);

  readonly user = signal<AuthUser | null>(null);
  readonly checkingSession = signal(true);
  readonly googleClientId = signal<string | null>(null);
  /** Mensagem de negócio (ex: "seu e-mail não é editor da planilha") — distinta de erro técnico. */
  readonly loginError = signal<string | null>(null);
  readonly loggingIn = signal(false);

  private gisScriptPromise: Promise<void> | null = null;

  get isLoggedIn(): boolean {
    return this.user() !== null;
  }

  /** Consultado no boot do app e pelo guard de rota. Resolve sem lançar erro. */
  async checkSession(): Promise<AuthUser | null> {
    this.checkingSession.set(true);
    try {
      const res = await firstValueFrom(
        this.http.get<{ user: AuthUser }>('/api/auth/me').pipe(catchError(() => of(null))),
      );
      this.user.set(res?.user ?? null);
      return res?.user ?? null;
    } finally {
      this.checkingSession.set(false);
    }
  }

  async loadConfig(): Promise<{ googleClientId: string | null }> {
    const config = await firstValueFrom(
      this.http
        .get<{ googleClientId: string | null }>('/api/auth/config')
        .pipe(catchError(() => of({ googleClientId: null }))),
    );
    this.googleClientId.set(config.googleClientId);
    return config;
  }

  private loadGisScript(): Promise<void> {
    if (this.gisScriptPromise) return this.gisScriptPromise;
    this.gisScriptPromise = new Promise((resolve, reject) => {
      if (window.google?.accounts?.id) {
        resolve();
        return;
      }
      const script = document.createElement('script');
      script.src = GIS_SCRIPT_SRC;
      script.async = true;
      script.defer = true;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error('Falha ao carregar o script de login do Google.'));
      document.head.appendChild(script);
    });
    return this.gisScriptPromise;
  }

  /** Renderiza o botão oficial "Entrar com Google" dentro de `container`. */
  async renderGoogleButton(container: HTMLElement): Promise<void> {
    const clientId = this.googleClientId();
    if (!clientId) return;

    await this.loadGisScript();
    window.google!.accounts.id.initialize({
      client_id: clientId,
      callback: (response) => void this.loginWithIdToken(response.credential),
    });
    window.google!.accounts.id.renderButton(container, {
      type: 'standard',
      theme: 'filled_black',
      size: 'large',
      shape: 'pill',
      text: 'signin_with',
      locale: 'pt-BR',
      width: 320,
    });
  }

  private async loginWithIdToken(idToken: string): Promise<void> {
    this.loggingIn.set(true);
    this.loginError.set(null);
    try {
      const res = await firstValueFrom(
        this.http.post<{ user: AuthUser }>('/api/auth/google', { idToken }),
      );
      this.user.set(res.user);
    } catch (err) {
      // 403 = recusa de negócio (e-mail não é editor da planilha); outros = erro técnico genérico.
      const message =
        (err as { error?: { error?: string } })?.error?.error ??
        'Não foi possível entrar com o Google. Tente novamente.';
      this.loginError.set(message);
      this.user.set(null);
    } finally {
      this.loggingIn.set(false);
    }
  }

  async logout(): Promise<void> {
    await firstValueFrom(
      this.http.post('/api/auth/logout', {}).pipe(catchError(() => of(null))),
    );
    this.user.set(null);
  }
}
