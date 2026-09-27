import "server-only";
import { cookies } from "next/headers";
import { all } from "./db";
import { inList } from "./auth";

export const SCOPE_COOKIE = "se_property";

export type Staff = { id: number; owner_id: number; role: string; propertyIds: number[] };

/** Properties the current staff user is looking at (switcher value, or all they can access). */
export async function scopeIds(u: Staff): Promise<{ ids: number[]; selected: string }> {
  const raw = (await cookies()).get(SCOPE_COOKIE)?.value ?? "all";
  const id = Number(raw);
  if (raw !== "all" && u.propertyIds.includes(id)) return { ids: [id], selected: raw };
  return { ids: u.propertyIds, selected: "all" };
}

export async function propertyList(ids: number[]) {
  return await all<{ id: number; name: string }>(`SELECT id, name FROM properties WHERE id IN (${inList(ids)}) ORDER BY id`, ...ids);
}
