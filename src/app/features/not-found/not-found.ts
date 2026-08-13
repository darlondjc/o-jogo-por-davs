import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

/**
 * Tela 404 única do app — qualquer rota inexistente e qualquer jogo cujo id
 * não resolva (spec: "todos os encaminhamentos pra 404 devem ir pra essa
 * tela") caem aqui, em vez de cada tela mostrar seu próprio texto solto de
 * "não encontrado".
 */
@Component({
  selector: 'app-not-found',
  imports: [RouterLink],
  templateUrl: './not-found.html',
  styleUrl: './not-found.scss',
})
export class NotFound {}
