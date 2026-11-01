import { useEffect, useMemo, useState } from "react";
import {
  onIdTokenChanged, getIdTokenResult, signInWithEmailAndPassword,
  createUserWithEmailAndPassword, updateProfile, signOut,
} from "firebase/auth";
import { ref, onValue, query, orderByChild, limitToLast, set, remove, push, runTransaction } from "firebase/database";
import { auth, db } from "./firebase";
import { PARKING_SLOTS, seedDatabase } from "./seed";

/* ---------- helpers ---------- */
const ADMIN_EMAIL = "baloyibasani@gmail.com";
const ERR = {
  "auth/invalid-credential": "Wrong email or password.",
  "auth/user-not-found": "No account with that email.",
  "auth/wrong-password": "Wrong email or password.",
  "auth/email-already-in-use": "That email is already registered.",
  "auth/weak-password": "Password must be at least 6 characters.",
  "auth/invalid-email": "That email address isn’t valid.",
  "auth/too-many-requests": "Too many attempts. Try again later.",
  "auth/network-request-failed": "Network error. Check your connection.",
  "auth/operation-not-allowed": "Enable Email/Password sign-in in the Firebase console.",
  "auth/configuration-not-found": "Firebase Authentication isn’t configured for this project. In Firebase Console, open Authentication, get started, then enable Email/Password under Sign-in method.",
};
const dayKey = (t) => {
  const d = new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const fDate = (t) => new Date(t).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
const fTime = (t) => new Date(t).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
const fDur = (ms) => {
  const m = Math.max(0, Math.round(ms / 60000));
  return m < 60 ? `${m}m` : `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, "0")}m`;
};
const PARKING_RATE = 25;
const BILLING_MINUTE_MS = 60 * 1000;
const chargeFor = (ms, rate = PARKING_RATE) => Math.max(1, Math.ceil(ms / BILLING_MINUTE_MS)) * rate;
const fMoney = (amount) => new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR" }).format(amount);
const dayLabel = (k) => { const [y, m, d] = k.split("-").map(Number); return fDate(new Date(y, m - 1, d).getTime()); };

function buildSessions(logsAsc) {
  const open = {}, out = [];
  for (const e of logsAsc) {
    if (e.type === "IN") {
      open[e.slot] = { slot: e.slot, inT: e.t, card: e.card, name: e.name, outT: null };
      out.push(open[e.slot]);
    } else if (e.type === "OUT" && open[e.slot]) {
      open[e.slot].outT = e.t;
      open[e.slot] = null;
    }
  }
  return out.reverse();
}

function useNow() {
  const [n, setN] = useState(Date.now());
  useEffect(() => { const i = setInterval(() => setN(Date.now()), 30000); return () => clearInterval(i); }, []);
  return n;
}

const CarIcon = ({ size = 24 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M5 16V11l2-5h10l2 5v5M3 16h18v3H3zM7 19v2M17 19v2" /><circle cx="8" cy="13.5" r=".6" /><circle cx="16" cy="13.5" r=".6" />
  </svg>
);

/* ---------- auth screen ---------- */
function AuthScreen() {
  const [mode, setMode] = useState("in");
  const [f, setF] = useState({ name: "", email: "", pass: "", pass2: "" });
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const up = mode === "up";
  const set1 = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault(); setErr("");
    if (up && f.pass !== f.pass2) return setErr("Passwords don’t match.");
    setBusy(true);
    try {
      if (up) {
        const c = await createUserWithEmailAndPassword(auth, f.email.trim(), f.pass);
        if (f.name.trim()) await updateProfile(c.user, { displayName: f.name.trim() });
      } else {
        await signInWithEmailAndPassword(auth, f.email.trim(), f.pass);
      }
    } catch (x) { setErr(ERR[x.code] || x.message); }
    setBusy(false);
  };

  return (
    <div className="auth">
      <aside className="brand">
        <div className="logo"><CarIcon size={26} /> SmartPark</div>
        <div className="brand-tag">PARKING, MADE SIMPLE</div>
        <h1>Every space.<br />Always in view.</h1>
        <p>Live slot availability, entry and exit timestamps, and staff access control — all in one dashboard.</p>
        <ul>
          <li>Real-time slot status from ESP32 sensors</li>
          <li>Time-stamped parking sessions</li>
          <li>RFID staff gate management</li>
        </ul>
        <div className="brand-foot"><span /> Your parking operations, in sync</div>
      </aside>
      <main className="panel">
        <form className="auth-card" onSubmit={submit}>
          <div className="auth-heading">
            <span className="auth-kicker">PARKING OPERATIONS</span>
            <h2>{up ? "Create your account" : "Welcome back"}</h2>
            <p className="muted">{up ? "Sign up to access the parking dashboard." : "Sign in to continue to your dashboard."}</p>
          </div>
          <div className="seg">
            <button type="button" className={!up ? "on" : ""} onClick={() => { setMode("in"); setErr(""); }}>Sign in</button>
            <button type="button" className={up ? "on" : ""} onClick={() => { setMode("up"); setErr(""); }}>Sign up</button>
          </div>
          {up && <label>Full name<input value={f.name} onChange={set1("name")} placeholder="Jane Doe" autoComplete="name" /></label>}
          <label>Email<input type="email" required value={f.email} onChange={set1("email")} placeholder="you@example.com" autoComplete="email" /></label>
          <label>Password<input type="password" required minLength={6} value={f.pass} onChange={set1("pass")} placeholder="Minimum 6 characters" autoComplete={up ? "new-password" : "current-password"} /></label>
          {up && <label>Confirm password<input type="password" required value={f.pass2} onChange={set1("pass2")} placeholder="Repeat password" autoComplete="new-password" /></label>}
          {err && <div className="err">{err}</div>}
          <button className="btn primary wide" disabled={busy}>{busy ? "Please wait…" : up ? "Create account" : "Sign in"}</button>
        </form>
      </main>
    </div>
  );
}

/* ---------- charts ---------- */
function DayChart({ logs }) {
  const days = useMemo(() => {
    const m = {};
    logs.forEach((e) => { const k = dayKey(e.t); m[k] = m[k] || { in: 0, out: 0 }; e.type === "IN" ? m[k].in++ : m[k].out++; });
    return Object.keys(m).sort().map((k) => ({ k, ...m[k] }));
  }, [logs]);
  const max = Math.max(1, ...days.map((d) => Math.max(d.in, d.out)));
  const H = 150, bw = 34, gap = 22, W = days.length * (bw * 2 + gap) + gap;
  return (
    <div className="chart">
      <svg viewBox={`0 0 ${Math.max(W, 260)} ${H + 34}`} width="100%" role="img" aria-label="Entries and exits per day">
        {days.map((d, i) => {
          const x = gap + i * (bw * 2 + gap);
          const hi = (d.in / max) * H, ho = (d.out / max) * H;
          return (
            <g key={d.k}>
              <rect x={x} y={H - hi} width={bw - 4} height={hi} rx="6" fill="#2563eb" />
              <rect x={x + bw} y={H - ho} width={bw - 4} height={ho} rx="6" fill="#f59e0b" />
              <text x={x + bw - 2} y={H - hi - 6} textAnchor="middle" className="tick">{d.in}</text>
              <text x={x + bw * 2 - 6} y={H - ho - 6} textAnchor="middle" className="tick">{d.out}</text>
              <text x={x + bw - 2} y={H + 20} textAnchor="middle" className="tick">{dayLabel(d.k).slice(0, 6)}</text>
            </g>
          );
        })}
      </svg>
      <div className="legend"><span><i style={{ background: "#2563eb" }} />Cars in</span><span><i style={{ background: "#f59e0b" }} />Cars out</span></div>
    </div>
  );
}

function WeeklyTrend({ sessions, bookings, now }) {
  const weeks = useMemo(() => {
    const currentWeek = new Date(now);
    currentWeek.setHours(0, 0, 0, 0);
    currentWeek.setDate(currentWeek.getDate() - ((currentWeek.getDay() + 6) % 7));
    const data = Array.from({ length: 8 }, (_, index) => {
      const start = new Date(currentWeek);
      start.setDate(start.getDate() - (7 * (7 - index)));
      const end = new Date(start);
      end.setDate(end.getDate() + 7);
      return { start: start.getTime(), end: end.getTime(), sessions: 0, stayMs: 0, revenue: 0 };
    });
    sessions.forEach((session) => {
      const week = data.find((item) => session.inT >= item.start && session.inT < item.end);
      if (week) {
        week.sessions += 1;
        week.stayMs += Math.max(0, (session.outT || now) - session.inT);
      }
    });
    bookings.forEach((booking) => {
      if (!booking.finishedAt || !booking.charged) return;
      const week = data.find((item) => booking.finishedAt >= item.start && booking.finishedAt < item.end);
      if (week) week.revenue += booking.charged;
    });
    return data;
  }, [sessions, bookings, now]);
  const maxSessions = Math.max(1, ...weeks.map((week) => week.sessions));
  const totalSessions = weeks.reduce((total, week) => total + week.sessions, 0);
  const totalRevenue = weeks.reduce((total, week) => total + week.revenue, 0);

  return (
    <div className="weekly-trend">
      <div className="trend-summary"><span><b>{totalSessions}</b> visits in 8 weeks</span><span><b>{fMoney(totalRevenue)}</b> recorded charges</span></div>
      <div className="trend-bars">
        {weeks.map((week) => <div className="trend-week" key={week.start}>
          <b className="trend-count">{week.sessions}</b>
          <div className="trend-bar-track"><span style={{ height: `${Math.max(week.sessions ? 8 : 2, (week.sessions / maxSessions) * 100)}%` }} /></div>
          <span className="trend-date">{new Date(week.start).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</span>
          <small>{week.sessions ? fDur(week.stayMs / week.sessions) : "No stays"}<br />{fMoney(week.revenue)}</small>
        </div>)}
      </div>
      <div className="legend"><span><i style={{ background: "#42764d" }} />Visits</span><span>Average stay · recorded booking charges per week</span></div>
    </div>
  );
}

function CustomerDashboard({ user }) {
  const [parking, setParking] = useState({});
  const [bookings, setBookings] = useState({});
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [rfidCard, setRfidCard] = useState("");
  const [bookingMinutes, setBookingMinutes] = useState(1);
  const now = useNow();

  useEffect(() => {
    const unsubscribeParking = onValue(ref(db, "parking"), (snapshot) => setParking(snapshot.val() || {}), (error) => setMessage(error.message));
    const unsubscribeBookings = onValue(ref(db, `bookings/${user.uid}`), (snapshot) => setBookings(snapshot.val() || {}), (error) => setMessage(error.message));
    return () => { unsubscribeParking(); unsubscribeBookings(); };
  }, [user.uid]);

  const myBookings = Object.entries(bookings).map(([id, booking]) => ({ id, ...booking }))
    .sort((a, b) => (b.bookedAt || 0) - (a.bookedAt || 0));
  const currentBooking = myBookings.find((booking) => booking.status === "reserved" || booking.status === "active");
  const availableSlots = PARKING_SLOTS.filter((id) => parking[id] === "Free");
  const completedBookings = myBookings.filter((booking) => booking.status === "completed");
  const totalCharged = completedBookings.reduce((total, booking) => total + (booking.charged || 0), 0);
  const name = user.displayName || user.email;

  const bookSlot = async (slot) => {
    const card = rfidCard.trim().toUpperCase().replace(/[^0-9A-F]/g, "");
    if (currentBooking || parking[slot] !== "Free") return;
    if (!/^[0-9A-F]{4,16}$/.test(card)) return setMessage("Enter a valid RFID card number (4–16 hexadecimal characters).");
    if (!Number.isInteger(Number(bookingMinutes)) || bookingMinutes < 1 || bookingMinutes > 24) return setMessage("Choose a booking duration from 1 to 24 demo minutes.");
    setBusy(slot); setMessage("");
    const bookingRef = push(ref(db, `bookings/${user.uid}`));
    const lockRef = ref(db, `bookingLocks/${slot}`);
    const bookedAt = Date.now();
    try {
      const lock = await runTransaction(lockRef, (current) => current == null
        ? { uid: user.uid, bookingId: bookingRef.key, bookedAt }
        : undefined, { applyLocally: false });
      if (!lock.committed) throw new Error("That spot was just reserved. Please choose another.");
      try {
        await set(bookingRef, {
          slot,
          status: "reserved",
          bookedAt,
          ratePerHour: PARKING_RATE,
          rfidCard: card,
          requestedMinutes: Number(bookingMinutes),
          requestedHours: Number(bookingMinutes),
          customerName: user.displayName || "",
          customerEmail: user.email || "",
        });
      } catch (error) {
        await runTransaction(lockRef, (current) => current?.bookingId === bookingRef.key ? null : undefined);
        throw error;
      }
      setMessage(`${slot} is reserved. Check in when you park to start your timer.`);
    } catch (error) { setMessage(error.message); }
    finally { setBusy(""); }
  };

  const cancelBooking = async (booking) => {
    setBusy(booking.id); setMessage("");
    try {
      const result = await runTransaction(ref(db, `bookings/${user.uid}/${booking.id}`), (current) =>
        current?.status === "reserved" ? { ...current, status: "cancelled", cancelledAt: Date.now() } : undefined);
      if (!result.committed) throw new Error("Only a reservation that has not started can be cancelled.");
      await runTransaction(ref(db, `bookingLocks/${booking.slot}`), (current) => current?.bookingId === booking.id ? null : undefined);
      setMessage("Reservation cancelled.");
    } catch (error) { setMessage(error.message); }
    finally { setBusy(""); }
  };

  return (
    <div className="app">
      <header className="top">
        <div className="logo dark"><CarIcon size={24} /> SmartPark</div>
        <div className="who"><div className="avatar">{(name || "?")[0].toUpperCase()}</div><span className="hide-sm">{name}</span><span className="role-label">Customer</span><button className="btn ghost" onClick={() => signOut(auth)}>Sign out</button></div>
      </header>
      <main className="wrap">
        <div className="title-row"><div><h1>My parking</h1><p className="muted">Reserve a space and keep track of your parking stays and charges.</p></div></div>
        {message && <div className="notice" role="status">{message}</div>}
        <section className="stats customer-stats">
          <div className="stat"><span>Current stay</span><b className="stat-small">{currentBooking?.status === "active" ? fDur(now - currentBooking.startedAt) : currentBooking?.status === "reserved" ? "Reserved" : "—"}</b></div>
          <div className="stat"><span>Completed stays</span><b>{completedBookings.length}</b></div>
          <div className="stat"><span>Total charged</span><b className="stat-small">{fMoney(totalCharged)}</b></div>
        </section>
        <section className="card booking-panel">
          <div className="booking-heading"><div><h3>{currentBooking ? "Your parking" : "Book a parking space"}</h3><p className="muted">Demo billing: each real minute counts as one parking hour at {fMoney(PARKING_RATE)} per hour.</p></div><span className="rate-label">{fMoney(PARKING_RATE)} / hour</span></div>
          {currentBooking ? (
            <div className="active-booking">
              <div className="booking-status"><span className={"pill " + (currentBooking.status === "active" ? "green" : currentBooking.status === "card_in_use" ? "red" : "amber")}>{currentBooking.status === "active" ? "Parked now" : currentBooking.status === "card_in_use" ? "Card already booked" : "Awaiting RFID + sensor"}</span><b>{currentBooking.slot}</b></div>
              {currentBooking.status === "active" ? <>
                <div className="booking-cost"><span>Parked since</span><b>{fDate(currentBooking.startedAt)} · {fTime(currentBooking.startedAt)}</b><span>RFID card</span><b>{currentBooking.rfidCard}</b><span>Booked for</span><b>{currentBooking.requestedHours} demo hour{currentBooking.requestedHours === 1 ? "" : "s"}</b><span>Time parked</span><b>{fDur(now - currentBooking.startedAt)}</b><span>Demo billable time</span><b>{fDur((now - currentBooking.startedAt) * 60)}</b><span>Estimated charge</span><b>{fMoney(chargeFor(now - currentBooking.startedAt, currentBooking.ratePerHour))}</b></div>
                <p className="muted">The sensor confirms arrival. Tap the same card and let the vehicle sensor detect the car at 2–4 cm to check in. Tap again to check out.</p>
              </> : <div className="booking-actions"><p className="muted">Reserved {fDate(currentBooking.bookedAt)} at {fTime(currentBooking.bookedAt)}. Tap RFID card <b>{currentBooking.rfidCard}</b>, then bring the car within 2–4 cm of the sensor. The system will mark it parked after both are confirmed.</p>{currentBooking.status === "reserved" && <button className="btn" onClick={() => cancelBooking(currentBooking)} disabled={busy === currentBooking.id}>Cancel reservation</button>}</div>}
            </div>
          ) : <>
            <div className="booking-inputs">
              <label>RFID card number<input value={rfidCard} onChange={(event) => setRfidCard(event.target.value)} placeholder="Example: A1B2C3D4" maxLength={16} autoComplete="off" /></label>
              <label>Booking duration (demo minutes)<input type="number" min="1" max="24" step="1" value={bookingMinutes} onChange={(event) => setBookingMinutes(Number(event.target.value))} /></label>
              <p className="muted">1 demo minute represents 1 parking hour. Parking starts only after the RFID card and 2–4 cm vehicle detection are confirmed.</p>
            </div>
            <div className="booking-slots">{availableSlots.map((slot) => <button className="book-slot" key={slot} onClick={() => bookSlot(slot)} disabled={Boolean(busy)}><span>{slot}</span><small>{busy === slot ? "Reserving…" : `Book ${bookingMinutes} hour${bookingMinutes === 1 ? "" : "s"}`}</small></button>)}{!availableSlots.length && <p className="muted">No spaces are currently available to book.</p>}</div>
          </>}
        </section>
        <section className="card">
          <div className="section-heading"><div><h3>My parking history</h3><p className="muted">Your check-in times, stay lengths, and charges.</p></div></div>
          <div className="scroll"><table><thead><tr><th>Space</th><th>Parked in</th><th>Parked out</th><th>Duration</th><th>Amount charged</th><th>Status</th></tr></thead>
            <tbody>{myBookings.filter((booking) => booking.status !== "cancelled").map((booking) => <tr key={booking.id}>
              <td><b>{booking.slot}</b><div className="muted"><code>{booking.rfidCard || "—"}</code></div></td><td>{booking.startedAt ? <><div>{fDate(booking.startedAt)}</div><div className="muted">{fTime(booking.startedAt)}</div></> : "Awaiting sensor"}</td>
              <td>{booking.finishedAt ? <><div>{fDate(booking.finishedAt)}</div><div className="muted">{fTime(booking.finishedAt)}</div></> : "—"}</td>
              <td>{booking.status === "active" ? fDur(now - booking.startedAt) : booking.durationMs ? fDur(booking.durationMs) : "—"}</td>
              <td><b>{booking.charged != null ? fMoney(booking.charged) : booking.status === "active" ? fMoney(chargeFor(now - booking.startedAt, booking.ratePerHour)) : "—"}</b></td>
              <td><span className={"pill " + (booking.status === "completed" ? "gray" : booking.status === "active" ? "green" : booking.status === "card_in_use" ? "red" : "amber")}>{booking.status === "active" ? "Parked now" : booking.status === "reserved" ? "Awaiting RFID + sensor" : booking.status === "card_in_use" ? "Card already booked" : "Completed"}</span></td>
            </tr>)}{!myBookings.some((booking) => booking.status !== "cancelled") && <tr><td colSpan="6" className="muted">Your parking history will appear here.</td></tr>}</tbody>
          </table></div>
        </section>
      </main>
    </div>
  );
}

/* ---------- dashboard ---------- */
function Dashboard({ user }) {
  const [parking, setParking] = useState({});
  const [allBookings, setAllBookings] = useState({});
  const [logs, setLogs] = useState(null);
  const [staff, setStaff] = useState({});
  const [tab, setTab] = useState("sessions");
  const [slot, setSlot] = useState("all");
  const [day, setDay] = useState("all");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [card, setCard] = useState("");
  const [sname, setSname] = useState("");
  const now = useNow();

  useEffect(() => {
    const u1 = onValue(ref(db, "parking"), (s) => setParking(s.val() || {}), (e) => setMsg(e.message));
    const u2 = onValue(query(ref(db, "logs"), orderByChild("t"), limitToLast(10000)),
      (s) => { const a = []; s.forEach((c) => { a.push({ id: c.key, ...c.val() }); }); setLogs(a); },
      (e) => { setMsg(e.message); setLogs([]); });
    const u3 = onValue(ref(db, "staff"), (s) => setStaff(s.val() || {}));
    const u4 = onValue(ref(db, "bookings"), (s) => setAllBookings(s.val() || {}), (e) => setMsg(e.message));
    return () => { u1(); u2(); u3(); u4(); };
  }, [user.uid]);

  const all = logs || [];
  const sessions = useMemo(() => buildSessions(all), [all]);
  const days = useMemo(() => [...new Set(all.map((e) => dayKey(e.t)))].sort().reverse(), [all]);
  const ok = (t, s) => (slot === "all" || s === slot) && (day === "all" || dayKey(t) === day);
  const fSessions = sessions.filter((s) => ok(s.inT, s.slot));
  const fLogs = [...all].reverse().filter((e) => ok(e.t, e.slot));

  const today = dayKey(now);
  const inToday = all.filter((e) => e.type === "IN" && dayKey(e.t) === today).length;
  const outToday = all.filter((e) => e.type === "OUT" && dayKey(e.t) === today).length;
  const done = sessions.filter((s) => s.outT);
  const avg = done.length ? done.reduce((a, s) => a + (s.outT - s.inT), 0) / done.length : 0;
  const free = PARKING_SLOTS.filter((k) => parking[k] === "Free").length;
  const allBookingRows = Object.entries(allBookings).flatMap(([uid, userBookings]) =>
    Object.entries(userBookings || {}).map(([id, booking]) => ({ id, uid, ...booking })))
    .sort((a, b) => (b.bookedAt || 0) - (a.bookedAt || 0));

  const load = async () => {
    setBusy(true); setMsg("");
    try { await seedDatabase(db); } catch (e) { setMsg(e.message); }
    setBusy(false);
  };
  const addStaff = async (e) => {
    e.preventDefault();
    const id = card.trim().toUpperCase().replace(/[^0-9A-F]/g, "");
    if (!id || !sname.trim()) return setMsg("Enter a hex card ID and a name.");
    try { await set(ref(db, "staff/" + id), sname.trim()); setCard(""); setSname(""); setMsg(""); } catch (x) { setMsg(x.message); }
  };

  const name = user.displayName || user.email;
  return (
    <div className="app">
      <header className="top">
        <div className="logo dark"><CarIcon size={24} /> SmartPark</div>
        <div className="who">
          <div className="avatar">{(name || "?")[0].toUpperCase()}</div>
          <span className="hide-sm">{name}</span>
          <span className="role-label admin-role">Administrator</span>
          <button className="btn ghost" onClick={() => signOut(auth)}>Sign out</button>
        </div>
      </header>

      <main className="wrap">
        <div className="title-row">
          <div>
            <h1>Operations overview</h1>
            <p className="muted">Live parking activity, customer bookings, and weekly performance.</p>
          </div>
          <button className="btn" onClick={load} disabled={busy}>{busy ? "Loading…" : "↻ Load data from 18 Oct 2026"}</button>
        </div>
        {msg && <div className="err">{msg}</div>}

        <section className="stats">
          <div className="stat"><span>Free slots</span><b>{free}<small> / {PARKING_SLOTS.length}</small></b></div>
          <div className="stat"><span>Cars in today</span><b>{inToday}</b></div>
          <div className="stat"><span>Cars out today</span><b>{outToday}</b></div>
          <div className="stat"><span>Average stay</span><b>{avg ? fDur(avg) : "—"}</b></div>
        </section>

        <section className="grid2">
          <div className="card">
            <h3>Live slots</h3>
            <div className="slots">
              {PARKING_SLOTS.map((k) => {
                const occ = parking[k] === "Occupied";
                const s = sessions.find((x) => x.slot === k && !x.outT);
                return (
                  <div key={k} className={"slot " + (parking[k] ? (occ ? "occ" : "free") : "")}>
                    <div className="slot-top"><span className="slot-id">{k}</span><span className={"pill " + (occ ? "red" : "green")}>{parking[k] || "…"}</span></div>
                    <div className="car"><CarIcon size={44} /></div>
                    {occ && s ? (
                      <div className="slot-info">
                        <div><b>{s.name || "Unknown driver"}</b></div>
                        <div className="muted">Parked since {fTime(s.inT)} · {fDur(now - s.inT)}</div>
                      </div>
                    ) : <div className="slot-info muted">Available</div>}
                  </div>
                );
              })}
            </div>
          </div>
          <div className="card">
            <h3>Weekly usage &amp; booking charges</h3>
            {all.length || allBookingRows.length ? <WeeklyTrend sessions={sessions} bookings={allBookingRows} now={now} /> : <p className="muted">Weekly trends will appear as parking activity is recorded.</p>}
          </div>
        </section>

        <section className="card">
          <div className="tabs-row">
            <div className="seg">
              {[["sessions", "Parking sessions"], ["activity", "Activity log"], ["bookings", "All bookings"], ["staff", "Staff"]].map(([k, l]) => (
                <button key={k} className={tab === k ? "on" : ""} onClick={() => setTab(k)}>{l}</button>
              ))}
            </div>
            {tab !== "staff" && tab !== "bookings" && (
              <div className="filters">
                <select value={slot} onChange={(e) => setSlot(e.target.value)}><option value="all">All slots</option>{PARKING_SLOTS.map((id) => <option key={id}>{id}</option>)}</select>
                <select value={day} onChange={(e) => setDay(e.target.value)}>
                  <option value="all">All dates</option>
                  {days.map((d) => <option key={d} value={d}>{dayLabel(d)}</option>)}
                </select>
              </div>
            )}
          </div>

          {logs === null && <p className="muted">Loading…</p>}
          {logs && !all.length && (tab === "sessions" || tab === "activity") && (
            <div className="empty">
              <p>No parking records yet.</p>
              <button className="btn primary" onClick={load} disabled={busy}>Load data from 18 Oct 2026</button>
            </div>
          )}

          {tab === "sessions" && fSessions.length > 0 && (
            <div className="scroll"><table>
              <thead><tr><th>Slot</th><th>Driver</th><th>Card ID</th><th>Parked in</th><th>Left</th><th>Duration</th><th>Status</th></tr></thead>
              <tbody>{fSessions.map((s, i) => (
                <tr key={i}>
                  <td><b>{s.slot}</b></td><td>{s.name || "—"}</td><td><code>{s.card || "—"}</code></td>
                  <td><div>{fDate(s.inT)}</div><div className="muted">{fTime(s.inT)}</div></td>
                  <td>{s.outT ? <><div>{fDate(s.outT)}</div><div className="muted">{fTime(s.outT)}</div></> : "—"}</td>
                  <td>{fDur((s.outT || now) - s.inT)}</td>
                  <td><span className={"pill " + (s.outT ? "gray" : "green")}>{s.outT ? "Completed" : "Parked now"}</span></td>
                </tr>))}</tbody>
            </table></div>
          )}

          {tab === "activity" && fLogs.length > 0 && (
            <div className="scroll"><table>
              <thead><tr><th>Timestamp</th><th>Event</th><th>Slot</th><th>Driver</th><th>Card ID</th></tr></thead>
              <tbody>{fLogs.slice(0, 200).map((e) => (
                <tr key={e.id}>
                  <td><b>{fTime(e.t)}</b> <span className="muted">· {fDate(e.t)}</span></td>
                  <td><span className={"pill " + (e.type === "IN" ? "blue" : "amber")}>{e.type === "IN" ? "↓ Car parked (IN)" : "↑ Car left (OUT)"}</span></td>
                  <td><b>{e.slot}</b></td><td>{e.name || "—"}</td><td><code>{e.card || "—"}</code></td>
                </tr>))}</tbody>
            </table></div>
          )}

          {tab === "bookings" && (
            <div className="scroll"><table>
              <thead><tr><th>Customer</th><th>Space</th><th>RFID card</th><th>Booked for</th><th>Booked</th><th>Parked in</th><th>Parked out</th><th>Duration</th><th>Charge</th><th>Status</th></tr></thead>
              <tbody>{allBookingRows.map((booking) => <tr key={`${booking.uid}-${booking.id}`}>
                <td><div>{booking.customerName || "Customer"}</div><div className="muted">{booking.customerEmail || booking.uid}</div></td>
                <td><b>{booking.slot}</b></td><td><code>{booking.rfidCard || "—"}</code></td><td>{booking.requestedHours ? `${booking.requestedHours} h` : "—"}</td><td>{fDate(booking.bookedAt)} · {fTime(booking.bookedAt)}</td>
                <td>{booking.startedAt ? <>{fDate(booking.startedAt)} · {fTime(booking.startedAt)}</> : "—"}</td>
                <td>{booking.finishedAt ? <>{fDate(booking.finishedAt)} · {fTime(booking.finishedAt)}</> : "—"}</td>
                <td>{booking.durationMs ? fDur(booking.durationMs) : booking.status === "active" ? fDur(now - booking.startedAt) : "—"}</td>
                <td><b>{booking.charged != null ? fMoney(booking.charged) : booking.status === "active" ? fMoney(chargeFor(now - booking.startedAt, booking.ratePerHour)) : "—"}</b></td>
                <td><span className={"pill " + (booking.status === "completed" ? "gray" : booking.status === "active" ? "green" : "amber")}>{booking.status}</span></td>
              </tr>)}{!allBookingRows.length && <tr><td colSpan="10" className="muted">No customer bookings yet.</td></tr>}</tbody>
            </table></div>
          )}

          {tab === "staff" && (
            <>
              <form className="row" onSubmit={addStaff}>
                <input value={card} onChange={(e) => setCard(e.target.value)} placeholder="RFID card ID (e.g. A1B2C3D4)" />
                <input value={sname} onChange={(e) => setSname(e.target.value)} placeholder="Staff name" />
                <button className="btn primary">Add staff</button>
              </form>
              <div className="scroll"><table>
                <thead><tr><th>Card ID</th><th>Name</th><th></th></tr></thead>
                <tbody>
                  {Object.keys(staff).sort().map((id) => (
                    <tr key={id}><td><code>{id}</code></td><td>{staff[id]}</td>
                      <td style={{ textAlign: "right" }}><button className="btn ghost sm" onClick={() => remove(ref(db, "staff/" + id))}>Remove</button></td></tr>
                  ))}
                  {!Object.keys(staff).length && <tr><td colSpan="3" className="muted">No staff registered.</td></tr>}
                </tbody>
              </table></div>
            </>
          )}
        </section>
      </main>
    </div>
  );

}

/* ---------- root ---------- */
export default function App() {
  const [user, setUser] = useState(undefined);
  const [isAdmin, setIsAdmin] = useState(false);
  const [roleLoaded, setRoleLoaded] = useState(false);
  useEffect(() => {
    let requestId = 0;
    const unsubscribe = onIdTokenChanged(auth, async (currentUser) => {
      const currentRequest = ++requestId;
      setUser(currentUser);
      setIsAdmin(false);
      setRoleLoaded(!currentUser);
      if (!currentUser) return;
      try {
        const token = await getIdTokenResult(currentUser);
        const isBasani = token.claims.email_verified === true
          && String(token.claims.email || "").toLowerCase() === ADMIN_EMAIL;
        if (currentRequest === requestId) setIsAdmin(isBasani);
      } catch {
        if (currentRequest === requestId) setIsAdmin(false);
      } finally {
        if (currentRequest === requestId) setRoleLoaded(true);
      }
    });
    return unsubscribe;
  }, []);
  if (user === undefined || !roleLoaded) return <div className="splash"><CarIcon size={40} /></div>;
  if (!user) return <AuthScreen />;
  return isAdmin ? <Dashboard user={user} /> : <CustomerDashboard user={user} />;
}
