# sitecorebannerstore

A small Node/Express web app for visualizing banner data exported from our
Sitecore CMS. You upload a Sitecore package ZIP, the server unpacks it and
extracts every banner item into a single JSON file, and the frontend lets you
filter, preview (web + app), and AI-remix the banners.

## How it works

1. **Upload** — Drag a `.zip` (a Sitecore package, which itself contains an
   inner `package.zip`) onto the home page. The server stores it and starts
   processing in the background.
2. **Extract** — `src/services/extractor.js` walks the unpacked
   `items/master/sitecore/content` tree, parses each banner's XML, resolves
   media/alt text from the media library, and writes `data/<id>.json`.
3. **View** — `/view.html?id=<id>` loads that JSON and renders three modes:
   - **Data** — filterable cards (search, language, base/sub folder).
   - **Emulator** — desktop/mobile/in-app banner previews (Essent or
     energiedirect brand styling), with per-banner PNG export.
   - **Creator** — pick a reference banner and generate copy/image variants
     via the Gemini API (key is entered in the UI, stored in `localStorage`).

## Run locally

```bash
npm install
cp .env.example .env   # then edit .env: set APP_PASSPHRASE and a random SESSION_SECRET
npm start              # serves on http://localhost:3000 (override with PORT)
```

The whole app sits behind a single shared passphrase (`APP_PASSPHRASE`). The
server refuses to start if it isn't set, and any unauthenticated request is sent
to `/login`.

## Docker

```bash
docker build -t sitecorebannerstore .
docker run -p 3000:3000 --env-file .env sitecorebannerstore
```

`.env` is excluded from the image (`.dockerignore`) so the passphrase isn't baked
in — pass it at runtime with `--env-file`.

## Project layout

| Path                          | Purpose                                              |
| ----------------------------- | ---------------------------------------------------- |
| `server.js`                   | Express API: upload, list, delete, serve banner JSON |
| `src/services/extractor.js`   | Sitecore XML to banner JSON extraction               |
| `re-extract.js`               | Re-run extraction over all already-unpacked archives |
| `public/index.html`, `app.js` | Upload page + archive list                           |
| `public/view.html`, `view.js` | Filter / emulator / creator UI                       |
| `public/howto-export.html`, `public/img/` | Step-by-step guide (with screenshots) for exporting the Banners tree as a Sitecore package |
| `public/css/brand-essent.css` | Essent hero-banner styles for the emulator, transcribed from a capture of mijn.essent.nl (`example-preview-banner/mijn-essent-desktop-mobile-web.html`) |
| `public/fonts/`               | Baton + Lato webfonts extracted from that capture     |

## Data directories (gitignored, created at runtime)

- `uploads/` — raw uploaded ZIPs (`<id>.zip`)
- `unpacked/` — extracted archive contents (`<id>/`)
- `data/` — `archives.json` index + one `<id>.json` per archive

## Notes

- Image previews are fetched through an external Cloudflare Worker proxy and
  the `essent.nl` media host; both are configurable in the view UI.
- Access is gated by a single shared passphrase (`APP_PASSPHRASE` in `.env`);
  there are no per-user accounts, so still run it on a trusted network. The auth
  cookie is a stateless signed token — logging out clears it on that device but
  does not invalidate sessions elsewhere; rotating `SESSION_SECRET` invalidates
  all of them.