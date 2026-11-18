# Feature status — v0.4.0

✅ Implemented and tested · 🟡 Partial / not tested on a real phone · 📋 Planned (not built)

"Unit" = automated test (Vitest). "Browser" = scripted run in Chrome at 1280 px, 412 px phone and 300 px split-screen widths.

## v0.4 requests
| # | Feature | Status | Verified by |
|---|---|---|---|
| 1 | Vanilla extract ↔ bean paste swap on recipe page and in baking mode; tile shows chosen product; cost uses its price; master unchanged; product ratio override | ✅ | unit + browser |
| 2 | Costing fixed (teaspoon weight, butter sticks/tbsp, eggs by count/dozen, pinch, aliases, merge duplicates); dashboard complete/incomplete + what's missing | ✅ | unit (17 costing tests) + browser |
| 3 | Pan recipes: pans × pieces per pan, session-only piece count, explicit master update (new revision); crispy treats too | ✅ | unit + browser |
| 4 | Editor: ¼-step quantity picker, custom amount, unit dropdown with same-kind conversion, butter sticks/tbsp helper, egg counts, validation; saves only on Save | ✅ | unit + browser |
| 5 | Photos: take/choose, compress (≈200 KB), main photo on recipe + library, remove/replace, multiple, stored locally, in backups | ✅ / 🟡 | unit + browser (file chooser). **Camera button not tested on your Samsung.** Cloud photo sync 📋 |
| 6 | Recipe cost card: ingredient cost, per batch, per item, packaging per item, direct cost per item; incomplete list | ✅ | browser |
| 7 | Finish-baking dialog → production history (date, revision, multiplier, actual qty, pieces/portion, storage, notes, cost snapshot) | ✅ | unit + browser |
| 8 | Subtle smoldering phoenix (dashboard only), reduced-motion + setting fallback | ✅ | unit + browser (reduced-motion emulation) |
| 9 | Blondies → Brownies migration (once, with revision) + on import | ✅ | unit (migration) + browser (import) |
| — | Upgrade from v0.3 database keeps all data; old backups restore | ✅ | unit |

## Earlier features (unchanged, still tested)
Recipe library/search/favorites, import with matching, revisions & restore, ingredient tiles, butter g/tbsp/sticks, scaling & pan calculator, baking mode with timers & step mode, brown-butter record, full backup/restore, offline, GitHub Pages publishing.

## Not built yet (📋)
- Cloud sign-in and automatic phone ↔ PC sync (incl. photo sync).
- Frozen dough inventory (available/reserved). Production records are designed to feed it.
- Products, boxes/mixed boxes, customers, orders, pickup groups, sales days, payments, reports.
- "Historical sales keep cost snapshots": production records keep snapshots now; sales will do the same when built.

## Known limitations
- Teaspoon weights must be entered from the label; the app never guesses densities.
- Timer alarms only sound while the app is open.
- Photos make backups larger (~200 KB each).
