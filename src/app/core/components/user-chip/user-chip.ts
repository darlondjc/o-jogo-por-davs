import { Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../../services/auth.service';

/**
 * Chip "usuário logado + sair", reutilizado tanto flutuando no canto
 * superior direito (a maioria das telas, via `.user-bar` em app.html) quanto
 * embutido no cabeçalho fixo da tela de lançamento de pontos (live.html) —
 * ver improvements doc "Tela de registro de pontuações". O posicionamento
 * (fixed vs inline) é decidido por quem usa o componente, via CSS; aqui só
 * vive o conteúdo do chip em si.
 */
@Component({
  selector: 'app-user-chip',
  imports: [],
  templateUrl: './user-chip.html',
  styleUrl: './user-chip.scss',
})
export class UserChip {
  protected readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  protected async logout(): Promise<void> {
    await this.auth.logout();
    void this.router.navigateByUrl('/login');
  }
}
