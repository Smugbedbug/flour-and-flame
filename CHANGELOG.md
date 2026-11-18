# Changelog

## 0.3.1 — 2026-11-18
- Works from a sub-folder address (GitHub Pages) as well as localhost; service worker, manifest and icons use relative paths.
- Added GitHub Actions workflow: test → build → publish to GitHub Pages on every push to main.

## 0.3.0 — 2026-11-18
- Fixed: production build failed in v0.2 (TypeScript errors). Added package-lock.json for reproducible installs.
- New minimal copper phoenix: app icons (incl. Android maskable), favicon, header logo, full wordmark.
- Dashboard home with Baking / Business modes, backup reminder, continue-baking, recent and favorites.
- Responsive ingredient tiles (4/3/2/1 columns by available width) with groups, tap/keyboard checking.
- Butter shown as g ≈ tbsp ≈ sticks; quarter-spoon fractions; egg weighing guidance.
- Dedicated baking mode: scaling presets/custom/target count, pan calculator, step-by-step, timers from method text and manual timers (survive reload), keep-awake, brown-butter weight record. Progress saved locally.
- Recipe editor: groups, optional flag, reorder, tags, tips, pan, oven, notes; new recipes.
- Import: paste box instead of pop-up, preview, suggested matches, copy-vs-new-version choice, single all-or-nothing transaction.
- Full backup & restore with validation, comparison table, confirmation, persistent-storage request.
- Hash routing so the Android back button works. Offline status in header.
- Tests: 7 → 32 (logic, IndexedDB, backup restore into empty install, tile component), plus browser checks.

## 0.2.0
Initial foundation (library, import, revisions, scaling, optional prices).
