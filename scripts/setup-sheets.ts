/**
 * Cria (se não existirem) as 4 abas exigidas pela aplicação na planilha
 * configurada em GOOGLE_SHEET_ID, com a linha de cabeçalho correta.
 * Idempotente: abas/cabeçalhos já existentes não são alterados.
 *
 * Rodar com: npm run setup:sheets
 */
import { getSheetsClient, getSheetId, isGoogleSheetsConfigured } from '../api/_lib/repositories/google-sheets/client';

const TABS: Record<string, string[]> = {
  jogos: [
    'id',
    'nome',
    'data',
    'local',
    'descricao',
    'tipoJogo',
    'quantidadeRodadas',
    'perguntasPorRodada',
    'status',
    'rodadaAtual',
    'perguntaAtual',
    'createdAt',
    'updatedAt',
  ],
  equipes: ['id', 'jogoId', 'nome', 'quantidadeJogadores', 'ordem', 'createdAt'],
  perguntas: ['id', 'jogoId', 'rodada', 'numero', 'status', 'createdAt', 'updatedAt'],
  pontuacoes: [
    'id',
    'jogoId',
    'equipeId',
    'rodada',
    'pergunta',
    'pontuacaoBase',
    'bonus',
    'penalidade',
    'pontuacaoFinal',
    'createdAt',
    'updatedAt',
    'version',
  ],
};

function columnLetter(index: number): string {
  let n = index + 1;
  let letters = '';
  while (n > 0) {
    const rem = (n - 1) % 26;
    letters = String.fromCharCode(65 + rem) + letters;
    n = Math.floor((n - 1) / 26);
  }
  return letters;
}

async function main() {
  if (!isGoogleSheetsConfigured()) {
    console.error('✗ Configure GOOGLE_SERVICE_ACCOUNT_EMAIL, GOOGLE_PRIVATE_KEY e GOOGLE_SHEET_ID no .env primeiro.');
    process.exit(1);
  }

  const sheets = getSheetsClient();
  const spreadsheetId = getSheetId();

  const meta = await sheets.spreadsheets.get({ spreadsheetId });
  const existingTitles = new Set((meta.data.sheets ?? []).map((s) => s.properties?.title));

  const missing = Object.keys(TABS).filter((name) => !existingTitles.has(name));

  if (missing.length) {
    console.log(`Criando abas: ${missing.join(', ')}`);
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: missing.map((title) => ({ addSheet: { properties: { title } } })),
      },
    });
  } else {
    console.log('Todas as abas já existem.');
  }

  for (const [tabName, header] of Object.entries(TABS)) {
    const lastCol = columnLetter(header.length - 1);
    const current = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${tabName}!A1:${lastCol}1`,
    });
    const currentHeader = current.data.values?.[0] ?? [];

    if (JSON.stringify(currentHeader) === JSON.stringify(header)) {
      console.log(`✓ "${tabName}": cabeçalho já correto.`);
      continue;
    }

    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${tabName}!A1:${lastCol}1`,
      valueInputOption: 'RAW',
      requestBody: { values: [header] },
    });
    console.log(`✓ "${tabName}": cabeçalho gravado (${header.length} colunas).`);
  }

  console.log('\nPronto! Rode `npm run verify:sheets` para confirmar.');
}

main().catch((err) => {
  console.error('Falha ao configurar a planilha:', err instanceof Error ? err.message : err);
  process.exit(1);
});
