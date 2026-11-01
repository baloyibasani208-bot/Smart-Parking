import { ref, push, update } from "firebase/database";

export const STAFF_SEED = {
  A1B2C3D4: "Basani Baloyi",
  "5F6E7D8C": "Differ Ngobeni",
};
export const PARKING_SLOTS = ["P1", "P2", "P3"];

// small deterministic random generator so the demo data is always the same
function rng(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Builds IN/OUT events for all parking slots from 18-10-2026 until now
export async function seedDatabase(db) {
  const r = rng(1810);
  const now = Date.now();
  const cards = Object.keys(STAFF_SEED);
  const events = [];

  for (const d of [18, 19, 20]) {
    const open = new Date(2026, 9, d, 7, 0).getTime();
    const close = d === 20
      ? Math.min(now, new Date(2026, 9, 20, 23, 0).getTime())
      : new Date(2026, 9, d, 18, 30).getTime();
    for (const slot of PARKING_SLOTS) {
      let t = open + Math.floor(r() * 40) * 60000;
      for (;;) {
        t += (15 + Math.floor(r() * 60)) * 60000;
        if (t >= close) break;
        const card = cards[Math.floor(r() * cards.length)];
        const who = { slot, card, name: STAFF_SEED[card] };
        events.push({ ...who, t, type: "IN" });
        let out = t + (40 + Math.floor(r() * 200)) * 60000;
        if (out >= close) {
          if (d === 20) break;          // car is still parked right now
          out = close;
        }
        events.push({ ...who, t: out, type: "OUT" });
        t = out;
      }
    }
  }

  events.sort((a, b) => a.t - b.t);
  const logs = {};
  events.forEach((e) => { logs[push(ref(db, "logs")).key] = e; });

  const last = {};
  events.forEach((e) => { last[e.slot] = e.type; });

  const parking = Object.fromEntries(
    PARKING_SLOTS.map((slot) => [slot, last[slot] === "IN" ? "Occupied" : "Free"]),
  );
  await update(ref(db), {
    logs,                                   // replaces the node, so re-running never duplicates
    staff: STAFF_SEED,
    parking,
  });
  return events.length;
}
