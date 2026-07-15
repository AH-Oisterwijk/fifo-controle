/**
 * Office Script voor het exporteren van personen uit Shift Overdracht.xlsx.
 *
 * Leest:
 * - Tabel_medewerkers, kolom "Medewerkers"
 * - Tabel_shiftleiders, eerste kolom "Shiftleiders / Managers"
 *
 * Geeft JSON terug voor Power Automate met twee CSV-teksten:
 * - medewerkersCsv
 * - shiftleidersCsv
 */
function main(workbook: ExcelScript.Workbook): string {
  const medewerkers = readNamesFromTable(workbook, "Tabel_medewerkers", "Medewerkers");
  const shiftleiders = readNamesFromTable(workbook, "Tabel_shiftleiders", "Shiftleiders / Managers");

  return JSON.stringify({
    medewerkersCsv: toCsv("Medewerkers", medewerkers),
    shiftleidersCsv: toCsv("Shiftleiders / Managers", shiftleiders),
    medewerkersAantal: medewerkers.length,
    shiftleidersAantal: shiftleiders.length,
    exportedAt: new Date().toISOString()
  });
}

function readNamesFromTable(
  workbook: ExcelScript.Workbook,
  tableName: string,
  preferredColumnName: string
): string[] {
  const table = workbook.getTable(tableName);

  if (!table) {
    throw new Error(`Tabel '${tableName}' niet gevonden.`);
  }

  const columns = table.getColumns();
  if (!columns.length) {
    return [];
  }

  let column: ExcelScript.TableColumn | undefined = undefined;

  for (const c of columns) {
    if (normalize(c.getName()) === normalize(preferredColumnName)) {
      column = c;
      break;
    }
  }

  if (!column) {
    column = columns[0];
  }

  let values: (string | number | boolean)[][] = [];

  try {
    values = column.getRangeBetweenHeaderAndTotal().getValues() as (string | number | boolean)[][];
  } catch (e) {
    return [];
  }

  const seen: { [key: string]: boolean } = {};
  const names: string[] = [];

  for (const row of values) {
    const name = String(row[0] ?? "").trim();

    if (!name) {
      continue;
    }

    const key = normalize(name);

    if (seen[key]) {
      continue;
    }

    seen[key] = true;
    names.push(name);
  }

  return names.sort((a, b) => a.localeCompare(b, "nl"));
}

function toCsv(header: string, names: string[]): string {
  return [csvEscape(header), ...names.map(csvEscape)].join("\n") + "\n";
}

function csvEscape(value: string): string {
  const s = String(value ?? "");

  if (/[",;\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }

  return s;
}

function normalize(value: string): string {
  return String(value || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}
