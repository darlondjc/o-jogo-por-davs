import { getSheetId, getSheetNumericId, getSheetsClient } from './client';

/**
 * Camada genérica de acesso a uma aba do Google Sheets tratada como tabela
 * (cabeçalho na linha 1, uma coluna `id`). Usada pelos repositórios
 * concretos — o resto do backend nunca lida com ranges/índices diretamente.
 */
export class SheetTable<T extends Record<string, string>> {
  constructor(
    private readonly sheetName: string,
    private readonly columns: readonly (keyof T & string)[],
  ) {}

  private columnLetter(index: number): string {
    let n = index + 1;
    let letters = '';
    while (n > 0) {
      const rem = (n - 1) % 26;
      letters = String.fromCharCode(65 + rem) + letters;
      n = Math.floor((n - 1) / 26);
    }
    return letters;
  }

  private get fullRange(): string {
    return `${this.sheetName}!A:${this.columnLetter(this.columns.length - 1)}`;
  }

  private rowToObject(row: string[]): T {
    const obj: Record<string, string> = {};
    this.columns.forEach((col, i) => {
      obj[col] = row[i] ?? '';
    });
    return obj as T;
  }

  private objectToRow(obj: T): string[] {
    return this.columns.map((c) => obj[c] ?? '');
  }

  private async readRawRows(): Promise<string[][]> {
    const sheets = getSheetsClient();
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: getSheetId(),
      range: this.fullRange,
    });
    return (res.data.values as string[][] | undefined) ?? [];
  }

  async readAll(): Promise<T[]> {
    const rows = await this.readRawRows();
    if (rows.length <= 1) return [];
    return rows.slice(1).filter((r) => r.length && r[0]).map((r) => this.rowToObject(r));
  }

  async append(obj: T): Promise<void> {
    const sheets = getSheetsClient();
    await sheets.spreadsheets.values.append({
      spreadsheetId: getSheetId(),
      range: this.fullRange,
      valueInputOption: 'RAW',
      insertDataOption: 'INSERT_ROWS',
      requestBody: { values: [this.objectToRow(obj)] },
    });
  }

  /** Substitui a linha cujo `predicate` bate pelo objeto completo informado. */
  async replaceWhere(predicate: (row: T) => boolean, replacement: T): Promise<T | null> {
    const rows = await this.readRawRows();
    for (let i = 1; i < rows.length; i++) {
      const obj = this.rowToObject(rows[i]);
      if (predicate(obj)) {
        const sheets = getSheetsClient();
        const lastCol = this.columnLetter(this.columns.length - 1);
        await sheets.spreadsheets.values.update({
          spreadsheetId: getSheetId(),
          range: `${this.sheetName}!A${i + 1}:${lastCol}${i + 1}`,
          valueInputOption: 'RAW',
          requestBody: { values: [this.objectToRow(replacement)] },
        });
        return replacement;
      }
    }
    return null;
  }

  async deleteWhere(predicate: (row: T) => boolean): Promise<void> {
    const rows = await this.readRawRows();
    const rowIndex = rows.slice(1).findIndex((r) => predicate(this.rowToObject(r)));
    if (rowIndex === -1) return;

    const sheetNumericId = await getSheetNumericId(this.sheetName);
    const sheets = getSheetsClient();
    const zeroIndexedSheetRow = rowIndex + 1; // +1 para pular o cabeçalho
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: getSheetId(),
      requestBody: {
        requests: [
          {
            deleteDimension: {
              range: {
                sheetId: sheetNumericId,
                dimension: 'ROWS',
                startIndex: zeroIndexedSheetRow,
                endIndex: zeroIndexedSheetRow + 1,
              },
            },
          },
        ],
      },
    });
  }
}
