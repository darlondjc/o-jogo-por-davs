import { inject } from '@angular/core';
import { Router, type CanActivateFn } from '@angular/router';
import { AuthService } from '../services/auth.service';

/** Protege as telas administrativas — exige sessão válida (ver AuthService/login). */
export const authGuard: CanActivateFn = async (_route, state) => {
  const auth = inject(AuthService);
  const router = inject(Router);

  const user = auth.user() ?? (await auth.checkSession());
  if (user) return true;

  return router.createUrlTree(['/login'], { queryParams: { returnUrl: state.url } });
};
