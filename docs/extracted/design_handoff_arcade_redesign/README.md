# Handoff: Redesign visual arcade — "O Jogo"

## Overview
Redesign visual (HUD de fliperama) para as telas **Lançamento ao vivo** (`/jogo/:id/ao-vivo`) e **Placar público** (`/jogo/:id/placar`) do repositório `darlondjc/o-jogo-por-davs`. Objetivo: dar uma cara de arcade/fliperama ao produto, mantendo toda a lógica Angular existente (signals, componentes, serviços) intacta — só a camada visual muda.

## Sobre os arquivos deste pacote
Os arquivos `.dc.html` anexados (`lancamento-ao-vivo.reference.html`, `placar-publico.reference.html`) são **referências de design construídas em HTML/CSS/JS** para prototipagem — não são código Angular e não devem ser copiados literalmente. A tarefa é **recriar esse visual dentro do ambiente Angular já existente** (standalone components, SCSS, `[ngModel]`, signals), reaproveitando ao máximo a estrutura de template/lógica que já existe em `score-entry.ts/html`, `live.ts/html`, `public-scoreboard.ts/html` e `scoreboard.ts/html`.

## Fidelidade
**Alta fidelidade (hifi)**: cores, tipografia, espaçamentos e efeitos abaixo são os finais pretendidos. Implemente pixel-a-pixel, ajustando apenas o necessário para caber nos breakpoints já existentes no SCSS atual (960px, 860px, 720px).

## Escopo
Somente estas duas telas (não mexer nas demais: dashboard, game-form, game-config, game-admin, login, round-summary, not-found):
1. `src/app/features/live/live.html` + `live.scss` (shell da tela ao vivo)
2. `src/app/features/live/score-entry/score-entry.html` + `score-entry.scss` (o componente principal, onde está a maior parte do trabalho)
3. `src/app/features/public-scoreboard/public-scoreboard.html` + `public-scoreboard.scss`
4. `src/app/features/scoreboard/scoreboard.html` + `scoreboard.scss` (usado dentro das duas telas acima — cuidado, também é usado no game-admin, que **não** deve mudar; talvez seja necessário um input `variant="arcade"` ou reaproveitar `[compact]` para não vazar o novo estilo para o game-admin)
5. Tokens novos em `src/styles.scss` (adicionar, não remover os existentes — o resto do app continua com o visual atual)

## Design tokens (adicionar em `:root` de `src/styles.scss`, com nomes novos para não quebrar o resto do app)
```scss
--arcade-bg: #05070d;
--arcade-bg-elevated: #0d1220;
--arcade-bg-elevated-2: #141a2e;
--arcade-border: #223050;
--arcade-text: #eef2fb;
--arcade-text-muted: #8894b8;
--arcade-text-faint: #5c6890;
--arcade-accent: #4ea1ff;   /* HUD blue, cor de destaque principal */
--arcade-gold: #ffcc33;     /* high-score / líder / botões primários */
--arcade-positive: #33ff99;
--arcade-negative: #ff4d6a;
--arcade-purple: #c084fc;
--font-pixel: 'Press Start 2P', monospace;   /* títulos, valores de pontuação, botões grandes */
--font-arcade-body: 'Space Grotesk', sans-serif; /* corpo de texto */
/* --font-mono (JetBrains Mono) já existe — reaproveitar para HUD/labels/números pequenos */
```
Import das fontes (Google Fonts) no `<head>` de `src/index.html`:
`Press Start 2P`, `Space Grotesk:wght@500;600;700`. `JetBrains Mono` já está declarado como token mas confirme se está importado.

## Efeito global (scanline)
Um overlay de scanlines de CRT cobrindo as duas telas:
```scss
.arcade-scanlines::before {
  content: '';
  position: absolute;
  inset: 0;
  background: repeating-linear-gradient(to bottom, rgba(255,255,255,.035) 0px, rgba(255,255,255,.035) 1px, transparent 1px, transparent 3px);
  pointer-events: none;
  z-index: 5;
  mix-blend-mode: overlay;
}
```
Aplicar essa classe no elemento raiz de `live.html` (`.live-page`) e de `public-scoreboard.html` (`.public-page`) com `position: relative` no host.

## Tela 1 — Lançamento ao vivo (`live` + `score-entry`)
**Layout**: mantém o grid 2 colunas (`1fr 420px`) de `live.scss`, mas sem `overflow: hidden` no host — o conteúdo cresce mais que 100vh (rolagem normal). Header fixo no topo do grid com "O JOGO" (font-pixel, dourado) à esquerda e "TRIVIA · AO VIVO" (JetBrains Mono, cinza) à direita.

**Progress chips**: "RODADA X/Y" e "PERGUNTA X/Y" viram pastilhas HUD — fundo `--arcade-bg-elevated-2`, borda `--arcade-border`, `border-radius: 4px`, texto JetBrains Mono 13px bold, com glow (`box-shadow: 0 0 12px -4px` na cor do texto — azul para rodada, dourado para pergunta).

**Combo streak (novo elemento de jogo)**: pastilha "COMBO x{{n}}" com fundo gradiente dourado, texto escuro, aparece quando pelo menos uma equipe pontuou na última pergunta consecutiva; zera quando "ninguém acertou" é confirmado. É um contador simples incrementado a cada confirmação com pontuação > 0, resetado em `submitNobodyGotIt()`.

**Título da pergunta**: font-pixel 28px, cor cicla entre azul/verde/roxo a cada pergunta confirmada (mesma lógica de `title-color-0/1/2` já existente, só troca a paleta), com leve glow (`text-shadow`) e mantém a animação de "pop" (`title-pop`) já existente no score-entry.scss.

**Quick value bar → "botões de fliperama"**: os presets de pontuação (0 a 5) viram botões redondos-chunky de 52×52px, cada um com uma cor de plástico de arcade diferente (vermelho, laranja, dourado, verde, azul, roxo), fundo em gradiente vertical, `box-shadow: 0 4px 0 <tom mais escuro da mesma cor>` simulando um botão físico 3D. No `:active`, `transform: translateY(2px)` + sombra reduzida para simular o clique. O botão selecionado fica sólido na cor cheia; os demais em gradiente translúcido.

**Seleção de equipe → "ficha no fliperama"**: o círculo de seleção (`select-toggle`) vira uma ficha/token: círculo com borda 2px na cor do time, e quando selecionado ganha um preenchimento radial (`radial-gradient(circle at 35% 30%, #fff8, <cor do time>)`) simulando uma ficha metálica brilhando, com o check (✓) em cima.

**Linhas de equipe**: mantém a mesma grade de campos (nome, base, bônus, penalidade, total), mas:
- fundo `--arcade-bg-elevated` (não selecionada) / `--arcade-bg-elevated-2` (selecionada), borda na cor do time quando selecionada, com glow leve.
- nome em JetBrains Mono bold 16px, truncado com ellipsis se não couber (`white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0`), coluna do nome com `minmax(90px, 1fr)`.
- inputs numéricos (base/bônus/penalidade) em fundo quase preto (`#04070f`), texto colorido (base = verde, bônus = azul, penalidade = vermelho), como um mostrador digital — 64px de largura.
- total da linha em font-pixel 16px, verde se positivo, vermelho se negativo, cinza se zero.

**Botões primários do footer**: "REGISTRAR PONTUAÇÕES" em font-pixel, fundo gradiente dourado, `box-shadow: 0 5px 0` (efeito 3D), glow externo; ao clicar, "afunda" (`translateY(3px)` + sombra menor). "Ninguém acertou" continua ghost/outline, mas com hover vermelho.

**Barra de confirmação**: mantém o comportamento de dois passos já existente (clicar → mostra barra "Confirmar pontuações desta pergunta?" → confirma), só troca o estilo visual para o HUD (fundo `--arcade-bg-elevated-2`, borda `--arcade-accent`).

**Sidebar "Placar geral"**: reaproveita o componente `scoreboard` compacto — ver seção "Placar / scoreboard" abaixo para o estilo compartilhado.

## Tela 2 — Placar público (`public-scoreboard`)
**Layout**: coluna única centralizada, largura máx. ~640px, fundo com leve gradiente radial escuro no topo (`radial-gradient(ellipse at 50% -10%, #101830 0%, var(--arcade-bg) 55%)`) além do scanline overlay.

**Header**: "O JOGO" em font-pixel 22px, dourado, com glow pulsante contínuo (`text-shadow` animando entre glow fraco e forte, ciclo ~2.4s) — efeito de letreiro de fliperama. Abaixo, "RODADA X · PERGUNTA Y" em JetBrains Mono azul. Indicador "AO VIVO" com ponto piscando (`led-blink`, já existe conceito parecido em `.live-dot`, só recolorir para verde `--arcade-positive` e usar o mesmo timing).

**Seção "High score"**: reaproveita o componente `scoreboard`, mas com título "HIGH SCORE" em font-pixel, e cada posição mostra um "medalha" estilizada: 1º/2º/3º com símbolos circulados (①②③) em vez de emoji de troféu, dourado para o 1º lugar. Linha do líder recebe fundo em gradiente sutil dourado e glow (`box-shadow: 0 0 20px -8px var(--arcade-gold)`).

**Placar / scoreboard (componente compartilhado)**: como este componente também é usado no `game-admin` (tela fora de escopo), criar uma variante — por exemplo um `@Input() variant: 'default' | 'arcade' = 'default'` no `Scoreboard` component, aplicando classes/estilos condicionalmente, OU duplicar o template só para essas duas telas se for mais simples dado o tamanho do componente. Estilo arcade da linha:
- fundo `--arcade-bg-elevated` / `--arcade-bg-elevated-2`,
- nome em JetBrains Mono bold,
- total em font-pixel, colorido com a cor do time,
- seta de tendência (▲/▼/—) com as cores positive/negative/faint.

**Seção "Rodada N"**: lista simples das pontuações da rodada atual, mantém texto e estrutura atuais (`+{{total}}`), só recolore para o tema escuro/HUD (fundo `--arcade-bg-elevated-2`, texto positive).

**Jogo finalizado**: mantém a copy atual ("🏁 Jogo finalizado") — não inventar texto novo.

## Interações e estados (sem mudança de lógica, só de estilo)
- Todo o fluxo de teclado do `score-entry` (0-5, Enter/Espaço, A, Esc, P) continua igual — nenhuma tecla nova.
- Two-step confirm (clique → barra de confirmação → confirma) é o comportamento existente, não recriar do zero.
- Polling do placar público (a cada 3s) continua igual.
- `justRegisteredQuestion()` continua disparando a mensagensuccess "✓ Pontuações da pergunta N confirmadas" (cor `--arcade-positive`).

## Assets
Nenhuma imagem nova. Ícones são apenas caracteres/símbolos Unicode (①②③, ▲▼—, ✓) — não usar emoji além dos que já existem no app (✓, 🏁).

## Arquivos de referência neste pacote
- `lancamento-ao-vivo.reference.html` — protótipo completo da tela de lançamento ao vivo (self-contained, abra num navegador).
- `placar-publico.reference.html` — protótipo completo do placar público.
- `screenshot-lancamento-ao-vivo.png` / `screenshot-placar-publico.png` — capturas de tela dos protótipos acima.
Use-os para copiar valores exatos de cor, espaçamento, tipografia e comportamento de hover/active — não copie o HTML/JS literalmente, é um protótipo web genérico, não Angular.
