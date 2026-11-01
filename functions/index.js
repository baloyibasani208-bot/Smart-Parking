const { initializeApp } = require("firebase-admin/app");
const { getDatabase } = require("firebase-admin/database");
const { onValueCreated, onValueWritten } = require("firebase-functions/v2/database");

initializeApp({ databaseURL: "https://smart-parking-d99b9-default-rtdb.firebaseio.com" });
const database = getDatabase();
const PARKING_RATE = 25;
const BILLING_MINUTE_MS = 60 * 1000;

function normalizeCard(value) {
  return String(value || "").toUpperCase().replace(/[^0-9A-F]/g, "");
}

function isCard(value) {
  return /^[0-9A-F]{4,16}$/.test(value);
}

function ownsMapping(mapping, uid, bookingId) {
  return mapping?.uid === uid && mapping?.bookingId === bookingId;
}

async function releaseSlot(slot, uid, bookingId) {
  if (!slot) return;
  await database.ref(`bookingLocks/${slot}`).transaction((current) =>
    ownsMapping(current, uid, bookingId) ? null : undefined);
}

async function releaseCard(card, uid, bookingId) {
  if (!isCard(card)) return;
  await database.ref(`bookingByCard/${card}`).transaction((current) =>
    ownsMapping(current, uid, bookingId) ? null : undefined);
}

exports.indexCustomerBooking = onValueWritten("/bookings/{uid}/{bookingId}", async (event) => {
  const before = event.data.before.val();
  const after = event.data.after.val();
  const { uid, bookingId } = event.params;
  const beforeCard = normalizeCard(before?.rfidCard);
  const afterCard = normalizeCard(after?.rfidCard);

  if (beforeCard && (beforeCard !== afterCard || !["reserved", "active"].includes(after?.status))) {
    await releaseCard(beforeCard, uid, bookingId);
  }
  if (!after || !["reserved", "active"].includes(after.status) || !isCard(afterCard)) return;

  const mapping = { uid, bookingId, slot: after.slot };
  const result = await database.ref(`bookingByCard/${afterCard}`).transaction((current) => {
    if (!current || ownsMapping(current, uid, bookingId)) return mapping;
    return undefined;
  });

  if (!result.committed && after.status === "reserved") {
    await event.data.after.ref.update({ status: "card_in_use" });
    await releaseSlot(after.slot, uid, bookingId);
  } else if (result.committed && !after.cardLinkedAt) {
    await event.data.after.ref.update({ cardLinkedAt: Date.now() });
  }
});

exports.confirmVehicleAndCloseStay = onValueCreated("/logs/{logId}", async (event) => {
  const sensorEvent = event.data.val();
  if (!sensorEvent || !["IN", "OUT"].includes(String(sensorEvent.type).toUpperCase())) return;

  const card = normalizeCard(sensorEvent.card || sensorEvent.rfidCard);
  const slot = String(sensorEvent.slot || "");
  if (!isCard(card) || !slot) return;

  const mappingSnapshot = await database.ref(`bookingByCard/${card}`).get();
  const mapping = mappingSnapshot.val();
  if (!mapping || mapping.slot !== slot) return;

  const bookingRef = database.ref(`bookings/${mapping.uid}/${mapping.bookingId}`);
  if (String(sensorEvent.type).toUpperCase() === "IN") {
    const distanceCm = Number(sensorEvent.sensorDistanceCm ?? sensorEvent.distanceCm);
    if (!Number.isFinite(distanceCm) || distanceCm < 2 || distanceCm > 4) return;
    const startedAt = Number(sensorEvent.t) || Date.now();
    const result = await bookingRef.transaction((current) => {
      if (current?.status !== "reserved" || current.slot !== slot || normalizeCard(current.rfidCard) !== card) return undefined;
      return { ...current, status: "active", startedAt, sensorDistanceCm: distanceCm };
    });
    if (result.committed) await database.ref(`parking/${slot}`).set("Occupied");
    return;
  }

  const finishedAt = Number(sensorEvent.t) || Date.now();
  let completedBooking;
  const result = await bookingRef.transaction((current) => {
    if (current?.status !== "active" || current.slot !== slot || normalizeCard(current.rfidCard) !== card) return undefined;
    const durationMs = Math.max(0, finishedAt - current.startedAt);
    const ratePerHour = Number(current.ratePerHour) || PARKING_RATE;
    completedBooking = {
      ...current,
      status: "completed",
      finishedAt,
      durationMs,
      charged: Math.max(1, Math.ceil(durationMs / BILLING_MINUTE_MS)) * ratePerHour,
    };
    return completedBooking;
  });

  if (result.committed && completedBooking) {
    await Promise.all([
      releaseCard(card, mapping.uid, mapping.bookingId),
      releaseSlot(slot, mapping.uid, mapping.bookingId),
      database.ref(`parking/${slot}`).set("Free"),
    ]);
  }
});
