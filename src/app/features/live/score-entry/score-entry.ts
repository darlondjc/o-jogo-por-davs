import { Component, computed, effect, HostListener, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { computeFinalScore } from '@shared/scoring';
import { teamColor } from '../../../core/models';
import type { Score, SubmitQuestionScoresRequest, Team, TeamScoreInput } from '../../../core/models';
import type { RegisteredQuestion } from '../../../core/services/api.service';
import { PageFooter } from '../../../core/components/page-footer/page-footer';
import { SelectOnFocus } from '../../../core/directives/select-on-focus.directive';

interface CorrectionTarget {
  round: number;
  question: number;
}

interface CorrectionData {
  target: CorrectionTarget;
  scores: Score[];
}

interface TeamRow {
  teamId: string;
  name: string;
  color: string;
  selected: boolean;
  base: number;
  bonus: number;
  penalty: number;
}

/**
 * Peça central do sistema (spec seção 9 e 26): lança a pontuação de uma
 * pergunta inteira para todas as equipes em uma única tela, otimizada para
 * teclado. Não conhece persistência — só emite `scoresSubmitted`.
 */
@Component({
  selector: 'app-score-entry',
  imports: [FormsModule, PageFooter, SelectOnFocus],
  templateUrl: './score-entry.html',
  styleUrl: './score-entry.scss',
})
export class ScoreEntry {
  readonly teams = input.required<Team[]>();
  readonly round = input.required<number>();
  readonly question = input.required<number>();
  readonly submitting = input(false);
  /** Modo usado pelo resumo da rodada (spec "Melhorias": deixa corrigir uma
   * pontuação direto de lá). Nesse modo não existe "pergunta atual" pra
   * lançar — o componente abre direto no dialog de correção ao montar, e só
   * mostra a grade de pontuação depois que uma pergunta é escolhida. */
  readonly correctionOnly = input(false);

  /** Perguntas já registradas no jogo (todas as rodadas), pra alimentar o
   * dialog de "corrigir perguntas anteriores". Vazio na primeira pergunta —
   * é quando o botão de correção fica escondido. */
  readonly registeredQuestions = input<RegisteredQuestion[]>([]);
  /** Pontuações da pergunta escolhida no dialog, buscadas pelo pai
   * (ScoreEntry não conhece persistência — só pede via `correctionRequested`
   * e recebe aqui o resultado). */
  readonly correctionData = input<CorrectionData | null>(null);

  readonly scoresSubmitted = output<SubmitQuestionScoresRequest>();
  /** Emitido quando o operador escolhe, no dialog, qual pergunta corrigir —
   * o pai busca as pontuações dessa pergunta e devolve via `correctionData`. */
  readonly correctionRequested = output<CorrectionTarget>();

  /** Caixas de valor rápido (spec seção 13: velocidade > tudo). Clicar numa
   * caixa já seleciona o valor — sem precisar digitar. */
  readonly quickValuePresets: readonly number[] = [0, 1, 2, 3, 4, 5];

  /** Nenhum valor inicia selecionado — o operador escolhe explicitamente
   * antes de aplicar pontuação aos selecionados. */
  readonly quickValue = signal<number | null>(null);
  readonly rows = signal<TeamRow[]>([]);
  readonly confirming = signal(false);
  readonly correcting = signal(false);
  /** Rodada/pergunta sendo corrigida no momento — só tem valor enquanto
   * `correcting()` for true; preenchido a partir do dialog de seleção. */
  readonly correctionTarget = signal<CorrectionTarget | null>(null);
  /** Dialog de seleção "corrigir perguntas anteriores" está aberto. */
  readonly pickerOpen = signal(false);
  /** Pergunta marcada no dialog, ainda não confirmada — só navega pra
   * correção quando o operador clica no botão de confirmar. */
  readonly pickerSelection = signal<CorrectionTarget | null>(null);
  /** Confirmação separada do fluxo normal — só aparece quando "Ninguém
   * acertou" é clicado com alguma pontuação já preenchida (spec: perguntar
   * antes de descartar o que foi digitado). */
  readonly confirmingNobody = signal(false);

  /** Lista pro dialog, mais recente primeiro — é assim que o operador
   * costuma pensar ("a de agora pouco", não "a primeira"). */
  readonly pickableQuestions = computed(() => [...this.registeredQuestions()].reverse());

  /** Colore cada item do dialog "corrigir pergunta anterior" pela rodada —
   * mesma rodada, mesma cor, pra agrupar visualmente as perguntas de uma
   * mesma rodada numa lista longa e plana. Reaproveita a paleta de cores das
   * equipes (já cicla por número) em vez de criar uma paleta nova só pra
   * isso. */
  protected readonly roundColor = teamColor;

  /** Combo do visual arcade: quantas confirmações seguidas tiveram pelo
   * menos uma equipe com pontuação final positiva. Zera assim que uma
   * confirmação fecha sem ninguém pontuar (inclui "Ninguém acertou", que já
   * zera as linhas antes de chamar `confirmSubmit`). Só estado visual, não
   * é persistido nem enviado ao back-end. */
  readonly combo = signal(0);
  readonly comboVisible = computed(() => this.combo() > 0);

  readonly selectedCount = computed(() => this.rows().filter((r) => r.selected).length);

  /** Se nenhuma equipe tem base, bônus ou penalidade atribuídos, não há o
   * que registrar — usado para desabilitar "REGISTRAR PONTUAÇÕES". */
  readonly hasAnyScore = computed(() =>
    this.rows().some((r) => r.base !== 0 || r.bonus !== 0 || r.penalty !== 0),
  );

  // `distributedTotal` removed — total is no longer shown in the UI

  readonly targetLabel = computed(() => {
    const target = this.correctionTarget();
    return this.correcting() && target
      ? `Corrigindo rodada ${target.round} · pergunta ${target.question}`
      : `Pergunta ${this.question()}`;
  });

  /**
   * Cicla entre 3 cores para o título "Pergunta X", só para deixar visível
   * que a pergunta realmente avançou (a tela some pouco entre uma pergunta
   * e outra, então a cor dá uma pista rápida disso).
   */
  readonly titleColorClass = computed(() => `title-color-${(this.question() - 1) % 3}`);

  /**
   * Alterna entre duas classes com a mesma animação a cada pergunta, só para
   * forçar o CSS a reiniciar a animação (trocar de classe reinicia; manter a
   * mesma classe não reinicia nada).
   */
  readonly titlePulseClass = computed(() => (this.question() % 2 === 0 ? 'title-pulse-a' : 'title-pulse-b'));

  /** Só abre o dialog de correção sozinho uma vez, ao montar em modo
   * `correctionOnly` — sem isso o effect abaixo reabriria o dialog toda vez
   * que ele fosse recomputado (ex: depois de cancelar). */
  private pickerAutoOpened = false;

  constructor() {
    // Recria as linhas sempre que a lista de equipes ou a pergunta corrente mudar.
    effect(() => {
      const teams = this.teams();
      // Ler `question` só para disparar o efeito a cada avanço de pergunta.
      this.question();
      this.correcting.set(false);
      this.correctionTarget.set(null);
      this.pickerOpen.set(false);
      this.confirming.set(false);
      this.confirmingNobody.set(false);
      this.rows.set(
        [...teams]
          .sort((a, b) => a.order - b.order)
          .map((t) => ({
            teamId: t.id,
            name: t.name,
            color: teamColor(t.order),
            selected: false,
            base: 0,
            bonus: 0,
            penalty: 0,
          })),
      );
    });

    // Modo do resumo da rodada: nada de tela de lançamento normal, começa
    // direto pedindo qual pergunta corrigir. Espera `pickableQuestions` ter
    // pelo menos um item — `registeredQuestions` pode chegar depois do
    // primeiro ciclo, e sem essa espera o dialog nunca abriria sozinho.
    // Registrado depois do effect acima de propósito: aquele reseta
    // `pickerOpen` toda vez que roda, e sem essa ordem o auto-open seria
    // desfeito no mesmo ciclo em que aconteceu.
    effect(() => {
      if (this.correctionOnly() && !this.pickerAutoOpened && this.pickableQuestions().length) {
        this.pickerAutoOpened = true;
        this.pickerSelection.set(null);
        this.pickerOpen.set(true);
      }
    });

    // Mantém a barra de confirmação aberta (e desabilitada) enquanto o envio
    // está em andamento — só fecha quando o pai termina a requisição. Sem
    // isso, o botão principal reaparecia clicável durante o envio e dava a
    // impressão de que era preciso registrar de novo.
    effect(() => {
      if (!this.submitting()) {
        this.confirming.set(false);
        this.correcting.set(false);
        this.confirmingNobody.set(false);
      }
    });

    // Assim que o pai devolve as pontuações da pergunta escolhida no dialog
    // (ver `confirmPickerSelection`), preenche o formulário com elas e entra em
    // modo de correção — sempre que `correctionData` mudar (o pai emite um
    // objeto novo a cada resposta, mesmo se for a mesma pergunta de novo).
    effect(() => {
      const data = this.correctionData();
      if (data) this.applyCorrectionData(data);
    });
  }

  toggleSelect(teamId: string): void {
    this.rows.update((rows) =>
      rows.map((r) => (r.teamId === teamId ? { ...r, selected: !r.selected } : r)),
    );
  }

  selectAll(): void {
    this.rows.update((rows) => rows.map((r) => ({ ...r, selected: true })));
  }

  clearSelection(): void {
    this.rows.update((rows) => rows.map((r) => ({ ...r, selected: false })));
  }

  selectQuickValue(value: number): void {
    this.quickValue.set(value);
  }

  applyQuickValue(): void {
    const value = this.quickValue();
    if (value === null) return;
    this.rows.update((rows) =>
      rows.map((r) => (r.selected ? { ...r, base: value } : r)),
    );
  }

  setBase(teamId: string, value: number): void {
    this.rows.update((rows) =>
      rows.map((r) => (r.teamId === teamId ? { ...r, base: value } : r)),
    );
  }

  setBonus(teamId: string, value: number): void {
    this.rows.update((rows) =>
      rows.map((r) => (r.teamId === teamId ? { ...r, bonus: value } : r)),
    );
  }

  setPenalty(teamId: string, value: number): void {
    this.rows.update((rows) =>
      rows.map((r) => (r.teamId === teamId ? { ...r, penalty: value } : r)),
    );
  }

  finalScore(row: TeamRow): number {
    return computeFinalScore({ baseScore: row.base, bonus: row.bonus, penalty: row.penalty });
  }

  openPicker(): void {
    if (this.submitting() || this.confirming() || !this.pickableQuestions().length) return;
    this.pickerSelection.set(null);
    this.pickerOpen.set(true);
  }

  closePicker(): void {
    this.pickerOpen.set(false);
    this.pickerSelection.set(null);
  }

  /** Marca a pergunta no dialog — ainda não navega, só destaca a escolha. */
  selectPickerItem(target: CorrectionTarget): void {
    this.pickerSelection.set(target);
  }

  isPickerItemSelected(target: CorrectionTarget): boolean {
    const sel = this.pickerSelection();
    return !!sel && sel.round === target.round && sel.question === target.question;
  }

  /** Operador confirmou, no dialog, qual pergunta corrigir — pede ao pai as
   * pontuações já registradas dessa pergunta (`correctionData` traz a
   * resposta, tratada no effect do construtor). */
  confirmPickerSelection(): void {
    const target = this.pickerSelection();
    if (!target) return;
    this.correctionRequested.emit(target);
  }

  private applyCorrectionData(data: CorrectionData): void {
    const byTeam = new Map(data.scores.map((s) => [s.teamId, s]));
    this.correctionTarget.set(data.target);
    this.correcting.set(true);
    this.confirming.set(false);
    this.pickerOpen.set(false);
    this.rows.update((rows) =>
      rows.map((r) => {
        const prev = byTeam.get(r.teamId);
        return prev
          ? { ...r, selected: true, base: prev.baseScore, bonus: prev.bonus, penalty: prev.penalty }
          : { ...r, selected: false, base: 0, bonus: 0, penalty: 0 };
      }),
    );
  }

  cancelCorrection(): void {
    this.correcting.set(false);
    this.correctionTarget.set(null);
    this.confirming.set(false);
    this.rows.update((rows) => rows.map((r) => ({ ...r, base: 0, bonus: 0, penalty: 0, selected: false })));
  }

  requestConfirm(): void {
    if (this.submitting()) return;
    if (!this.hasAnyScore()) return;
    this.confirming.set(true);
  }

  cancelConfirm(): void {
    this.confirming.set(false);
  }

  /**
   * "Ninguém acertou": se já havia alguma pontuação preenchida, pede
   * confirmação antes de descartá-la (mostra a barra e espera o clique em
   * CONFIRMAR). Se a tela ainda estava zerada, não há nada a perder — registra
   * direto, sem passar pela barra de confirmação (senão ela aparecia
   * dizendo "confirmar?" quando já estava salvando).
   */
  requestNobodyGotIt(): void {
    if (this.submitting() || this.confirming()) return;
    if (this.hasAnyScore()) {
      this.confirmingNobody.set(true);
      return;
    }
    this.submitNobodyGotIt();
  }

  cancelNobodyConfirm(): void {
    this.confirmingNobody.set(false);
  }

  submitNobodyGotIt(): void {
    if (this.submitting()) return;
    this.rows.update((rows) => rows.map((r) => ({ ...r, base: 0, bonus: 0, penalty: 0 })));
    this.confirmSubmit();
    // Não fecha a barra aqui, pelo mesmo motivo do fluxo normal — ver
    // comentário em `confirmSubmit`.
  }

  confirmSubmit(): void {
    if (this.submitting()) return;
    const target = this.correcting() ? this.correctionTarget() : null;
    const anyPositive = this.rows().some((r) => this.finalScore(r) > 0);
    this.combo.set(anyPositive ? this.combo() + 1 : 0);
    const scores: TeamScoreInput[] = this.rows().map((r) => ({
      teamId: r.teamId,
      baseScore: r.base,
      bonus: r.bonus,
      penalty: r.penalty,
    }));
    this.scoresSubmitted.emit({
      round: target?.round ?? this.round(),
      question: target?.question ?? this.question(),
      scores,
    });
    // Não fecha a barra aqui — fica visível (e desabilitada) até `submitting`
    // voltar a `false`, para não parecer que nada aconteceu enquanto o
    // pedido está em andamento (ver efeito no construtor).
  }

  @HostListener('window:keydown', ['$event'])
  onKeydown(event: KeyboardEvent): void {
    const target = event.target as HTMLElement | null;
    const isTyping =
      target instanceof HTMLInputElement ||
      target instanceof HTMLTextAreaElement ||
      target instanceof HTMLSelectElement;

    if (event.key === 'Enter') {
      event.preventDefault();
      this.confirming() ? this.confirmSubmit() : this.requestConfirm();
      return;
    }

    if (isTyping) return;

    if (event.code === 'Space') {
      event.preventDefault();
      this.confirming() ? this.confirmSubmit() : this.requestConfirm();
      return;
    }

    if (event.key === 'Escape') {
      // Durante a confirmação, Esc cancela a confirmação; durante a escolha
      // no dialog, Esc fecha o dialog; fora disso, Esc limpa a seleção
      // (atalho do botão "Limpar seleção").
      if (this.confirming()) {
        this.cancelConfirm();
      } else if (this.pickerOpen()) {
        this.closePicker();
      } else {
        this.clearSelection();
      }
      return;
    }

    if ((event.key === 'a' || event.key === 'A') && !this.confirming()) {
      event.preventDefault();
      this.selectAll();
      return;
    }

    if ((event.key === 'p' || event.key === 'P') && !this.confirming() && !this.correcting()) {
      event.preventDefault();
      this.openPicker();
      return;
    }

    if (!this.confirming() && /^[0-5]$/.test(event.key)) {
      event.preventDefault();
      this.selectQuickValue(Number(event.key));
    }
  }
}
