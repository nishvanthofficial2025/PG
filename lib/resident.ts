import "server-only";
import { get } from "./db";

export type MyStay = {
  id: number;
  owner_id: number;
  property_id: number;
  bed_id: number;
  status: string;
  move_in: string;
  move_out: string | null;
  notice_date: string | null;
  rent: number;
  deposit: number;
  refund_amount: number | null;
  refund_paid_at: string | null;
  bed: string;
  room_id: number;
  room: string;
  property: string;
  address: string | null;
  rules: string | null;
  wifi_name: string | null;
  wifi_password: string | null;
  contact_phone: string | null;
  notice_days: number;
  show_roommates: number;
  owner_name: string;
  owner_phone: string;
};

/** The resident's current stay (or the most recent one if they have moved out). */
export function myStay(userId: number): MyStay | undefined {
  return get<MyStay>(
    `SELECT s.*, b.label bed, b.room_id, r.number room, p.name property, p.address, p.rules, p.wifi_name, p.wifi_password, p.contact_phone, p.notice_days, p.show_roommates,
       o.name owner_name, o.phone owner_phone
     FROM stays s JOIN beds b ON b.id = s.bed_id JOIN rooms r ON r.id = b.room_id JOIN properties p ON p.id = s.property_id JOIN users o ON o.id = p.owner_id
     WHERE s.resident_id = ? AND s.status != 'shifted'
     ORDER BY CASE s.status WHEN 'active' THEN 0 WHEN 'notice' THEN 0 WHEN 'reserved' THEN 1 ELSE 2 END, s.id DESC LIMIT 1`,
    userId,
  );
}
