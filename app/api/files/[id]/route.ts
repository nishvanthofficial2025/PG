import fs from "node:fs";
import path from "node:path";
import { currentUser, accessiblePropertyIds, inList } from "@/lib/auth";
import { get, UPLOAD_DIR } from "@/lib/db";

/** Private file access: the uploader's own resident, or staff of that resident's property. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const u = await currentUser();
  if (!u) return new Response("Unauthorized", { status: 401 });
  const f = get<{ owner_id: number; resident_id: number | null; uploaded_by: number; stored_name: string; mime: string; original_name: string }>(
    "SELECT * FROM files WHERE id = ?",
    id,
  );
  if (!f) return new Response("Not found", { status: 404 });

  let ok = false;
  if (u.role === "resident") ok = f.resident_id === u.id || f.uploaded_by === u.id;
  else if (u.role === "owner") ok = f.owner_id === u.id;
  else if (u.role === "manager" && f.owner_id === u.owner_id) {
    const ids = accessiblePropertyIds(u);
    ok =
      f.resident_id === null ||
      !!get(`SELECT 1 FROM stays WHERE resident_id = ? AND property_id IN (${inList(ids)})`, f.resident_id, ...ids);
  }
  if (!ok) return new Response("Forbidden", { status: 403 });

  const data = fs.readFileSync(path.join(UPLOAD_DIR, path.basename(f.stored_name)));
  return new Response(data, {
    headers: {
      "Content-Type": f.mime,
      "Content-Disposition": `inline; filename="${encodeURIComponent(f.original_name ?? "file")}"`,
      "Cache-Control": "private, max-age=300",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
