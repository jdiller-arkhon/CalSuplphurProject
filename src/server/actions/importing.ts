"use server";

import { z } from "zod";
import { action, zReq } from "../action";
import type { ActionState } from "../action";
import { IMPORT_KINDS, readSheet, autoMap, validateRows, commitImport, type ImportKind, type RowResult } from "../services/import";

const kind = z.enum(Object.keys(IMPORT_KINDS) as [ImportKind, ...ImportKind[]]);

/** Step 1: read the file and propose a column mapping. Nothing is written. */
const previewImportImpl = action("import.run", z.object({ kind, file: z.instanceof(File, { message: "Choose a file" }), mapping: z.string().optional() }), async (d) => {
  const sheet = await readSheet(d.file);
  const mapping: Record<string, number> = d.mapping ? JSON.parse(d.mapping) : autoMap(d.kind, sheet.headers);
  const rows = await validateRows(d.kind, sheet.rows, mapping);
  return { data: { headers: sheet.headers, mapping, rows, fileName: d.file.name } };
});

/** Step 2: re-read and re-validate on the server, then commit atomically. */
const runImportImpl = action("import.run", z.object({ kind, file: z.instanceof(File, { message: "Choose the file again" }), mapping: zReq("Mapping", 4000), skip: z.string().optional() }), async (d, u) => {
  const sheet = await readSheet(d.file);
  const rows: RowResult[] = await validateRows(d.kind, sheet.rows, JSON.parse(d.mapping));
  const r = await commitImport({ userId: u.id }, d.kind, d.file.name, rows, d.skip === "on");
  return { message: `Imported ${r.imported} row(s)${r.skipped ? `; ${r.skipped} row(s) skipped and listed in import history` : ""}.`, data: { done: true } };
});

// Server Action exports must be async functions (Next.js requirement for "use server" files).
export async function previewImport(prev: ActionState, fd: FormData) {
  return previewImportImpl(prev, fd);
}
export async function runImport(prev: ActionState, fd: FormData) {
  return runImportImpl(prev, fd);
}
