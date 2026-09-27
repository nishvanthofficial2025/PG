import "server-only";
import crypto from "node:crypto";
import { run } from "./db";

const ALLOWED: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/heic": ".heic",
  "application/pdf": ".pdf",
};
// Vercel caps request bodies at 4.5 MB, so keep uploads under that.
const MAX_BYTES = 4 * 1024 * 1024;

/**
 * Stores an upload in the private `files` table (never under /public).
 * Files are only served through /api/files/[id], which checks access.
 * At scale: move bytes to a private S3 / Supabase bucket + short-lived signed URLs.
 */
export async function saveUpload(file: FormDataEntryValue | null, ownerId: number, uploadedBy: number, residentId: number | null): Promise<string | null> {
  if (!file || typeof file === "string" || file.size === 0) return null;
  const ext = ALLOWED[file.type];
  if (!ext) throw new Error("Upload a photo (JPG/PNG/WEBP) or a PDF");
  if (file.size > MAX_BYTES) throw new Error("File is larger than 4 MB — please use a smaller photo");
  const id = crypto.randomUUID();
  await run(
    "INSERT INTO files (id, owner_id, resident_id, uploaded_by, stored_name, original_name, mime, data) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    id,
    ownerId,
    residentId,
    uploadedBy,
    id + ext,
    file.name.slice(0, 200),
    file.type,
    new Uint8Array(await file.arrayBuffer()),
  );
  return id;
}
