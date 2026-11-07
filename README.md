# Daylight

Daylight is a browser prototype for student planning, focus sessions, resources, and an optional study coach with assignment PDF breakdown. Guest tasks and preferences stay in browser storage. Optional Firebase accounts sync a separate workspace across devices. The Node server serves the static app and provides stateless AI endpoints. GitHub Pages can host the frontend while Vercel hosts the API.

## Run locally

Requires Node.js 18 or newer. From this folder:

```powershell
npm start
```

Open <http://127.0.0.1:4173>. The app stays in local scripted-preview mode unless live AI is configured. You can also open `index.html` directly, but the live backend requires the server URL.

## Optional live AI coach and assignment breakdown

1. Copy `.env.example` to `.env`.
2. Create a free API key at <https://openrouter.ai/keys> and set `OPENROUTER_API_KEY` to it. Keep `.env` private; it is ignored by Git.
3. Keep `OPENROUTER_MODEL=openrouter/free`, which routes each request across OpenRouter's available free models at no cost, or set another free model from <https://openrouter.ai/collections/free-models> that supports structured outputs.
4. Change `AI_ENABLED=true`, then run `npm start` again.
5. In the Coach screen, choose **Enable live AI** and consent for the current browser session.

OpenRouter's free models have per-minute and daily request limits and can be slower or temporarily busy. If a key is rate-limited, the coach reports that live AI is temporarily unavailable; the local scripted preview keeps working. OpenRouter may require enabling free-model prompt training in its privacy settings before free models are available, so free models may log or train on messages. Use this configuration only with non-identifying content.

In the Coach screen, students can choose a PDF up to 3 MB and review a separate consent notice before it is sent. Daylight sends the PDF contents under a generic filename to OpenRouter for parsing and routing to the configured model. The student can edit the suggested task and steps before saving. Daylight keeps the upload in memory. The `cloudflare-ai` PDF parser may have trouble reading scanned or image-only assignments. Free model providers may log or train on submitted content, so avoid personal or identifying details.

## Host the frontend on GitHub Pages with the API elsewhere

GitHub Pages serves static files only, so the coach API needs a separate host. This repository includes a Vercel Functions adapter in `api/`; Vercel's Hobby plan is free for personal, non-commercial projects and does not require a card. Only the API is needed from Vercel; GitHub Pages remains the public frontend.

1. Import this repository at <https://vercel.com/new> (framework preset: **Other**). In **Settings → Environment Variables**, add:
   - `AI_ENABLED=true`
   - `OPENROUTER_API_KEY` with your free key
   - `OPENROUTER_MODEL=openrouter/free` (optional)
   - `ALLOWED_ORIGINS=https://verityhoangjacob67.github.io,https://daylightt.me` (use your actual Pages/custom-domain origins)
2. Deploy, then check `https://<your-project>.vercel.app/api/health`. It should return `{"mode":"live"}`.
3. Edit [api-config.js](./api-config.js) and set `window.DAYLIGHT_API_BASE` to `https://<your-project>.vercel.app/api`. Commit and push. Loopback hosts such as `127.0.0.1` use the same-origin API.
4. In GitHub, open **Settings → Pages → Build and deployment** and choose **GitHub Actions** as the source. The workflow in `.github/workflows/pages.yml` publishes only the static HTML, CSS, client JavaScript, public assets, and `CNAME`; it does not publish `server.js`, tests, or `.env`.
5. Open the Pages URL, choose **Enable live AI** in the Coach screen, and confirm requests go to the Vercel API. If the browser reports a CORS error, add the exact Pages origin to `ALLOWED_ORIGINS` in Vercel and redeploy.

### Keep frontend-only pushes from triggering Vercel

Private repositories have a Vercel limitation: Vercel only builds a Git push when the commit author has access to the Vercel project. A GitHub collaborator who is not a Vercel team member gets `Git author must have access to the project on Vercel` before an ignored-build step can run. Since GitHub Pages serves the frontend, this project does not need Vercel's Git integration at all.

The [deploy-api.yml](./.github/workflows/deploy-api.yml) workflow triggers a Vercel **Deploy Hook** instead. It runs on `main` only when `api/`, `server.js`, `package.json`, `package-lock.json`, `vercel.json`, or `.vercelignore` changes, and it can also be run manually. Deploy hooks do not perform Vercel's private-repo Git-author check, so any collaborator who can push to `main` can deploy an API change without a Vercel account.

Setup:

1. In Vercel, open **Project Settings → Git → Deploy Hooks**, create a hook named `api` for the `main` branch, and copy its URL.
2. In GitHub, open **Settings → Secrets and variables → Actions** and add the URL as `VERCEL_DEPLOY_HOOK_URL`.

`vercel.json` sets `git.deploymentEnabled: false` to turn off automatic Git deployments. Pushes covered by that configuration do not create a Vercel deployment; only explicit triggers such as the API workflow's deploy-hook request or a manual deploy do. Frontend-only pushes therefore run only the GitHub Pages workflow.

The workflow confirms that Vercel accepted the hook request; check the Vercel dashboard for the build result. Run the **Deploy API to Vercel** workflow manually after changing environment variables so the new values are picked up. Treat the deploy-hook URL like a password; anyone with it can trigger a deployment.

The API allows browser requests only from `ALLOWED_ORIGINS`. Defaults include this repository's GitHub Pages origin, `daylightt.me`, `www.daylightt.me`, and local development on ports 4173 and 3002. CORS is not authentication; keep the OpenRouter key private and use OpenRouter's usage limits. Vercel serverless instances do not share the Node server's in-memory rate limiter, so the provider's free-model quota is the backstop there.

If you use Firebase accounts, add the GitHub Pages or custom domain to **Firebase Authentication → Settings → Authorized domains** so sign-in works from the new origin.

The server sends only the current coach message plus a few short, typed coaching preferences. It does not send assignment lists, task titles, due dates, previous chat messages, or the app's local task store. Daylight itself does not retain chat requests or responses on the server. OpenRouter and the free model provider process the request; review their current data controls, privacy settings, and terms before using this with students, since free models may log or train on requests. Avoid personal or identifying details. The coach is not treatment or professional care.

## Firebase account sync

The optional account flow uses Firebase Authentication with email/password and stores each account's Daylight workspace in Firestore at `users/{uid}/app/state`. Guest work stays in its own browser workspace. New accounts start with a separate workspace. When changes on this browser and another device conflict, Settings lets the signed-in user choose which copy to keep. Deploy [firestore.rules](./firestore.rules) to the Firebase project before enabling sync.

```powershell
firebase deploy --only firestore:rules
```

The Firebase web configuration is intentionally client-visible; Firebase Authentication and Firestore rules enforce access. Never place an admin SDK credential or service-account key in the browser.

The coach endpoint applies a 12 KB request body cap and a 500-character message limit. The PDF endpoint caps encoded bodies at 4.5 MB and accepts PDFs up to 3 MB. Both use up to two 20-second upstream attempts, constrained JSON response schemas, CORS origin checks, and generic upstream errors. Server diagnostics record status and attempt number. The local server defaults to `127.0.0.1` and shares a 20-request per IP limit across both endpoints in each 10-minute window.

## Checks

```powershell
npm test
```

This prototype has no production abuse controls or student research validation. Before serving real students, review the deployment setup (HTTPS, authentication or abuse protection, origin and CSRF controls, monitored rate and spend limits), privacy and age-related requirements, and test with students and accessibility users.
