import { Directive, HostListener } from '@angular/core';

/**
 * Seleciona o valor inteiro do campo ao ganhar foco — digitar um número novo
 * já sobrescreve, sem precisar apagar o valor anterior antes. Usado nos
 * campos numéricos de pontuação (base/bônus/penalidade) e configuração de
 * jogo (rodadas, perguntas por rodada, jogadores).
 */
@Directive({
  selector: 'input[appSelectOnFocus]',
})
export class SelectOnFocus {
  @HostListener('focus', ['$event'])
  onFocus(event: FocusEvent): void {
    const target = event.target;
    if (target instanceof HTMLInputElement) target.select();
  }
}
