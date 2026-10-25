import type ExcelJS from "exceljs";
import type { RawRow } from "./validate";
import {
  CONFIG_FIELDS,
  DAILY_COLUMNS,
  EVENT_COLUMNS,
  EVENT_TYPES,
  LIBRARY_COLUMNS,
  NOTE_COLUMNS,
  PLATFORMS,
  README_LINES,
  SHEETS,
  TAG_COLUMNS,
  TARGET_COLUMNS,
  type ColumnSpec,
} from "./template";

/** Minimal RFC-4180 CSV parser (quoted fields, escaped quotes, CRLF). */
export function parseCsv(text: string): RawRow[] {
  const rows: string[][] = [];
  let field = "";
  let row: string[] = [];
  let inQ = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQ) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else inQ = false;
      } else field += ch;
    } else if (ch === '"') inQ = true;
    else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += ch;
  }
  if (field !== "" || row.length) {
    row.push(field);
    rows.push(row);
  }
  const nonEmpty = rows.filter((r) => r.some((c) => c.trim() !== ""));
  if (!nonEmpty.length) return [];
  const headers = nonEmpty[0].map((h) => h.replace(/^﻿/, "").trim());
  return nonEmpty.slice(1).map((r, idx) => {
    const rec: RawRow = { __row: idx + 2 };
    headers.forEach((h, i) => (rec[h] = r[i] ?? null));
    return rec;
  });
}

// ---------------------------------------------------------------- writer

export interface WorkbookContent {
  config?: Record<string, unknown>;
  targets?: Record<string, unknown>[];
  library?: Record<string, unknown>[];
  daily?: Record<string, unknown>[];
  events?: Record<string, unknown>[];
  tags?: Record<string, unknown>[];
  notes?: Record<string, unknown>[];
  readmeExtra?: string[];
}

const HEADER_FILL: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF111827" } };
const REQ_FILL: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF15803D" } };

function addTable(wb: ExcelJS.Workbook, name: string, cols: ColumnSpec[], rows: Record<string, unknown>[], tabColor: string) {
  const ws = wb.addWorksheet(name, { views: [{ state: "frozen", ySplit: 1 }], properties: { tabColor: { argb: tabColor } } });
  ws.columns = cols.map((c) => ({ header: c.name, key: c.name, width: Math.min(40, Math.max(12, c.name.length + 4)) }));
  const header = ws.getRow(1);
  header.eachCell((cell, i) => {
    const spec = cols[i - 1];
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = spec?.required ? REQ_FILL : HEADER_FILL;
    cell.note = `${spec?.required ? "REQUIRED. " : ""}${spec?.description ?? ""}`;
  });
  header.height = 20;
  for (const r of rows) ws.addRow(cols.map((c) => r[c.name] ?? null));
  // date columns as real dates where string ISO given
  cols.forEach((c, idx) => {
    if (c.type === "date") ws.getColumn(idx + 1).numFmt = "yyyy-mm-dd";
    if (c.name === "spend" || c.name === "purchase_value") ws.getColumn(idx + 1).numFmt = "#,##0.00";
  });
  const platformIdx = cols.findIndex((c) => c.name === "platform");
  if (platformIdx >= 0 && rows.length === 0) {
    const letter = ws.getColumn(platformIdx + 1).letter;
    for (let r = 2; r <= 1000; r++) {
      ws.getCell(`${letter}${r}`).dataValidation = { type: "list", allowBlank: true, formulae: [`"${PLATFORMS.join(",")}"`] };
    }
  }
  const evIdx = cols.findIndex((c) => c.name === "event_type");
  if (evIdx >= 0) {
    const letter = ws.getColumn(evIdx + 1).letter;
    for (let r = 2; r <= Math.min(rows.length + 200, 2000); r++) ws.getCell(`${letter}${r}`).dataValidation = { type: "list", allowBlank: true, formulae: [`"${EVENT_TYPES.join(",")}"`] };
  }
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: cols.length } };
  return ws;
}

/** Build the File Mode workbook (template when content is empty, demo when filled). */
export async function buildWorkbook(content: WorkbookContent, ExcelJSMod: typeof ExcelJS): Promise<ExcelJS.Workbook> {
  const wb = new ExcelJSMod.Workbook();
  wb.creator = "Creative Intelligence OS";
  wb.created = new Date();

  const readme = wb.addWorksheet(SHEETS.readme, { properties: { tabColor: { argb: "FF6D28D9" } } });
  readme.getColumn(1).width = 120;
  const lines = [...README_LINES, ...(content.readmeExtra ?? [])];
  lines.forEach((l, i) => {
    const c = readme.getCell(i + 1, 1);
    c.value = l;
    if (i === 0) c.font = { bold: true, size: 16 };
    else if (/^[A-Z][A-Z ]+$/.test(l)) c.font = { bold: true, size: 12 };
  });
  let r = lines.length + 2;
  readme.getCell(r++, 1).value = "COLUMN DICTIONARY — 04_RAW_CREATIVE_DAILY (green header = required)";
  readme.getCell(r - 1, 1).font = { bold: true };
  for (const c of DAILY_COLUMNS) readme.getCell(r++, 1).value = `${c.name}${c.required ? " (required)" : ""} — ${c.description}`;
  r++;
  readme.getCell(r++, 1).value = "COLUMN DICTIONARY — 03_CREATIVE_LIBRARY";
  readme.getCell(r - 1, 1).font = { bold: true };
  for (const c of LIBRARY_COLUMNS) readme.getCell(r++, 1).value = `${c.name}${c.required ? " (required)" : ""} — ${c.description}`;

  const cfg = wb.addWorksheet(SHEETS.config, { views: [{ state: "frozen", ySplit: 1 }], properties: { tabColor: { argb: "FF374151" } } });
  cfg.columns = [
    { header: "field", key: "field", width: 30 },
    { header: "value", key: "value", width: 36 },
    { header: "description", key: "description", width: 90 },
  ];
  cfg.getRow(1).eachCell((cell) => {
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = HEADER_FILL;
  });
  for (const f of CONFIG_FIELDS) cfg.addRow({ field: f.name, value: content.config?.[f.name] ?? (content.config ? null : (f.example ?? null)), description: `${f.required ? "REQUIRED. " : ""}${f.description}${f.enum ? ` Options: ${f.enum.join(", ")}` : ""}` });

  addTable(wb, SHEETS.targets, TARGET_COLUMNS, content.targets ?? [], "FF6D28D9");
  addTable(wb, SHEETS.library, LIBRARY_COLUMNS, content.library ?? [], "FF15803D");
  addTable(wb, SHEETS.daily, DAILY_COLUMNS, content.daily ?? [], "FF111827");
  addTable(wb, SHEETS.events, EVENT_COLUMNS, content.events ?? [], "FFC2410C");
  addTable(wb, SHEETS.tags, TAG_COLUMNS, content.tags ?? [], "FFA16207");
  addTable(wb, SHEETS.notes, NOTE_COLUMNS, content.notes ?? [], "FF6B7280");
  return wb;
}
