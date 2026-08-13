/**
 * Remove todas as linhas relacionadas a um gameId específico das 4 abas
 * (jogos, equipes, perguntas, pontuacoes). Uso único para limpar dados de
 * teste — não é parte do fluxo normal da aplicação.
 *
 * Rodar com: npx tsx --env-file=.env scripts/cleanup-game.ts <gameId>
 */
import { getSheetsClient, getSheetId, getSheetNumericId } from '../api/_lib/repositories/google-sheets/client';

const TABS: { name: string; idColumnIndex: number }[] = [
  { name: 'jogos', idColumnIndex: 0 }, // coluna "id" do próprio jogo
  { name: 'equipes', idColumnIndex: 1 }, // coluna "jogoId"
  { name: 'perguntas', idColumnIndex: 1 }, // coluna "jogoId"
  { name: 'pontuacoes', idColumnIndex: 1 }, // coluna "jogoId"
];

async function main() {
  const gameId = process.argv[2];
  if (!gameId) {
    console.error('Uso: npx tsx --env-file=.env scripts/cleanup-game.ts <gameId>');
    process.exit(1);
  }

  const sheets = getSheetsClient();
  const spreadsheetId = getSheetId();

  for (const tab of TABS) {
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${tab.name}!A:Z`,
    });
    const rows = (res.data.values as string[][] | undefined) ?? [];
    if (rows.length <= 1) {
      console.log(`"${tab.name}": vazia, nada a remover.`);
      continue;
    }

    const matchingZeroIndexed: number[] = [];
    for (let i = 1; i < rows.length; i++) {
      if (rows[i][tab.idColumnIndex] === gameId) matchingZeroIndexed.push(i);
    }

    if (!matchingZeroIndexed.length) {
      console.log(`"${tab.name}": nenhuma linha para o jogo ${gameId}.`);
      continue;
    }

    const sheetNumericId = await getSheetNumericId(tab.name);
    // Deleta de baixo para cima para não invalidar os índices restantes.
    const requests = matchingZeroIndexed
      .sort((a, b) => b - a)
      .map((rowIndex) => ({
        deleteDimension: {
          range: {
            sheetId: sheetNumericId,
            dimension: 'ROWS',
            startIndex: rowIndex,
            endIndex: rowIndex + 1,
          },
        },
      }));

    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: { requests },
    });
    console.log(`"${tab.name}": removidas ${matchingZeroIndexed.length} linha(s).`);
  }

  console.log('\nLimpeza concluída.');
}

main().catch((err) => {
  console.error('Falha na limpeza:', err instanceof Error ? err.message : err);
  process.exit(1);
});
