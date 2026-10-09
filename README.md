# Routine

Personal iPhone web app: daily goals, coins, streaks, penalties.

- Rules and scoring: `js/engine.js` (tested in `tests/engine.test.js`)
- Run tests: `node --test`
- Run locally: `node tools/serve.mjs` → http://localhost:8123 (add `?debug` for the time-travel clock in Settings)
- Regenerate icons: `node tools/make-icons.mjs`
- Reminders setup: `docs/shortcuts-reminders.md`

Data is stored only on the device (localStorage). Use Settings → Export backup.
When changing any cached file, bump `CACHE` in `sw.js`.
