# Daylight

Daylight is a browser prototype for student planning, focus sessions, resources, and an optional study coach. Tasks and preferences remain in browser local storage. The included Node server adds a stateless coach API and serves the static app; it does not add accounts or a database.

## Run locally

Requires Node.js 18 or newer. From this folder:

```powershell
npm start
```

Open <http://127.0.0.1:4173>. The app stays in local scripted-preview mode unless live AI is configured. You can also open `index.html` directly, but the live backend requires the server URL.

## Optional live coach

1. Copy `.env.example` to `.env`.
2. Set `OPENAI_API_KEY` to a server-side API key. Keep `.env` private; it is ignored by Git.
3. Keep `OPENAI_MODEL=gpt-4.1-mini`, or set a model available to your API project that supports Structured Outputs.
4. Change `AI_ENABLED=true`, then run `npm start` again.
5. In the Coach screen, choose **Enable live AI** and consent for the current browser session.

The server sends only the current coach message plus a few short, typed coaching preferences. It does not send assignment lists, task titles, due dates, previous chat messages, or the app's local task store. Daylight itself does not retain chat requests or responses on the server. The live provider processes the request; review the provider's current data controls and terms before using this with students. Avoid personal or identifying details. The coach is not treatment or professional care.

## Firebase account sync

The optional account flow uses Firebase Authentication with email/password and stores the signed-in user's Daylight state in Firestore at `users/{uid}/app/state`. Signed-out users keep the existing local browser behavior. Deploy [firestore.rules](./firestore.rules) to the Firebase project before enabling sync:

```powershell
firebase deploy --only firestore:rules
```

The Firebase web configuration is intentionally client-visible; Firebase Authentication and Firestore rules enforce access. Never place an admin SDK credential or service-account key in the browser.

The endpoint applies a 12 KB request body cap, 500 character message limit, 20-request / 10-minute in-memory IP limit, a 15-second upstream timeout, a constrained JSON response schema, and generic upstream errors. It does not log message content. The local server binds to `127.0.0.1`; it is not a production deployment configuration.

## Checks

```powershell
npm test
```

This prototype has no sign-in, database, account sync, server deployment, production abuse controls, or student research validation. Before serving real students, add an appropriate deployment setup (HTTPS, authentication or abuse protection, origin and CSRF controls, monitored rate and spend limits), review privacy and age-related requirements, and test with students and accessibility users.
