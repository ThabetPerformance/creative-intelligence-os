import ExcelJS from "exceljs";
import fs from "node:fs";
import path from "node:path";
import { generateDemo } from "../src/demo/generator";
import { buildWorkbook } from "../src/ingestion/workbook-io";
import { CONFIG_FIELDS, DAILY_COLUMNS, EVENT_COLUMNS, LIBRARY_COLUMNS, SHEETS, TARGET_COLUMNS, README_LINES } from "../src/ingestion/template";

async function write(file: string, content: Parameters<typeof buildWorkbook>[0]) {
  const wb = await buildWorkbook(content, ExcelJS);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  await wb.xlsx.writeFile(file);
  console.log(`${file}  ${(fs.statSync(file).size / 1024 / 1024).toFixed(2)} MB`);
}

/** Streaming writer for very large workbooks (the 1,000-creative fixture). */
async function writeStreaming(file: string, d: ReturnType<typeof generateDemo>) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const wb = new ExcelJS.stream.xlsx.WorkbookWriter({ filename: file, useStyles: true, useSharedStrings: true });
  const readme = wb.addWorksheet(SHEETS.readme);
  for (const l of [...README_LINES, "", `LOAD TEST FIXTURE — ${d.library.length} creatives, ${d.daily.length} DATE × AD rows (synthetic).`]) readme.addRow([l]).commit();
  readme.commit();
  const cfg = wb.addWorksheet(SHEETS.config);
  cfg.addRow(["field", "value", "description"]).commit();
  for (const f of CONFIG_FIELDS) cfg.addRow([f.name, (d.config as Record<string, unknown>)[f.name] ?? null, f.description]).commit();
  cfg.commit();
  const table = (name: string, cols: { name: string }[], rows: Record<string, unknown>[]) => {
    const ws = wb.addWorksheet(name);
    ws.addRow(cols.map((c) => c.name)).commit();
    for (const r of rows) ws.addRow(cols.map((c) => r[c.name] ?? null)).commit();
    ws.commit();
  };
  table(SHEETS.targets, TARGET_COLUMNS, d.targets);
  table(SHEETS.library, LIBRARY_COLUMNS, d.library);
  table(SHEETS.daily, DAILY_COLUMNS, d.daily);
  table(SHEETS.events, EVENT_COLUMNS, d.events);
  await wb.commit();
  console.log(`${file}  ${(fs.statSync(file).size / 1024 / 1024).toFixed(2)} MB`);
}

async function main() {
  const fixture = process.argv.includes("--fixture1000");
  if (!fixture) {
    await write("public/demo/Creative_Intelligence_TEMPLATE.xlsx", {});
    const d = generateDemo();
    await write("public/demo/Creative_Intelligence_DEMO.xlsx", {
      ...d,
      readmeExtra: ["", "DEMO DATA", `Synthetic workbook: ${d.library.length} creatives, ${d.daily.length} DATE × AD rows, ${d.targets.length} target regimes. Fictional brand — not real performance.`],
    });
  } else {
    await writeStreaming("fixtures/Creative_Intelligence_LOADTEST_1000.xlsx", generateDemo({ fixture1000: true }));
  }
}
main();
