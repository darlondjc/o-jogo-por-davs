import { google, sheets_v4 } from 'googleapis';

/**
 * Cliente autenticado do Google Sheets. As credenciais só existem aqui,
 * server-side (Vercel Functions) — nunca chegam ao Angular (spec seção 24).
 */

function getEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Variável de ambiente ausente: ${name}`);
  return value;
}

export function isGoogleSheetsConfigured(): boolean {
  return Boolean(
    process.env['GOOGLE_SERVICE_ACCOUNT_EMAIL'] &&
      process.env['GOOGLE_PRIVATE_KEY'] &&
      process.env['GOOGLE_SHEET_ID'],
  );
}

export function getSheetId(): string {
  return getEnv('GOOGLE_SHEET_ID');
}

let cachedAuth: InstanceType<typeof google.auth.JWT> | null = null;

function getAuth(): InstanceType<typeof google.auth.JWT> {
  if (cachedAuth) return cachedAuth;
  const email = getEnv('GOOGLE_SERVICE_ACCOUNT_EMAIL');
  const privateKey = getEnv('GOOGLE_PRIVATE_KEY').replace(/\\n/g, '\n');
  cachedAuth = new google.auth.JWT({
    email,
    key: privateKey,
    scopes: [
      'https://www.googleapis.com/auth/spreadsheets',
      // Só leitura de metadados (inclui a lista de permissões/compartilhamento)
      // — usada para checar se quem loga é editor da planilha (ver auth.service.ts).
      'https://www.googleapis.com/auth/drive.metadata.readonly',
    ],
  });
  return cachedAuth;
}

let cachedClient: sheets_v4.Sheets | null = null;

export function getSheetsClient(): sheets_v4.Sheets {
  if (cachedClient) return cachedClient;
  cachedClient = google.sheets({ version: 'v4', auth: getAuth() });
  return cachedClient;
}

let cachedDriveClient: ReturnType<typeof google.drive> | null = null;

/** Cliente do Drive — usado só para consultar quem tem acesso de edição à planilha. */
export function getDriveClient(): ReturnType<typeof google.drive> {
  if (cachedDriveClient) return cachedDriveClient;
  cachedDriveClient = google.drive({ version: 'v3', auth: getAuth() });
  return cachedDriveClient;
}

const sheetNumericIdCache = new Map<string, number>();

/** Resolve o `sheetId` numérico (necessário para deleteDimension) a partir do nome da aba. */
export async function getSheetNumericId(sheetName: string): Promise<number> {
  const cached = sheetNumericIdCache.get(sheetName);
  if (cached !== undefined) return cached;

  const sheets = getSheetsClient();
  const meta = await sheets.spreadsheets.get({ spreadsheetId: getSheetId() });
  for (const sheet of meta.data.sheets ?? []) {
    const title = sheet.properties?.title;
    const id = sheet.properties?.sheetId;
    if (title && id !== undefined && id !== null) {
      sheetNumericIdCache.set(title, id);
    }
  }
  const resolved = sheetNumericIdCache.get(sheetName);
  if (resolved === undefined) {
    throw new Error(`Aba não encontrada na planilha: ${sheetName}`);
  }
  return resolved;
}
