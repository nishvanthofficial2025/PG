import "server-only";
import { redirect, unstable_rethrow } from "next/navigation";
import { revalidatePath } from "next/cache";

export function withParam(path: string, key: string, value: string) {
  const [base, qs] = path.split("?");
  const p = new URLSearchParams(qs);
  p.delete("ok");
  p.delete("err");
  p.set(key, value);
  return `${base}?${p.toString()}`;
}

/**
 * Runs a mutation, then redirects back with ?ok= or ?err= so every form gets
 * feedback without client JS. `fn` may return a path to redirect to instead.
 */
export async function attempt(back: string, fn: () => unknown, ok?: string): Promise<never> {
  let dest: unknown;
  try {
    dest = await fn();
  } catch (e) {
    unstable_rethrow(e);
    console.error(e);
    redirect(withParam(back, "err", e instanceof Error ? e.message : "Something went wrong"));
  }
  revalidatePath("/", "layout");
  const target = typeof dest === "string" ? dest : back;
  redirect(ok ? withParam(target, "ok", ok) : target);
}

export function str(fd: FormData, key: string): string {
  return String(fd.get(key) ?? "").trim();
}
export function optStr(fd: FormData, key: string): string | null {
  return str(fd, key) || null;
}
export function num(fd: FormData, key: string, fallback = 0): number {
  const raw = str(fd, key).replace(/[,₹\s]/g, "");
  const n = Number(raw);
  return raw === "" || !Number.isFinite(n) ? fallback : n;
}
export function bool(fd: FormData, key: string): boolean {
  const v = fd.get(key);
  return v === "on" || v === "1" || v === "true";
}
export function need(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}
