import { Component } from '@angular/core';

/**
 * Rodapé fixo na base da página, pra manter as ações principais de uma tela
 * sempre alcançáveis mesmo com o conteúdo acima rolando. Extraído da tela
 * de registro de pontuações (`score-entry.html`) pra ser reutilizado em
 * outras telas "cheias" do jogo — a primeira outra tela a usar é o painel
 * do jogo (`game-admin.html`). Só a moldura (fixo, fundo, borda, sombra,
 * respiro) vive aqui; o conteúdo em si (quais botões, em qual estado) é
 * decidido por quem usa, via `<ng-content>` — cada tela tem um conjunto de
 * ações diferente.
 */
@Component({
  selector: 'app-page-footer',
  imports: [],
  templateUrl: './page-footer.html',
  styleUrl: './page-footer.scss',
})
export class PageFooter {}
