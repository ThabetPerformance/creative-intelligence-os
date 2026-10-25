import { strFromU8, unzipSync } from "fflate";
import type { RawRow } from "./validate";

/**
 * Small, dependency-light XLSX reader (fflate + string scanning). Runs in the browser and in Node,
 * handles 150k+ row sheets without building a heavyweight object model.
 * Dates stored as Excel serial numbers are returned as numbers; validation converts them.
 */

function decodeXml(s: string): string {
  if (s.indexOf("&") < 0) return s;
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&amp;/g, "&");
}

function textOf(xml: string): string {
  // concatenates all <t>…</t> runs (shared strings and inline strings, incl. rich text)
  let out = "";
  const re = /<t(?:\s[^>]*)?>([\s\S]*?)<\/t>|<t\s*\/>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) out += m[1] ?? "";
  return decodeXml(out);
}

function colIndex(ref: string): number {
  let n = 0;
  for (let i = 0; i < ref.length; i++) {
    const c = ref.charCodeAt(i);
    if (c < 65 || c > 90) break;
    n = n * 26 + (c - 64);
  }
  return n - 1;
}

export interface SheetData {
  name: string;
  rows: RawRow[];
}

export function readXlsx(data: Uint8Array): Record<string, RawRow[]> {
  const files = unzipSync(data, {
    filter: (f) => f.name === "xl/workbook.xml" || f.name === "xl/_rels/workbook.xml.rels" || f.name === "xl/sharedStrings.xml" || f.name.startsWith("xl/worksheets/sheet"),
  });
  const wbXml = strFromU8(files["xl/workbook.xml"]);
  const relsXml = files["xl/_rels/workbook.xml.rels"] ? strFromU8(files["xl/_rels/workbook.xml.rels"]) : "";
  const rels = new Map<string, string>();
  for (const m of relsXml.matchAll(/<Relationship\b[^>]*>/g)) {
    const id = /Id="([^"]+)"/.exec(m[0])?.[1];
    const target = /Target="([^"]+)"/.exec(m[0])?.[1];
    if (id && target) rels.set(id, target.replace(/^\/?xl\//, "").replace(/^\//, ""));
  }
  const shared: string[] = [];
  if (files["xl/sharedStrings.xml"]) {
    const ss = strFromU8(files["xl/sharedStrings.xml"]);
    for (const m of ss.matchAll(/<si>([\s\S]*?)<\/si>/g)) shared.push(textOf(m[1]));
  }
  const out: Record<string, RawRow[]> = {};
  for (const m of wbXml.matchAll(/<sheet\b[^>]*>/g)) {
    const name = decodeXml(/name="([^"]+)"/.exec(m[0])?.[1] ?? "");
    const rid = /r:id="([^"]+)"/.exec(m[0])?.[1];
    const target = rid ? rels.get(rid) : undefined;
    const path = target ? `xl/${target}` : null;
    if (!path || !files[path]) continue;
    out[name] = parseSheet(strFromU8(files[path]), shared);
  }
  return out;
}

function parseSheet(xml: string, shared: string[]): RawRow[] {
  const rows: RawRow[] = [];
  let headers: string[] | null = null;
  const rowRe = /<row\b([^>]*)>([\s\S]*?)<\/row>/g;
  const cellRe = /<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g;
  let rm: RegExpExecArray | null;
  while ((rm = rowRe.exec(xml))) {
    const rowNum = Number(/\br="(\d+)"/.exec(rm[1])?.[1] ?? rows.length + 1);
    const values: unknown[] = [];
    let cm: RegExpExecArray | null;
    let pos = 0;
    cellRe.lastIndex = 0;
    const body = rm[2];
    while ((cm = cellRe.exec(body))) {
      const attrs = cm[1];
      const inner = cm[2] ?? "";
      const ref = /\br="([A-Z]+)\d+"/.exec(attrs)?.[1];
      const idx = ref ? colIndex(ref) : pos;
      pos = idx + 1;
      const t = /\bt="([^"]+)"/.exec(attrs)?.[1];
      let v: unknown = null;
      if (t === "inlineStr") v = textOf(inner);
      else {
        const raw = /<v>([\s\S]*?)<\/v>/.exec(inner)?.[1];
        if (raw !== undefined) {
          if (t === "s") v = shared[Number(raw)] ?? null;
          else if (t === "str" || t === "e") v = t === "e" ? null : decodeXml(raw);
          else if (t === "b") v = raw === "1";
          else {
            const n = Number(raw);
            v = Number.isFinite(n) ? n : decodeXml(raw);
          }
        }
      }
      values[idx] = v;
    }
    if (!headers) {
      if (values.some((v) => v !== null && v !== undefined && String(v).trim() !== "")) headers = Array.from(values, (v) => (v === null || v === undefined ? "" : String(v).trim()));
      continue;
    }
    const rec: RawRow = { __row: rowNum };
    let any = false;
    for (let i = 0; i < headers.length; i++) {
      const h = headers[i];
      if (!h) continue;
      const v = values[i] ?? null;
      if (v !== null && String(v).trim() !== "") any = true;
      rec[h] = v;
    }
    if (any) rows.push(rec);
  }
  return rows;
}
