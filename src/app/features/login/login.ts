import { Component, ElementRef, afterNextRender, effect, inject, viewChild } from '@angular/core';
import { Router, ActivatedRoute } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'app-login',
  imports: [],
  templateUrl: './login.html',
  styleUrl: './login.scss',
})
export class Login {
  protected readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  private readonly buttonContainer = viewChild.required<ElementRef<HTMLDivElement>>('googleButton');

  constructor() {
    // Já logado (ex: chegou em /login com sessão válida) → segue direto.
    effect(() => {
      if (this.auth.user()) {
        const returnUrl = this.route.snapshot.queryParamMap.get('returnUrl') ?? '/';
        void this.router.navigateByUrl(returnUrl);
      }
    });

    afterNextRender(async () => {
      await Promise.all([this.auth.checkSession(), this.auth.loadConfig()]);
      if (!this.auth.user() && this.auth.googleClientId()) {
        await this.auth.renderGoogleButton(this.buttonContainer().nativeElement);
      }
    });
  }
}
