import { Component, input } from '@angular/core';

export type SnackbarKind = 'success' | 'error';

/**
 * Toast flutuante de confirmação, fixo no rodapé da tela. Quem usa controla
 * a visibilidade de fora (via `@if`) e o tempo em tela — o componente só
 * cuida da aparência e da entrada/saída animada. Primeiro uso: confirmação
 * de "salvo com sucesso" na tela de configuração de jogo.
 */
@Component({
  selector: 'app-snackbar',
  imports: [],
  templateUrl: './snackbar.html',
  styleUrl: './snackbar.scss',
})
export class Snackbar {
  readonly message = input.required<string>();
  readonly kind = input<SnackbarKind>('success');
}
