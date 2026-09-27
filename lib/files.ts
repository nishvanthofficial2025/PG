import "server-only";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { run, UPLOAD_DIR } from "./db";

const ALLOWED: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/heic": ".heic",
  "application/pdf": ".pdf",
};
const MAX_BYTES = 5 * 1024 * 1024;

/**
 * Stores an upload in the private data/uploads folder (never under /public).
 * Files are only served through /api/files/[id], which checks access.
 * Production: swap for a private S3 / Supabase bucket + short-lived signed URLs.
 */
export async function saveUpload(file: FormDataEntryValue | null, ownerId: number, uploadedBy: number, residentId: number | null): Promise<string | null> {
  if (!file || typeof file === "string" || file.size === 0) return null;
  const ext = ALLOWED[file.type];
  if (!ext) throw new Error("Upload a photo (JPG/PNG/WEBP) or a PDF");
  if (file.size > MAX_BYTES) throw new Error("File is larger than 5 MB");
  const id = crypto.randomUUID();
  const stored = id + ext;
  fs.writeFileSync(path.join(UPLOAD_DIR, stored), Buffer.from(await file.arrayBuffer()));
  run(
    "INSERT INTO files (id, owner_id, resident_id, uploaded_by, stored_name, original_name, mime) VALUES (?, ?, ?, ?, ?, ?, ?)",
    id,
    ownerId,
    residentId,
    uploadedBy,
    stored,
    file.name.slice(0, 200),
    file.type,
  );
  return id;
}
