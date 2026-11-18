# Flour and Flame Bakery — v0.4.1

Your baking workspace first, a simple bakery tool second. React + TypeScript + Vite, storing data on your device (IndexedDB), working offline after the first visit.

See **docs/FEATURE-STATUS.md** for exactly what is built, partial, or planned.

---

## Use it on your Windows PC (easiest: no programming)

1. Install **Node.js LTS** from https://nodejs.org (accept the defaults). You only do this once.
2. Unzip this folder somewhere permanent, e.g. `Documents\flour-and-flame`.
3. Double-click **`START-FLOUR-AND-FLAME.bat`**.
   A black window opens and your browser opens **http://localhost:4173**. Keep the black window open while using the app.
4. Optional: in Chrome or Edge, click the **Install** icon in the address bar to get a desktop app with the phoenix icon.

The ZIP already contains the built app (`dist` folder), so you don't need `npm install` to use it.

> Your data lives in the browser profile on this PC at that address. Use **Backup** in the app regularly
> and keep the files in OneDrive/Google Drive. Use the same port (4173) each time, because a different port is a different storage area.

## Use it on your Samsung phone

A phone needs the app served over **HTTPS** to install it and use it offline. Options (no paid services):

- **Free static hosting** (recommended next step, needs your approval): GitHub Pages, Cloudflare Pages or Netlify can host the `dist` folder for free.
  Your recipes still stay on your phone; hosting only delivers the app's code.
- Until then, move data between devices with **Backup → Download full backup** on one device and **Restore** on the other.
  (Restore replaces everything on the receiving device.)

## Publishing with GitHub Pages (free)

This project includes `.github/workflows/deploy-pages.yml`. Every time code reaches the `main` branch, GitHub tests it, builds it, and publishes it to
`https://<your-username>.github.io/<repository-name>/`.

One-time setup: repository **Settings → Pages → Build and deployment → Source: GitHub Actions**.
Free GitHub Pages requires a **public** repository: anyone can read the code. For that reason the public code contains **no personal recipes** (`src/seeds.ts` is empty; tests use made-up recipes). Import your recipes from your private JSON file via **Recipes → Import**.
Recipes, edits, prices and backups you create in the app are **not** uploaded; they stay on each device.

## For development

```
npm install        # once, installs exact versions from package-lock.json
npm run dev        # live-reloading dev server
npm test           # 65 automated tests (costing, database & migrations, backup/restore, UI pieces)
npm run build      # type-check + production build into dist/
npm start          # serve dist/ at http://localhost:4173
```

## Project layout

```
src/
  types.ts          data model + validation (recipe schema v1)
  costing.ts        ingredient costing, name/alias matching, substitutions, pieces per pan
  photos.ts         photo compression
  logic.ts          scaling, unit conversion, timers-from-text, pan maths
  units.ts          display formatting, butter/egg rules
  db.ts             IndexedDB (database v4: recipes, revisions, catalog, sessions, photos, production, meta, outbox)
  backup.ts         full backup / validation / restore
  app-context.tsx   shared state + hash routing (Android back button works)
  components/       Logo (phoenix), IngredientTiles
  views/            Home, Library, RecipeView, RecipeEditor, BakingMode, ImportView, Catalog, BackupView
tests/              Vitest tests
docs/               import schema, measurement rules, feature status
public/             icons, manifest, service worker
```

## Updating & your data (v0.4)

- **Your data is kept.** Opening v0.4 upgrades the on-device database from version 3 to 4. It only *adds* two storage areas (photos, production history); recipes, versions, prices, sessions and settings are untouched.
- **One automatic recipe change:** any recipe with "blondie(s)" in its title or tags that isn't already in Brownies is moved to **Brownies** once, saved as a normal new version (old version kept in History; ingredients/method unchanged).
- **Installed phone app:** it updates the next time you open it online (you may need to close and reopen it once).
- **Before updating, make a backup** (Backup → Download full backup), as always before a big change.
- **Backups:** v0.4 backups are format 2 and include photos and production history, so they're larger if you have many photos.
  v0.4 restores both old (format 1) and new backups. An older app version can't restore a format-2 backup.

## Data safety notes

- Upgrading from v0.2 keeps your data (same database, version 2 → 3 adds a baking-session store).
- Master recipes change only through **Edit master → Save new version**. Every version is kept.
- Scaling, checked ingredients, timers and brown-butter weights belong to a *baking session* and never touch the recipe.
- Backup files are plain JSON (`flour-and-flame-backup-YYYY-MM-DD-HHMM.json`, format version 1).
