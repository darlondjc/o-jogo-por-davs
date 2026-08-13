# O Jogo — Trivia ao Vivo

Sistema para administrar e transmitir ao vivo um jogo de trivia entre várias
equipes. Feito em **Angular 20** (standalone, signals) com uma **API
serverless** (compatível com Vercel Functions) que persiste os dados em uma
**planilha Google Sheets**.

A prioridade do sistema é **velocidade de operação durante o jogo** — em
especial a tela `/jogo/:id/ao-vivo`, otimizada para lançar a pontuação de uma
pergunta inteira, para todas as equipes, em segundos e majoritariamente pelo
teclado.


## Estrutura do projeto

```
shared/                 tipos de domínio + regras de cálculo puras,
                         usados tanto pela API quanto testados pelo Angular
api/                     funções serverless (Vercel) — rotas /api/games/...
  _lib/
    repositories/        GameRepository, TeamRepository, QuestionRepository,
                          ScoreRepository — interfaces + 2 implementações:
                          Google Sheets (produção) e memória (dev/demo)
    services/             game.service.ts — orquestra regras de negócio
    http/                 validação (zod) e helpers de resposta HTTP
src/app/
  core/                  ApiService (HttpClient) e GameStateService (signals)
  features/
    dashboard/           "/" — lista de jogos
    game-form/           "/jogo/novo"
    game-config/         "/jogo/:id/configuracao" — dados do jogo + equipes
    game-admin/          "/jogo/:id" — painel/ações
    live/                "/jogo/:id/ao-vivo" — tela de lançamento (ScoreEntry)
    round-summary/       "/jogo/:id/rodada/:rodada"
    public-scoreboard/   "/jogo/:id/placar" — placar público, mobile, polling
    scoreboard/           componente de ranking reutilizado nas telas acima
```

## Desenvolvimento

```bash
npm install
npm start          # ng serve — abre em http://localhost:4200
```

Sem as variáveis do Google Sheets configuradas, a API usa automaticamente um
**repositório em memória com dados de demonstração** (um jogo de exemplo com
4 equipes, 3 rodadas, 20 perguntas). Isso permite rodar o fluxo completo
localmente sem nenhuma credencial.

Para rodar o front-end **e** as funções serverless juntos (como na Vercel):

```bash
npm run vercel-dev  # vercel dev — serve o Angular + /api juntos
```

### Smoke test do fluxo completo (sem UI)

```bash
npm run smoke
```

Executa, direto contra os serviços do backend (com o repositório em
memória): criar jogo → adicionar equipes → iniciar → lançar pontuação de
várias perguntas → finalizar rodada → resumo → continuar rodada → corrigir
lançamento → finalizar jogo → placar.

### Testes unitários

```bash
npm test
```

Cobrem principalmente `shared/scoring.ts`: cálculo de pontuação final,
totais de rodada/geral, ranking (com empate e variação de posição), avanço
de pergunta/rodada e validação de lançamentos.

## Variáveis de ambiente

| Variável | Descrição |
|---|---|
| `GOOGLE_SERVICE_ACCOUNT_EMAIL` | E-mail da Service Account do Google Cloud |
| `GOOGLE_PRIVATE_KEY` | Chave privada da Service Account (mantenha as quebras de linha como `\n`) |
| `GOOGLE_SHEET_ID` | ID da planilha (está na URL da planilha) |
| `GOOGLE_CLIENT_ID` | OAuth Client ID (tipo "Web application") usado no login com Google — ver seção [Login](#login) |
| `SESSION_SECRET` | Segredo para assinar o cookie de sessão do login. Opcional em dev (um segredo temporário é gerado por processo); **defina em produção** |

Essas variáveis só existem no ambiente server-side (Vercel Functions /
`vercel dev`) — **nunca** são referenciadas no código Angular. O único dado
que chega ao front-end é o próprio `GOOGLE_CLIENT_ID`, que não é secreto
(serve só para o botão do Google saber contra qual app se autenticar); ele é
servido via `GET /api/auth/config`.

Copie `.env.example` para `.env` para desenvolvimento local com `vercel dev`.

## Configurando o Google Sheets

1. Crie (ou reutilize) um projeto no [Google Cloud Console](https://console.cloud.google.com/).
2. Ative a **Google Sheets API** para o projeto.
3. Crie uma **Service Account** (IAM & Admin → Service Accounts).
4. Gere uma chave JSON para a Service Account e guarde `client_email` e
   `private_key` — viram `GOOGLE_SERVICE_ACCOUNT_EMAIL` e `GOOGLE_PRIVATE_KEY`.
5. Crie uma planilha nova no Google Sheets. O ID está na URL:
   `https://docs.google.com/spreadsheets/d/{ID}/edit` → isso é o
   `GOOGLE_SHEET_ID`.
6. **Compartilhe a planilha** com o e-mail da Service Account (permissão de
   Editor) — sem isso a API não consegue ler/escrever.
7. Crie as abas abaixo, cada uma com a linha de cabeçalho exatamente como
   listado (a ordem das colunas importa):

   **jogos**
   `id | nome | data | local | descricao | tipoJogo | quantidadeRodadas | perguntasPorRodada | status | rodadaAtual | perguntaAtual | createdAt | updatedAt`

   `tipoJogo` é um dos valores: `POP_GERAIS`, `TEMATICA`, `DECADAS`.

   **equipes**
   `id | jogoId | nome | quantidadeJogadores | ordem | createdAt`

   **perguntas**
   `id | jogoId | rodada | numero | status | createdAt | updatedAt`

   **pontuacoes**
   `id | jogoId | equipeId | rodada | pergunta | pontuacaoBase | bonus | penalidade | pontuacaoFinal | createdAt | updatedAt | version`

8. Configure as três variáveis de ambiente na Vercel (Project Settings →
   Environment Variables) — ou em `.env` para rodar `vercel dev` localmente.

## Login

Não há usuário/senha: o acesso é feito com a própria conta Google, e quem
pode entrar é definido por quem tem permissão de **Editor na planilha** —
não existe uma tabela de usuários separada. Dar ou tirar acesso ao sistema é
simplesmente compartilhar (ou descompartilhar) a planilha do jogo com o
e-mail Google da pessoa.

1. No [Google Cloud Console](https://console.cloud.google.com/), na tela de
   **OAuth consent screen**, configure o app (tipo "Externo" ou "Interno",
   conforme sua organização).
2. Em **Credentials → Create Credentials → OAuth client ID**, crie um client
   do tipo **Web application**. Em "Authorized JavaScript origins", adicione
   a URL do app (ex: `http://localhost:4200` para dev e a URL de produção na
   Vercel).
3. Copie o **Client ID** gerado → variável `GOOGLE_CLIENT_ID`.
4. Defina também `SESSION_SECRET` (qualquer string aleatória longa) para
   assinar o cookie de sessão em produção.
5. Garanta que a Service Account (`GOOGLE_SERVICE_ACCOUNT_EMAIL`) também
   tenha acesso à planilha — ela precisa ler a lista de permissões para
   checar quem é editor (usa a Google Drive API, então **ative a Google
   Drive API** no mesmo projeto do Cloud Console, além da Sheets API).

Fluxo: o front-end mostra o botão **"Entrar com Google"**
([Google Identity Services](https://developers.google.com/identity/gsi/web)),
que devolve um ID token assinado pelo Google. Esse token é enviado para
`POST /api/auth/google`, que:

1. valida a assinatura/audiência do token (`google-auth-library`);
2. consulta o Drive (`permissions.list` na planilha de `GOOGLE_SHEET_ID`)
   para checar se o e-mail autenticado tem papel de Editor ou Proprietário;
3. se não tiver, recusa com `403` e uma mensagem de negócio explicando que é
   preciso pedir acesso de Editor na planilha a um administrador — não é
   tratado como erro técnico;
4. se tiver, grava um cookie de sessão `HttpOnly` (assinado, válido por 12h)
   e o front-end libera a navegação.

Sem `GOOGLE_SHEET_ID`/credenciais do Sheets configuradas (modo demo), a
checagem de editor é pulada e qualquer login Google válido é aceito — como
não há planilha real para restringir contra.

A rota pública `/jogo/:id/placar` (placar para espectadores) e o endpoint
`GET /api/games/:id/scoreboard` continuam sem exigir login — todo o resto da
API e das telas exige sessão.

## Deploy (Vercel)

```bash
vercel        # deploy de preview
vercel --prod # produção
```

O `vercel.json` já configura o `buildCommand`/`outputDirectory` do Angular e
uma reescrita de rota para que o roteamento do Angular funcione em qualquer
URL profunda (ex: acessar `/jogo/abc/placar` diretamente). As funções em
`api/` são detectadas automaticamente pela Vercel.

Lembre-se de configurar `GOOGLE_SERVICE_ACCOUNT_EMAIL`,
`GOOGLE_PRIVATE_KEY` e `GOOGLE_SHEET_ID` nas variáveis de ambiente do
projeto na Vercel antes do primeiro deploy em produção — sem elas, a API
roda em modo de demonstração (memória, não durável entre invocações).
Configure também `GOOGLE_CLIENT_ID` e `SESSION_SECRET` (ver seção
[Login](#login)) — sem `GOOGLE_CLIENT_ID` o botão de login some do
front-end.

## Fluxo principal

```
Dashboard ("/")
  → Novo jogo ("/jogo/novo")
  → Configuração: dados do jogo + equipes ("/jogo/:id/configuracao")
  → Painel do jogo ("/jogo/:id") → INICIAR O JOGO
  → Lançamento ao vivo ("/jogo/:id/ao-vivo")
      pergunta 1 → registrar → pergunta 2 → ... → última pergunta da rodada
  → Resumo da rodada ("/jogo/:id/rodada/:n") → Continuar para a próxima rodada
  → ... até a última rodada
  → Jogo finalizado

Participantes: "/jogo/:id/placar" (sem login, atualiza a cada 3s)
```

## Atalhos de teclado na tela de lançamento

| Tecla | Ação |
|---|---|
| `Enter` | Confirma o registro da pergunta (primeiro toque abre a barra de confirmação, segundo efetiva) |
| `Espaço` | Mesmo que `Enter`, quando nenhum campo está focado |
| `A` | Seleciona/desseleciona todas as equipes |
| `P` | Corrige a última pergunta registrada |
| `Esc` | Cancela a confirmação pendente |

## Idempotência e correção

Cada lançamento de pontuação é identificado pela chave
`jogo + equipe + rodada + pergunta`. Reenviar o mesmo lançamento (ex: uma
correção, ou uma requisição repetida) **substitui** o registro existente em
vez de duplicá-lo, incrementando `version` e `updatedAt` — nada é apagado
silenciosamente.
