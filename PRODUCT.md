# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Students who feel overwhelmed by schoolwork and need help starting or returning to one manageable step.

## Product Purpose

Daylight is a supportive study space for planning schoolwork, focusing for a chosen amount of time, finding trustworthy resources, and returning to unfinished work. Success means making schoolwork feel more approachable by helping a student begin or resume one small step.

## Positioning

Daylight is a calm, local-first study space that turns schoolwork into small steps without streak pressure or clinical claims.

## Operating Context

Students use Daylight in a browser while organizing assignments, choosing a next step, completing focused work, taking breaks, reviewing progress, and returning to tasks later. The app can run directly from the static app shell or through the local Node server at `127.0.0.1:4173`.

## Capabilities and Constraints

- Create, edit, reschedule, filter, sort, and complete school tasks and their smaller steps.
- Start optional focus sessions with configurable durations and break reminders.
- Remember the current unfinished step for each task, with an optional note to make returning easier.
- Browse, filter, search, and save curated educational resources.
- Review lightweight progress without streak pressure.
- Use a scripted local study coach to name common barriers and offer an editable next action, with an optional live AI coach enabled only after explicit session consent.
- Tasks, preferences, and saved resources remain in browser local storage.
- Coach chat is session-only. Live coach requests send only the current message and a small set of typed coaching preferences; the app does not send assignment lists or previous chat history.
- The app has no sign-in, database, account sync, or production deployment configuration.
- The coach is not treatment or professional care. The product must not make diagnosis, medical, or individualized care claims.

## Brand Commitments

- Product name: Daylight.
- Voice is supportive, practical, nonjudgmental, and focused on making the next step feel doable.
- Preserve the language of small steps, returning when ready, and progress without shame or streaks.

## Evidence on Hand

- Product shell and workflows: [index.html](./index.html).
- Client-side state, task flows, settings, focus timer, resources, and coach UI: [app.js](./app.js).
- Existing visual implementation: [styles.css](./styles.css).
- Product and local-run details: [README.md](./README.md).
- Optional server-side coach behavior and privacy boundaries: [server.js](./server.js) and [coach-service.js](./coach-service.js).
- Curated resource data: [resources.js](./resources.js).
- There are no production testimonials, customer studies, or validated student research results in this repository; future work must not fabricate them.

## Product Principles

1. Make the next action smaller and more approachable.
2. Support returning to work without shame or pressure.
3. Keep student data local by default and make external AI use explicit.
4. Offer practical support without presenting the product as treatment or professional care.
5. Keep progress encouraging without streaks, guilt, or inflated claims.

## Accessibility & Inclusion

- Preserve keyboard-focus visibility and semantic labels for controls.
- Keep reduced-motion and soft-contrast preferences available in Settings.
- Ensure light and dark themes maintain readable text contrast across content, controls, dialogs, and navigation.
- Use supportive, nonjudgmental language and avoid assumptions about diagnosis, ability, or academic performance.
