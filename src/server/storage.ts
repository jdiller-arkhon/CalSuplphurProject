import "server-only";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createHash, randomBytes } from "node:crypto";
import path from "node:path";

/**
 * Private file storage on local disk (FILE_STORAGE_DIR). Files are named by an opaque random key and
 * served only through the authorized /api/documents/:id route — never from a public URL.
 * On hosting, point FILE_STORAGE_DIR at a persistent, backed-up volume (see docs/DEPLOYMENT.md).
 */
const ROOT = path.resolve(process.env.FILE_STORAGE_DIR ?? "./storage");

export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;
export const ALLOWED_TYPES: Record<string, string[]> = {
  "application/pdf": [".pdf"],
  "image/png": [".png"],
  "image/jpeg": [".jpg", ".jpeg"],
  "image/webp": [".webp"],
  "text/plain": [".txt"],
  "text/csv": [".csv"],
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [".xlsx"],
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [".docx"],
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": [".pptx"],
};

/** Check the file's first bytes match its claimed type (stops renamed executables). */
function sniff(buf: Buffer, mime: string): boolean {
  const starts = (sig: number[]) => sig.every((b, i) => buf[i] === b);
  if (mime === "application/pdf") return starts([0x25, 0x50, 0x44, 0x46]);
  if (mime === "image/png") return starts([0x89, 0x50, 0x4e, 0x47]);
  if (mime === "image/jpeg") return starts([0xff, 0xd8, 0xff]);
  if (mime === "image/webp") return starts([0x52, 0x49, 0x46, 0x46]) && buf.subarray(8, 12).toString() === "WEBP";
  if (mime.startsWith("application/vnd.openxmlformats")) return starts([0x50, 0x4b, 0x03, 0x04]);
  if (mime.startsWith("text/")) return !buf.subarray(0, 4096).includes(0);
  return false;
}

export class StorageError extends Error {
  name = "UserError";
}

export function validateUpload(file: File, buf: Buffer) {
  if (!file || file.size === 0) throw new StorageError("Choose a file to upload.");
  if (file.size > MAX_UPLOAD_BYTES) throw new StorageError("Files must be 25 MB or smaller.");
  const ext = path.extname(file.name).toLowerCase();
  const allowed = ALLOWED_TYPES[file.type];
  if (!allowed || !allowed.includes(ext)) throw new StorageError("That file type isn't allowed. Use PDF, image, Excel, Word, PowerPoint, CSV or text.");
  if (!sniff(buf, file.type)) throw new StorageError("The file's contents don't match its type.");
}

export async function saveFile(buf: Buffer) {
  const key = randomBytes(24).toString("hex");
  const dir = path.join(ROOT, key.slice(0, 2));
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, key), buf, { mode: 0o600 });
  return { key, sha256: createHash("sha256").update(buf).digest("hex") };
}

export async function readStored(key: string) {
  if (!/^[a-f0-9]{48}$/.test(key)) throw new Error("bad key");
  return readFile(path.join(ROOT, key.slice(0, 2), key));
}
