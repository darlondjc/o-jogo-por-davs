import { Component, HostListener, computed, effect, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { Location } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { map } from 'rxjs';
import { GameStateService } from '../../core/services/game-state.service';
import { GAME_TYPE_OPTIONS, teamColor } from '../../core/models';
import type { GameType, NewTeam, Team } from '../../core/models';
import { PageHeader } from '../../core/components/page-header/page-header';
import { PageFooter } from '../../core/components/page-footer/page-footer';
import { Snackbar } from '../../core/components/snackbar/snackbar';
import { SelectOnFocus } from '../../core/directives/select-on-focus.directive';

/** Equipe em edição na tela, ainda não necessariamente gravada. `id: null`
 * = equipe nova, só existe no rascunho local. */
interface DraftTeam {
  key: string;
  id: string | null;
  name: string;
  playersCount: number;
}

interface TeamDiff {
  creates: { draft: DraftTeam; order: number }[];
  updates: { id: string; patch: Partial<NewTeam> }[];
  deletes: string[];
}

/** Data de hoje em `yyyy-mm-dd`, no fuso local (não UTC) — usado só pra
 * pré-preencher o campo "Data" de um jogo novo (rota `jogo/novo`, sem
 * `:id`, ver `isNew` abaixo). */
function todayIsoDate(): string {
  const now = new Date();
  const offsetMs = now.getTimezoneOffset() * 60_000;
  return new Date(now.getTime() - offsetMs).toISOString().slice(0, 10);
}

@Component({
  selector: 'app-game-config',
  imports: [ReactiveFormsModule, PageHeader, PageFooter, Snackbar, SelectOnFocus],
  templateUrl: './game-config.html',
  styleUrl: './game-config.scss',
})
export class GameConfig {
  private readonly fb = inject(FormBuilder);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly location = inject(Location);
  protected readonly gameState = inject(GameStateService);

  /** `null` = rota `jogo/novo` (sem `:id`) — jogo ainda não existe no
   * servidor. Deixa de ser `readonly` porque, ao criar o jogo em
   * `saveAll()`, passa a apontar pro id recém-criado (ver `isNew`
   * abaixo), e porque `routeId`/o `effect` no construtor também
   * reatribuem (ver comentário lá). */
  private gameId = this.route.snapshot.paramMap.get('id');
  /** Reflete se `gameId` é `null` — signal (não getter) porque a tela
   * precisa re-renderizar (título, rótulo do botão de voltar etc.) no
   * instante em que `saveAll()` cria o jogo e vira "modo edição" sem
   * navegar de verdade (ver comentário em `saveAll`). */
  readonly isNew = signal(this.gameId === null);
  /** `:id` da rota, mas via Observable — não só o snapshot lido uma vez
   * (`gameId` acima). `jogo/:id/configuracao` é a MESMA `Route` pra
   * qualquer jogo, então o Angular reaproveita a instância deste
   * componente ao navegar direto de um jogo pro outro nesta tela (ex:
   * voltar/avançar do navegador) — o `RouteReuseStrategy` padrão não
   * recria o componente só porque o parâmetro mudou. Sem reagir a isso
   * (ver `effect` no construtor), a tela ficava presa mostrando os dados
   * do jogo carregado na primeira visita, mesmo com a URL já apontando
   * pra outro (bug real reportado: "aparecem os dados de um outro jogo
   * que eu já tinha visto antes"). */
  private readonly routeId = toSignal(this.route.paramMap.pipe(map((params) => params.get('id'))), {
    initialValue: this.gameId,
  });
  readonly savingGame = signal(false);
  /** Salva TODAS as equipes de uma vez (spec "Melhorias": cadastrar equipe
   * fica só em memória, sem round-trip por equipe — só grava tudo quando
   * confirma). */
  readonly savingTeams = signal(false);
  /** Dados do jogo e equipes agora saem num só botão ("Salvar dados do
   * jogo") — este flag cobre as duas gravações pra mostrar um único estado
   * de carregamento. */
  readonly saving = computed(() => this.savingGame() || this.savingTeams());
  /** Snackbar de confirmação depois de "Salvar dados do jogo" (só some
   * sozinha depois de um tempo, sem interação nenhuma). */
  readonly saveConfirmationVisible = signal(false);
  private saveConfirmationTimeout?: ReturnType<typeof setTimeout>;
  readonly error = signal<string | null>(null);
  readonly editingKey = signal<string | null>(null);
  readonly gameTypeOptions = GAME_TYPE_OPTIONS;
  readonly gameSubmitted = signal(false);
  readonly teamSubmitted = signal(false);

  readonly gameForm = this.fb.nonNullable.group({
    name: ['', Validators.required],
    date: ['', Validators.required],
    location: ['', Validators.required],
    description: [''],
    gameType: ['POP_GERAIS' as GameType, Validators.required],
    rounds: [3, [Validators.required, Validators.min(1)]],
    questionsPerRound: [20, [Validators.required, Validators.min(1)]],
  });

  readonly teamForm = this.fb.nonNullable.group({
    name: ['', Validators.required],
    playersCount: [10, [Validators.required, Validators.min(0)]],
  });

  /** `gameForm.dirty`/`.invalid` não são signals — sem escutar `valueChanges`
   * aqui, `canStartOrContinue` abaixo não reagiria a digitação (só a coisas
   * que já são signal, como `draftTeams`). Usado só pra forçar reavaliação;
   * o valor em si não importa, o estado real vem de `gameForm` mesmo. */
  private readonly gameFormChanges = toSignal(this.gameForm.valueChanges, {
    initialValue: this.gameForm.getRawValue(),
  });

  readonly starting = signal(false);

  /** Snapshot do que está gravado no servidor — usado só pra comparar
   * contra o rascunho na hora de salvar (`teamDiff`). Não é signal porque
   * só é reatribuído junto com `draftTeams` (que já dispara a reatividade). */
  private originalTeams: Team[] = [];

  readonly draftTeams = signal<DraftTeam[]>([]);
  private nextTempKey = 0;

  readonly teamDiff = computed<TeamDiff>(() => {
    const draft = this.draftTeams();
    const originalById = new Map(this.originalTeams.map((t) => [t.id, t]));
    const draftIds = new Set(draft.filter((d) => d.id).map((d) => d.id!));

    const creates = draft
      .map((d, i) => ({ draft: d, order: i + 1 }))
      .filter((x) => x.draft.id === null);

    const updates: { id: string; patch: Partial<NewTeam> }[] = [];
    draft.forEach((d, i) => {
      if (!d.id) return;
      const original = originalById.get(d.id);
      if (!original) return;
      const order = i + 1;
      const patch: Partial<NewTeam> = {};
      if (d.name !== original.name) patch.name = d.name;
      if (d.playersCount !== original.playersCount) patch.playersCount = d.playersCount;
      if (order !== original.order) patch.order = order;
      if (Object.keys(patch).length) updates.push({ id: d.id, patch });
    });

    const deletes = this.originalTeams.filter((t) => !draftIds.has(t.id)).map((t) => t.id);

    return { creates, updates, deletes };
  });

  readonly hasUnsavedTeamChanges = computed(() => {
    const diff = this.teamDiff();
    return diff.creates.length > 0 || diff.updates.length > 0 || diff.deletes.length > 0;
  });

  /** Habilita o botão "Iniciar/Continuar jogo" no rodapé: jogo ainda não
   * finalizado, ao menos duas equipes, campos obrigatórios do jogo
   * preenchidos e nada em aberto sem salvar (nem no formulário do jogo, nem
   * no rascunho de equipes) — só faz sentido levar pra tela ao vivo um jogo
   * cujo estado na tela bate com o que está gravado no servidor. */
  readonly canStartOrContinue = computed(() => {
    const game = this.gameState.game();
    if (!game || game.status === 'FINALIZADO') return false;
    if (this.draftTeams().length < 2) return false;
    if (this.editingKey()) return false;
    if (this.hasUnsavedTeamChanges()) return false;
    this.gameFormChanges();
    return this.gameForm.valid && !this.gameForm.dirty;
  });

  readonly startOrContinueLabel = computed(() =>
    this.gameState.game()?.status === 'CONFIGURACAO' ? 'Iniciar jogo' : 'Continuar jogo',
  );

  constructor() {
    this.loadForId(this.gameId);

    /* Reage a trocas de `:id` na URL desta mesma instância reaproveitada
       (ver `routeId` acima). No primeiro disparo `id` já é igual a
       `this.gameId` (ambos lidos do mesmo snapshot inicial), então o
       guard abaixo pula — o load inicial já rodou na linha de cima,
       síncrono, sem esperar o primeiro tick do effect. Também ignora o id
       que `saveAll` seta manualmente ao criar um jogo (`this.gameId =
       game.id`), porque esse não passa pelo Router (ver
       `Location.replaceState` lá) e portanto nunca muda `routeId`. */
    effect(() => {
      const id = this.routeId();
      if (id === this.gameId) return;
      this.gameId = id;
      this.isNew.set(id === null);
      this.loadForId(id);
    });
  }

  /** Carrega o jogo (ou reseta pro estado de "jogo novo") pro `gameId`
   * dado. Extraído do construtor pra também rodar de novo quando a
   * instância é reaproveitada com outro `:id` (ver `routeId`/`effect`
   * acima) — sem isso a tela ficava presa mostrando o jogo carregado na
   * primeira visita. */
  private loadForId(gameId: string | null): void {
    /* `GameStateService` é singleton (`providedIn: 'root'`): zera aqui
       antes de carregar, tanto no load inicial quanto num reaproveitamento
       — sem isso a tela mostraria o jogo anterior (desta ou de outra
       visita) até o novo terminar de carregar. Zerar também fecha o `@if`
       do template, que volta a mostrar "Carregando…" nesse intervalo em
       vez de qualquer dado desatualizado. */
    this.gameState.game.set(null);
    this.gameState.teams.set([]);

    if (gameId) {
      this.gameState.loadGame(gameId).then(() => {
        if (this.gameState.notFound()) {
          this.router.navigate(['/404']);
          return;
        }
        const game = this.gameState.game();
        if (game) {
          this.gameForm.patchValue({
            name: game.name,
            date: game.date,
            location: game.location,
            description: game.description ?? '',
            gameType: game.gameType,
            rounds: game.rounds,
            questionsPerRound: game.questionsPerRound,
          });
        }
        this.resetDraftFromServer();
      });
    } else {
      this.gameForm.patchValue({ date: todayIsoDate() });
    }
  }

  /** Fecha a aba/recarrega com equipes ainda não salvas — evita perder
   * cadastro sem querer, já que agora nada vai pro servidor até clicar em
   * "Salvar dados do jogo". */
  @HostListener('window:beforeunload', ['$event'])
  onBeforeUnload(event: BeforeUnloadEvent): void {
    if (this.hasUnsavedTeamChanges()) {
      event.preventDefault();
      event.returnValue = '';
    }
  }

  private resetDraftFromServer(): void {
    this.originalTeams = [...this.gameState.teams()].sort((a, b) => a.order - b.order);
    this.draftTeams.set(
      this.originalTeams.map((t) => ({
        key: t.id,
        id: t.id,
        name: t.name,
        playersCount: t.playersCount,
      })),
    );
  }

  teamColorAt(index: number): string {
    return teamColor(index + 1);
  }

  /** Único botão da tela: grava os dados do jogo e, na sequência, o
   * rascunho de equipes (spec "só um botão 'Salvar dados do jogo'" tanto
   * pra jogo novo quanto pra jogo já existente) — em modo criação
   * (`isNew`), cria o jogo primeiro pra ter um id antes de gravar as
   * equipes do rascunho. */
  async saveAll(): Promise<void> {
    this.gameSubmitted.set(true);
    if (this.gameForm.invalid) {
      this.gameForm.markAllAsTouched();
      this.error.set('Preencha os campos obrigatórios destacados abaixo.');
      return;
    }
    this.savingGame.set(true);
    this.error.set(null);
    const value = this.gameForm.getRawValue();
    const payload = {
      name: value.name,
      date: value.date,
      location: value.location,
      description: value.description || undefined,
      gameType: value.gameType,
      rounds: value.rounds,
      questionsPerRound: value.questionsPerRound,
    };
    try {
      if (this.isNew()) {
        const game = await this.gameState.createGame(payload);
        this.gameId = game.id;
        this.isNew.set(false);
        /* Troca só a URL pro id recém-criado, sem navegar de verdade —
           `router.navigate` recriaria o componente (perderia o rascunho
           de equipes que está prestes a ser salvo, mais um round-trip de
           `loadGame` à toa já que acabamos de criar o jogo com estes
           mesmos dados). `replaceState` deixa refresh/voltar do navegador
           corretos sem nada disso. */
        this.location.replaceState(`/jogo/${game.id}/configuracao`);
      } else {
        await this.gameState.updateGame(this.gameId!, payload);
      }
    } catch {
      this.error.set(
        this.isNew()
          ? 'Não foi possível criar o jogo. Tente novamente.'
          : 'Não foi possível salvar as configurações.',
      );
      this.savingGame.set(false);
      return;
    }
    this.gameForm.markAsPristine();
    this.savingGame.set(false);
    const teamsOk = await this.saveTeams();
    if (teamsOk) this.showSaveConfirmation();
  }

  /** Botão "Iniciar/Continuar jogo" do rodapé (só aparece com
   * `canStartOrContinue`). Em CONFIGURACAO chama a mesma transição de
   * status da tela do jogo antes de navegar; nos demais status o jogo já
   * está rodando, então só leva pra onde ele parou. */
  async startOrContinue(): Promise<void> {
    const game = this.gameState.game();
    if (!game || !this.canStartOrContinue()) return;
    // `canStartOrContinue` já exige `gameState.game()` preenchido, que só
    // acontece depois do jogo existir no servidor (load ou criação em
    // `saveAll`) — `gameId` sempre está setado neste ponto.
    const gameId = this.gameId!;

    if (game.status === 'CONFIGURACAO') {
      this.starting.set(true);
      this.error.set(null);
      try {
        await this.gameState.startGame(gameId);
      } catch {
        this.error.set('Não foi possível iniciar o jogo.');
        this.starting.set(false);
        return;
      }
      this.starting.set(false);
    }

    const current = this.gameState.game()!;
    if (current.status === 'RODADA_FINALIZADA') {
      await this.router.navigate([
        '/jogo',
        gameId,
        'rodada',
        current.currentRound - 1 || current.currentRound,
      ]);
    } else {
      await this.router.navigate(['/jogo', gameId, 'ao-vivo']);
    }
  }

  private showSaveConfirmation(): void {
    clearTimeout(this.saveConfirmationTimeout);
    this.saveConfirmationVisible.set(true);
    this.saveConfirmationTimeout = setTimeout(() => this.saveConfirmationVisible.set(false), 2500);
  }

  startEditTeam(team: DraftTeam): void {
    this.editingKey.set(team.key);
    this.teamForm.setValue({ name: team.name, playersCount: team.playersCount });
  }

  cancelEditTeam(): void {
    this.editingKey.set(null);
    this.teamSubmitted.set(false);
    this.teamForm.reset({ name: '', playersCount: 10 });
  }

  /** Só mexe no rascunho local — nada vai pro servidor aqui (spec
   * "Melhorias": cadastro de equipe rápido, sem round-trip por equipe). */
  submitTeamDraft(): void {
    this.teamSubmitted.set(true);
    if (this.teamForm.invalid) {
      this.error.set('Preencha os campos obrigatórios da equipe.');
      return;
    }
    const value = this.teamForm.getRawValue();
    const editing = this.editingKey();
    if (editing) {
      this.draftTeams.update((list) =>
        list.map((t) =>
          t.key === editing ? { ...t, name: value.name, playersCount: value.playersCount } : t,
        ),
      );
    } else {
      const key = `new-${this.nextTempKey++}`;
      this.draftTeams.update((list) => [
        ...list,
        { key, id: null, name: value.name, playersCount: value.playersCount },
      ]);
    }
    this.cancelEditTeam();
  }

  removeTeamDraft(key: string): void {
    if (this.editingKey() === key) this.cancelEditTeam();
    this.draftTeams.update((list) => list.filter((t) => t.key !== key));
  }

  moveTeamDraft(key: string, direction: -1 | 1): void {
    this.draftTeams.update((list) => {
      const index = list.findIndex((t) => t.key === key);
      const swapIndex = index + direction;
      if (index === -1 || swapIndex < 0 || swapIndex >= list.length) return list;
      const copy = [...list];
      [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
      return copy;
    });
  }

  /** Grava de uma vez só tudo que mudou no rascunho (criações, edições,
   * remoções e reordenação) — as três categorias são independentes entre
   * si, então rodam em paralelo em vez de uma requisição por equipe.
   * Retorna `false` (e deixa a mensagem de erro na tela) se algo falhar. */
  async saveTeams(): Promise<boolean> {
    const diff = this.teamDiff();
    if (!diff.creates.length && !diff.updates.length && !diff.deletes.length) return true;

    // Só é chamado depois de `saveAll` garantir que o jogo existe (edição
    // já tinha `gameId`; criação acabou de setar antes de chegar aqui).
    const gameId = this.gameId!;
    this.savingTeams.set(true);
    this.error.set(null);
    try {
      await Promise.all([
        ...diff.creates.map(({ draft, order }) =>
          this.gameState.addTeam(gameId, {
            name: draft.name,
            playersCount: draft.playersCount,
            order,
          }),
        ),
        ...diff.updates.map(({ id, patch }) => this.gameState.updateTeam(gameId, id, patch)),
        ...diff.deletes.map((id) => this.gameState.deleteTeam(gameId, id)),
      ]);
      this.resetDraftFromServer();
      return true;
    } catch {
      this.error.set('Não foi possível salvar as equipes. Tente novamente.');
      return false;
    } finally {
      this.savingTeams.set(false);
    }
  }

  private confirmLeaveIfUnsaved(): boolean {
    if (!this.hasUnsavedTeamChanges()) return true;
    return window.confirm('Você tem equipes não salvas nesta tela. Sair sem salvar?');
  }

  async onBackClick(event: Event): Promise<void> {
    event.preventDefault();
    if (this.confirmLeaveIfUnsaved()) {
      // Em modo criação ainda não existe jogo (nem página dele) pra
      // voltar — volta pro dashboard em vez de `/jogo/null`.
      await this.router.navigate(this.isNew() ? ['/'] : ['/jogo', this.gameId]);
    }
  }
}
