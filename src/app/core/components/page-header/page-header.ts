import { Component, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { UserChip } from '../user-chip/user-chip';

/**
 * Cabeçalho fixo no topo da tela: link de "voltar" (esquerda), marca do jogo
 * centralizada (logo + "O JOGO") e chip do usuário logado (direita).
 * Extraído da tela de registro de pontuações (`live.html`) pra ser
 * reutilizado em qualquer tela "cheia" do jogo. O destino e o texto do link
 * de volta variam por tela, então entram como inputs.
 */
@Component({
  selector: 'app-page-header',
  imports: [RouterLink, UserChip],
  templateUrl: './page-header.html',
  styleUrl: './page-header.scss',
})
export class PageHeader {
  /** Destino do link "voltar" — mesmo formato aceito por `[routerLink]`
   * (string como `'/'` ou array de segmentos como `['/jogo', gameId]`).
   * Opcional: quando omitido, o link não navega sozinho (sem `routerLink`)
   * e a navegação fica inteiramente por conta de quem escuta `backClick` —
   * necessário quando a tela precisa interceptar o clique antes de sair
   * (ex: confirmar perda de alterações não salvas, ver game-config). */
  readonly backLink = input<string | unknown[]>();
  /** Rótulo do link "voltar". Opcional: quando omitido, o link some por
   * completo (só sobra marca + chip) — caso da home/dashboard, que não tem
   * pra onde "voltar". */
  readonly backLabel = input<string>();

  /** Emitido no clique do link "voltar", além da navegação via
   * `routerLink` (quando `backLink` foi passado). Quem precisa controlar a
   * navegação (ver `backLink` acima) chama `event.preventDefault()` aqui. */
  readonly backClick = output<MouseEvent>();
}
