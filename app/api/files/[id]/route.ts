import { currentUser, accessiblePropertyIds, inList } from "@/lib/auth";
import { get } from "@/lib/db";

type FileRow = { owner_id: number; resident_id: number | null; uploaded_by: number; mime: string; original_name: string | null };

/** Private file access: the uploader's own resident, or staff of that resident's property. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const u = await currentUser();
  if (!u) return new Response("Unauthorized", { status: 401 });
  if (!/^[0-9a-f-]{36}$/.test(id)) return new Response("Not found", { status: 404 });
  const f = await get<FileRow>("SELECT owner_id, resident_id, uploaded_by, mime, original_name FROM files WHERE id = ?", id);
  if (!f) return new Response("Not found", { status: 404 });

  let ok = false;
  if (u.role === "resident") ok = f.resident_id === u.id || f.uploaded_by === u.id;
  else if (u.role === "owner") ok = f.owner_id === u.id;
  else if (u.role === "manager" && f.owner_id === u.owner_id) {
    const ids = await accessiblePropertyIds(u);
    ok = f.resident_id === null || !!(await get(`SELECT 1 FROM stays WHERE resident_id = ? AND property_id IN (${inList(ids)})`, f.resident_id, ...ids));
  }
  if (!ok) return new Response("Forbidden", { status: 403 });

  const { data } = (await get<{ data: Uint8Array }>("SELECT data FROM files WHERE id = ?", id))!;
  return new Response(new Uint8Array(data), {
    headers: {
      "Content-Type": f.mime,
      "Content-Disposition": `inline; filename="${encodeURIComponent(f.original_name ?? "file")}"`,
      "Cache-Control": "private, max-age=300",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
