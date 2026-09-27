import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { all, get } from "./db";
import { sign, verify } from "./signed";

export type User = {
  id: number;
  owner_id: number;
  name: string;
  phone: string;
  email: string | null;
  role: "owner" | "manager" | "resident" | "staff";
  status: string;
  business_name: string | null;
};

const COOKIE = "se_session";
const SESSION_DAYS = 30;

/** Signed, stateless session cookie — valid on every server instance. */
export async function createSession(userId: number) {
  const token = sign({ u: userId }, SESSION_DAYS * 86_400);
  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: SESSION_DAYS * 86_400,
    path: "/",
  });
}

export async function destroySession() {
  (await cookies()).delete(COOKIE);
}

export async function currentUser(): Promise<User | null> {
  const s = verify<{ u: number }>((await cookies()).get(COOKIE)?.value);
  if (!s) return null;
  // Removed managers are marked 'disabled', which ends their session here.
  return (
    (await get<User>(
      "SELECT id, owner_id, name, phone, email, role, status, business_name FROM users WHERE id = ? AND status != 'disabled'",
      s.u,
    )) ?? null
  );
}

/** Owner or manager. Every staff-side page and action goes through this. */
export async function requireStaff(): Promise<User & { propertyIds: number[] }> {
  const u = await currentUser();
  if (!u) redirect("/login");
  if (u.role === "resident") redirect("/me");
  if (u.role !== "owner" && u.role !== "manager") redirect("/login");
  return { ...u, propertyIds: await accessiblePropertyIds(u) };
}

export async function requireOwner() {
  const u = await requireStaff();
  if (u.role !== "owner") redirect("/owner");
  return u;
}

export async function requireResident(): Promise<User> {
  const u = await currentUser();
  if (!u) redirect("/login");
  if (u.role !== "resident") redirect("/owner");
  return u;
}

export async function accessiblePropertyIds(u: User): Promise<number[]> {
  if (u.role === "owner") return (await all<{ id: number }>("SELECT id FROM properties WHERE owner_id = ? ORDER BY id", u.id)).map((r) => r.id);
  if (u.role === "manager")
    return (await all<{ id: number }>(
      "SELECT mp.property_id id FROM manager_properties mp JOIN properties p ON p.id = mp.property_id WHERE mp.user_id = ? AND p.owner_id = ? ORDER BY 1",
      u.id,
      u.owner_id,
    )).map((r) => r.id);
  return [];
}

/** Throws unless the staff user can access this property. */
export function assertProperty(u: { propertyIds: number[] }, propertyId: number | null | undefined) {
  if (!propertyId || !u.propertyIds.includes(Number(propertyId))) throw new Error("Not allowed");
}

export function inList(ids: number[]): string {
  return ids.length ? ids.map(() => "?").join(",") : "NULL";
}
