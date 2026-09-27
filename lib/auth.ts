import "server-only";
import crypto from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { all, get, run } from "./db";

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

export async function createSession(userId: number) {
  const token = crypto.randomBytes(32).toString("hex");
  const expires = new Date(Date.now() + SESSION_DAYS * 86_400_000);
  run("INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)", token, userId, expires.toISOString());
  (await cookies()).set(COOKIE, token, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", expires, path: "/" });
}

export async function destroySession() {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (token) run("DELETE FROM sessions WHERE token = ?", token);
  jar.delete(COOKIE);
}

export async function currentUser(): Promise<User | null> {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  return (
    get<User>(
      `SELECT u.id, u.owner_id, u.name, u.phone, u.email, u.role, u.status, u.business_name
       FROM sessions s JOIN users u ON u.id = s.user_id
       WHERE s.token = ? AND s.expires_at > ? AND u.status != 'disabled'`,
      token,
      new Date().toISOString(),
    ) ?? null
  );
}

/** Owner or manager. Every staff-side page and action goes through this. */
export async function requireStaff(): Promise<User & { propertyIds: number[] }> {
  const u = await currentUser();
  if (!u) redirect("/login");
  if (u.role === "resident") redirect("/me");
  if (u.role !== "owner" && u.role !== "manager") redirect("/login");
  return { ...u, propertyIds: accessiblePropertyIds(u) };
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

export function accessiblePropertyIds(u: User): number[] {
  if (u.role === "owner") return all<{ id: number }>("SELECT id FROM properties WHERE owner_id = ? ORDER BY id", u.id).map((r) => r.id);
  if (u.role === "manager")
    return all<{ id: number }>(
      "SELECT mp.property_id id FROM manager_properties mp JOIN properties p ON p.id = mp.property_id WHERE mp.user_id = ? AND p.owner_id = ? ORDER BY 1",
      u.id,
      u.owner_id,
    ).map((r) => r.id);
  return [];
}

/** Throws unless the staff user can access this property. */
export function assertProperty(u: { propertyIds: number[] }, propertyId: number | null | undefined) {
  if (!propertyId || !u.propertyIds.includes(Number(propertyId))) throw new Error("Not allowed");
}

export function inList(ids: number[]): string {
  return ids.length ? ids.map(() => "?").join(",") : "NULL";
}
