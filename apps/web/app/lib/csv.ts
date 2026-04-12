export type CsvColumn<T> = {
  key: keyof T;
  label: string;
};

function escapeCsvValue(value: unknown): string {
  const raw = value == null ? "" : String(value);
  const escaped = raw.replace(/"/g, '""');
  if (/["\n,;]/.test(escaped)) {
    return `"${escaped}"`;
  }
  return escaped;
}

export function exportVisibleRowsToCsv<T extends Record<string, unknown>>(
  fileName: string,
  rows: T[],
  columns: CsvColumn<T>[],
): void {
  const header = columns.map((col) => escapeCsvValue(col.label)).join(";");
  const lines = rows.map((row) => columns.map((col) => escapeCsvValue(row[col.key])).join(";"));
  const content = [header, ...lines].join("\n");

  const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}
