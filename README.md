# Smart Parking Dashboard (React + Firebase)
1. npm install
2. npm run dev
3. Open the URL, sign up, then click "Load data from 18 Oct 2026" to seed three parking slots and demo staff Basani Baloyi and Differ Ngobeni.

## Firebase setup

In the Firebase Console for the project configured in `src/firebase.js`, open
**Authentication**, select **Get started**, then enable **Email/Password** under
**Sign-in method**. The app's sign-in and sign-up forms require this provider.

## Booking and billing

Signed-in users can reserve an available slot, check in when they arrive, and
check out when they leave. The app records the stay duration and estimates the
charge at **R25 per started hour** (one-hour minimum). Change `PARKING_RATE` in
`src/App.jsx` to use a different rate. This dashboard calculates the charge; it
does not process card payments.

The Realtime Database must allow signed-in users to read `bookingLocks`, manage
their own `bookings/{uid}` records, and transactionally create or release a
booking lock. Merge equivalent access into your existing database rules rather
than making the database publicly writable.

## GitHub Pages

The workflow in `.github/workflows/deploy.yml` builds and deploys on pushes to
`main` or `master`. In the repository's **Settings → Pages**, choose **GitHub
Actions** as the build and deployment source. The Vite base path is configured
for the `Smart-Parking` repository name.
