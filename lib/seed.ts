import "server-only";
import { all, get, run } from "./db";
import { createProperty, wizardFloors, type FloorSpec } from "./setup";
import { checkIn, giveNotice } from "./residents";
import { createInvoiceForStay, recordPayment, addInvoiceItem, type Stay } from "./billing";
import { addDays, addMonths, dayOfMonth, thisMonth, today } from "./format";

/*
 * Demo data so the app is explorable on first run. Logins (OTP shown on screen in dev):
 *   Owner    Ramesh  9876500001
 *   Manager  Suresh  9876500002 (Sunrise Men's PG only)
 *   Resident Priya   9876500003 (Lotus Ladies PG)
 */
const MEN = ["Arjun Nair", "Rahul Verma", "Karthik S", "Vikram Rao", "Sandeep Kumar", "Aditya Joshi", "Rohit Das", "Manoj Pillai", "Nikhil Jain", "Harsha Gowda", "Imran Khan", "Deepak Yadav", "Siddharth Menon", "Pranav Kulkarni", "Ajay Reddy", "Varun Shetty"];
const WOMEN = ["Priya Sharma", "Ananya Iyer", "Sneha Patil", "Divya Krishnan", "Meera Nambiar", "Kavya Hegde", "Pooja Singh", "Riya Kapoor"];

export async function seed() {
  const t = today();
  const month = thisMonth();
  const prev = addMonths(month, -1);
  const prev2 = addMonths(month, -2);

  const owner = (await run("INSERT INTO users (name, phone, email, role, business_name) VALUES ('Ramesh Gowda', '9876500001', 'ramesh@example.com', 'owner', 'Gowda PG Stays')", )).id;
  await run("UPDATE users SET owner_id = id WHERE id = ?", owner);
  const manager = (await run("INSERT INTO users (owner_id, name, phone, role) VALUES (?, 'Suresh Kumar', '9876500002', 'manager')", owner)).id;

  const rules = "Gate closes at 11 PM.\nNo smoking or alcohol inside the building.\nGuests allowed in the common area till 8 PM.\nSwitch off AC and lights when leaving the room.\nRent due by the 5th of every month.";

  const sunriseFloors = wizardFloors({ floors: 3, roomsPerFloor: 4, sharing: 2, rent: 8000, ac: false, bath: true, groundFloor: false });
  sunriseFloors[2].rooms = sunriseFloors[2].rooms.map((r) => ({ ...r, sharing: 3, rent: 6500 }));
  const sunrise = await createProperty(owner, owner, {
    name: "Sunrise Men's PG",
    address: "14, 5th Cross, Koramangala 6th Block, Bengaluru 560095",
    type: "boys",
    amenities: "Wi-Fi, Washing machine, Hot water, 3 meals, Housekeeping",
    rules,
    wifi_name: "Sunrise_5G",
    wifi_password: "sunrise@2026",
    contact_phone: "9876500002",
    billing_day: 1,
    due_day: 5,
    late_fee: 200,
    notice_days: 30,
    floors: sunriseFloors,
  });

  const lotusFloors: FloorSpec[] = [
    { name: "Ground floor", rooms: [
      { number: "G01", sharing: 1, rent: 12000, ac: true, bath: true },
      { number: "G02", sharing: 2, rent: 9000, ac: true, bath: true },
      { number: "G03", sharing: 2, rent: 9000, ac: false, bath: true },
    ] },
    { name: "Floor 1", rooms: [
      { number: "101", sharing: 1, rent: 12000, ac: true, bath: true },
      { number: "102", sharing: 2, rent: 9000, ac: true, bath: true },
      { number: "103", sharing: 2, rent: 9000, ac: false, bath: false },
    ] },
  ];
  const lotus = await createProperty(owner, owner, {
    name: "Lotus Ladies PG",
    address: "221, 27th Main, HSR Layout Sector 2, Bengaluru 560102",
    type: "girls",
    amenities: "Wi-Fi, AC rooms, CCTV, Hot water, 3 meals, Laundry",
    rules,
    wifi_name: "Lotus_Home",
    wifi_password: "lotus#2026",
    contact_phone: "9876500001",
    billing_day: 1,
    due_day: 5,
    late_fee: 200,
    notice_days: 30,
    floors: lotusFloors,
  });
  await run("INSERT INTO manager_properties (user_id, property_id) VALUES (?, ?)", manager, sunrise);

  // Fill beds with residents.
  const place = async (propertyId: number, names: string[], phoneStart: number, skip: number[]) => {
    const beds = await all<{ id: number; monthly_rent: number }>("SELECT id, monthly_rent FROM beds WHERE property_id = ? ORDER BY id", propertyId);
    const stays: number[] = [];
    let n = 0;
    for (const [i, b] of beds.entries()) {
      if (skip.includes(i) || n >= names.length) continue;
      const moveIn = addDays(t, -(40 + ((i * 37) % 300)));
      const phone = String(phoneStart + n);
      const { stayId } = await checkIn(owner, owner, {
        name: names[n],
        phone,
        email: names[n].split(" ")[0].toLowerCase() + "@example.com",
        bedId: b.id,
        moveIn,
        rent: b.monthly_rent,
        deposit: b.monthly_rent * 2,
        occupation: i % 3 === 0 ? "Student" : "Working professional",
        college_company: ["Christ University", "Infosys", "Flipkart", "Swiggy", "PES University", "Razorpay"][i % 6],
      });
      await run("UPDATE users SET status = 'active' WHERE phone = ?", phone);
      stays.push(stayId);
      n++;
    }
    return stays;
  };
  // Priya first so she gets 9876500003.
  const lotusStays = await place(lotus, WOMEN, 9876500003, [0, 7]);
  const sunriseStays = await place(sunrise, MEN, 9876500100, [3, 9, 17, 21, 24]);
  const stays = [...sunriseStays, ...lotusStays];

  // Past two months fully paid; current month mixed.
  const modes = ["gateway", "gateway", "upi", "cash", "gateway", "bank"];
  for (const [i, id] of stays.entries()) {
    const s =(await get<Stay>("SELECT * FROM stays WHERE id = ?", id))!;
    for (const m of [prev2, prev]) {
      const inv = await createInvoiceForStay(s, m);
      if (!inv) continue;
      if (m === prev && i % 4 === 1) await addInvoiceItem(inv, "electricity", "Electricity (room share)", 450 + (i % 3) * 120);
      const total = (await get<{ total: number }>("SELECT total FROM invoices WHERE id = ?", inv))!.total;
      await recordPayment({ invoiceId: inv, amount: total, mode: modes[i % modes.length], recordedBy: i % 2 ? owner : manager, paidAt: dayOfMonth(m, 2 + (i % 5)) + "T10:30:00.000Z" });
    }
    const cur = await get<{ id: number; total: number }>("SELECT id, total FROM invoices WHERE stay_id = ? AND month = ?", id, month);
    if (!cur) continue;
    if (i % 4 === 1) await addInvoiceItem(cur.id, "electricity", "Electricity (room share)", 380 + (i % 3) * 90);
    const total = (await get<{ total: number }>("SELECT total FROM invoices WHERE id = ?", cur.id))!.total;
    if (i % 5 === 0 || i % 7 === 3) continue; // unpaid → defaulters
    if (i % 6 === 2) {
      await recordPayment({ invoiceId: cur.id, amount: Math.round(total / 2), mode: "cash", note: "Rest by 15th", recordedBy: manager, paidAt: dayOfMonth(month, 4) + "T09:00:00.000Z" });
      continue;
    }
    await recordPayment({ invoiceId: cur.id, amount: total, mode: modes[i % modes.length], recordedBy: owner, paidAt: dayOfMonth(month, 1 + (i % 5)) + "T11:00:00.000Z" });
  }

  // Priya: current month unpaid so the resident demo shows a Pay button.
  const priya = (await get<{ id: number }>("SELECT id FROM users WHERE phone = '9876500003'"))!.id;
  const priyaStay = (await get<{ id: number }>("SELECT id FROM stays WHERE resident_id = ?", priya))!.id;
  const priyaInv = (await get<{ id: number }>("SELECT id FROM invoices WHERE stay_id = ? AND month = ?", priyaStay, month))!.id;
  await run("DELETE FROM payments WHERE invoice_id = ?", priyaInv);
  await run("UPDATE invoices SET paid = 0, status = 'unpaid' WHERE id = ?", priyaInv);
  const priyaItems = (await get<{ n: number }>("SELECT COUNT(*) n FROM invoice_items WHERE invoice_id = ?", priyaInv))!.n;
  if (priyaItems === 1) await addInvoiceItem(priyaInv, "electricity", "Electricity (room share)", 420);
  await run("UPDATE resident_profiles SET emergency_name = 'Rajesh Sharma (father)', emergency_phone = '9812345678', permanent_address = 'Jaipur, Rajasthan', rules_accepted_at = ? WHERE user_id = ?", ago(0), priya);

  // One resident on notice (moving out in 5 days), one reserved bed arriving in 3 days.
  const leaving = sunriseStays[2];
  await giveNotice(leaving, owner, addDays(t, -25));
  const vacantBed = (await get<{ id: number; monthly_rent: number }>("SELECT id, monthly_rent FROM beds WHERE property_id = ? AND status = 'vacant' ORDER BY id LIMIT 1", sunrise))!;
  await checkIn(owner, owner, { name: "Tarun Bhat", phone: "9876500200", bedId: vacantBed.id, moveIn: addDays(t, 3), rent: vacantBed.monthly_rent, deposit: vacantBed.monthly_rent * 2, occupation: "Working professional", college_company: "Zerodha" });
  const maint = (await get<{ id: number }>("SELECT id FROM beds WHERE property_id = ? AND status = 'vacant' ORDER BY id DESC LIMIT 1", sunrise))!;
  await run("UPDATE beds SET status = 'maintenance' WHERE id = ?", maint.id);

  // Complaints.
  const roomOf = async (stayId: number) => (await get<{ room_id: number; resident_id: number; property_id: number }>("SELECT b.room_id, s.resident_id, s.property_id FROM stays s JOIN beds b ON b.id = s.bed_id WHERE s.id = ?", stayId))!;
  const complaint = async (stayId: number, category: string, description: string, status: string, hoursAgo: number, priority = "normal") => {
    const r = await roomOf(stayId);
    const created = ago(hoursAgo);
    await run(
      "INSERT INTO complaints (owner_id, property_id, resident_id, room_id, category, description, priority, status, assigned_to, created_at, updated_at, resolved_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      owner, r.property_id, r.resident_id, r.room_id, category, description, priority, status,
      status === "open" ? null : r.property_id === sunrise ? manager : owner,
      created, created, status === "resolved" || status === "closed" ? created : null,
    );
  };
  await complaint(sunriseStays[0], "plumbing", "Geyser in the bathroom is not heating. Only cold water since Monday.", "open", 76, "high");
  await complaint(sunriseStays[5], "wifi", "Wi-Fi in room 104 keeps disconnecting every evening.", "in_progress", 20);
  await complaint(lotusStays[0], "wifi", "Wi-Fi is very slow in room G02 after 9 PM.", "open", 5);
  await complaint(lotusStays[3], "electrical", "Tube light in room flickering.", "closed", 240);
  await complaint(sunriseStays[8], "cleaning", "Corridor on floor 3 not cleaned for two days.", "resolved", 30);

  // Notices.
  await run("INSERT INTO notices (owner_id, property_id, title, body, pinned, created_by, created_at) VALUES (?, ?, ?, ?, 1, ?, ?)", owner, sunrise, "Water supply off on Sunday 10 AM – 2 PM", "The overhead tank is being cleaned. Please store water on Saturday night.", owner, ago(48));
  await run("INSERT INTO notices (owner_id, property_id, title, body, pinned, created_by, created_at) VALUES (?, NULL, ?, ?, 0, ?, ?)", owner, "Pay rent from the app", "You can now pay rent by UPI inside StayEasy and download your receipt instantly — useful for HRA claims.", owner, ago(144));
  await run("INSERT INTO notices (owner_id, property_id, title, body, pinned, created_by, created_at) VALUES (?, ?, ?, ?, 1, ?, ?)", owner, lotus, "Pest control this Friday", "Please keep your belongings off the floor on Friday morning. Rooms will be done between 11 AM and 1 PM.", owner, ago(24));
}

/** "YYYY-MM-DD HH:MM:SS" (UTC) for `hours` ago — same format as NOW_SQL. */
function ago(hours: number) {
  return new Date(Date.now() - hours * 3_600_000).toISOString().replace("T", " ").slice(0, 19);
}
