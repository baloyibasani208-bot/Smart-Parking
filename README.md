# Smart Parking Dashboard (React + Firebase)
1. npm install
2. npm run dev
3. Open the URL, sign up, then click "Load data from 18 Oct 2026" to seed three parking slots and demo staff Basani Baloyi and Differ Ngobeni.

## Firebase setup

In the Firebase Console for the project configured in `src/firebase.js`, open
**Authentication**, select **Get started**, then enable **Email/Password** under
**Sign-in method**. The app's sign-in and sign-up forms require this provider.

## Booking and billing

Customers enter their RFID card number and a booking duration. In this demo,
**one real minute represents one parking hour**. The car is not marked parked
when a booking is created: the ESP32 must read the same card and detect the
vehicle at 2–4 cm, then send a matching entry event. The Cloud Function starts
the stay timer only after that confirmation. A matching exit event stops the
timer and calculates the charge at **R25 per started demo hour**. Change
`PARKING_RATE` in `src/App.jsx` and `functions/index.js` together. This calculates
a charge but does not process a payment.

The repository includes a Realtime Database rules template in
`database.rules.json`, Firebase Functions in `functions/`, and a `firebase.json`
deployment target. Install the Function dependencies and deploy with
`npm --prefix functions install` followed by `firebase deploy --only functions,database`.
Firebase Functions deployment may require the Blaze billing plan. Review the
rules before deployment: customers can read their own bookings, admins can
read operational records, and sensor writes require the `sensor: true` custom
claim. Never put a Firebase Admin service-account key in ESP32 firmware.

## ESP32 event contract

The snippet supplied in chat is the Firebase **web SDK config** already used by
`src/firebase.js`; it does not read an RFID reader or distance sensor. The
firmware must authenticate with a restricted Firebase Auth identity carrying
the `sensor: true` custom claim, then write sensor events to the Realtime
Database `logs` node. Mint credentials only in a trusted server; do not embed a
service-account key in the device.

After the ESP32 has both a valid RFID tap and a vehicle distance from 2 through
4 cm (inclusive), write one `IN` event like this:

```json
{
	"type": "IN",
	"card": "A1B2C3D4",
	"slot": "P1",
	"t": 1793540000000,
	"sensorDistanceCm": 3.2
}
```

The card and slot must match a live booking. The Cloud Function then changes
the booking to `active` and the customer sees “Parked now”. On departure, the
device should write a matching `OUT` event with `type`, `card`, `slot`, and `t`;
the Function records the actual stay, charge, releases the slot, and updates
the customer's history. Events without a matching card, slot, active booking,
or 2–4 cm entry distance do not start a booked stay.

## Customer and administrator access

The app reads the Firebase Authentication custom claim `admin: true` to choose
the administrator view. Users without that claim receive the customer view and
subscribe only to their own `bookings/{uid}` data. Admins get parking logs,
staff, every booking, and an eight-week usage chart with visits, average stay,
and completed booking charges.

Grant the claim only from a trusted server or Firebase Admin SDK environment,
never from the browser. For example, in a trusted Node.js process after
initializing the Firebase Admin SDK:

```js
await getAuth().setCustomUserClaims("FIREBASE_AUTH_UID", { admin: true });
```

Then have that administrator sign out and back in to refresh the ID token. The
database rules independently enforce the same boundary. The UI role check is
not a substitute for Firebase rules.

## GitHub Pages

The workflow in `.github/workflows/deploy.yml` builds and deploys on pushes to
`main` or `master`. In the repository's **Settings → Pages**, choose **GitHub
Actions** as the build and deployment source. The Vite base path is configured
for the `Smart-Parking` repository name.
