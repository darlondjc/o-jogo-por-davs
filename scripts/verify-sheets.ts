/**
 * Verifica a conexão real com o Google Sheets configurado via .env:
 * autenticação, existência das 4 abas e se o cabeçalho de cada uma bate
 * exatamente com o esperado. Não imprime nenhum valor de credencial.
 *
 * Rodar com: npm run verify:sheets
 */
import { isGoogleSheetsConfigured, getSheetsClient, getSheetId } from '../api/_lib/repositories/google-sheets/client';

const EXPECTED: Record<string, string[]> = {
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

async function main() {
  if (!isGoogleSheetsConfigured()) {
    console.error(
      '✗ GOOGLE_SERVICE_ACCOUNT_EMAIL / GOOGLE_PRIVATE_KEY / GOOGLE_SHEET_ID não estão todas definidas.',
    );
    process.exit(1);
  }

  console.log('Variáveis de ambiente presentes. Testando autenticação e acesso à planilha...\n');

  const sheets = getSheetsClient();
  const spreadsheetId = getSheetId();

  let meta;
  try {
    meta = await sheets.spreadsheets.get({ spreadsheetId });
  } catch (err) {
    console.error('✗ Falha ao acessar a planilha. Verifique:');
    console.error('  - se GOOGLE_SHEET_ID está correto');
    console.error('  - se a planilha foi compartilhada com o e-mail da service account (Editor)');
    console.error('  - se a Google Sheets API está ativada no projeto GCP');
    console.error('\nErro original:', err instanceof Error ? err.message : err);
    process.exit(1);
  }

  console.log(`✓ Autenticado. Planilha: "${meta.data.properties?.title}"\n`);

  const existingTabs = new Set((meta.data.sheets ?? []).map((s) => s.properties?.title));

  let allOk = true;

  for (const [tabName, expectedHeader] of Object.entries(EXPECTED)) {
    if (!existingTabs.has(tabName)) {
      console.error(`✗ Aba "${tabName}" não encontrada na planilha.`);
      allOk = false;
      continue;
    }

    const lastCol = String.fromCharCode(65 + expectedHeader.length - 1);
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${tabName}!A1:${lastCol}1`,
    });
    const actualHeader = (res.data.values?.[0] ?? []) as string[];

    if (JSON.stringify(actualHeader) === JSON.stringify(expectedHeader)) {
      console.log(`✓ Aba "${tabName}": cabeçalho correto (${expectedHeader.length} colunas).`);
    } else {
      allOk = false;
      console.error(`✗ Aba "${tabName}": cabeçalho não confere.`);
      console.error(`  Esperado: ${expectedHeader.join(' | ')}`);
      console.error(`  Encontrado: ${actualHeader.join(' | ') || '(linha 1 vazia)'}`);
    }
  }

  console.log(allOk ? '\nTudo certo! ✅' : '\nHá pendências acima. ⚠️');
  process.exit(allOk ? 0 : 1);
}

main().catch((err) => {
  console.error('Falha inesperada:', err);
  process.exit(1);
});
