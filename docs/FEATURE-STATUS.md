# Feature status — v0.3.0

✅ Implemented and tested · 🟡 Partial · 📋 Planned (not built)

## Recipe library & baking (Workstream 2)
| Feature | Status | How it's verified |
|---|---|---|
| Upgrade from v0.2 database keeps recipes, versions, prices | ✅ | db test |
| Recipe library, search (title/tags/ingredients), category/status/favorite filters | ✅ | browser test |
| Favorites, recently used | ✅ | manual + browser |
| Dashboard home (Baking and Business modes) | ✅ | browser screenshots |
| New recipe / edit master → new revision; view & restore old versions | ✅ | db tests + browser test |
| Refuses to save over a newer version (no silent overwrite) | ✅ | db test |
| JSON import (file or paste), validation, preview, ingredient matching, unpriced new ingredients | ✅ | db test + browser test |
| All-or-nothing multi-recipe import | ✅ | db test |
| Existing-id choice: separate copy or new version | ✅ | code review |
| Ingredient tiles: 4/3/2/1 columns by available width, groups, whole-tile tap, keyboard | ✅ | browser test at 1280, 412, 300 px |
| Butter g / tbsp / sticks scaling together | ✅ | unit + component + browser |
| Quarter-spoon fractions, same-dimension secondary amounts | ✅ | unit tests |
| Fractional egg weighing guidance | ✅ | unit test |
| Baking mode: scaling presets, custom, target count, portion weight (if recorded), pan calculator | ✅ | browser + unit test |
| Step-by-step mode, step done marks, contextual tips hidden until opened | ✅ | browser |
| Timers from method text + manual timers, survive reload; sound/vibrate | ✅ (sound needs app open) | browser test |
| Keep screen awake | 🟡 | Uses the Wake Lock API; untested on your Samsung |
| Brown butter before/after weight record, moisture loss | ✅ | browser |
| Session never modifies master recipe | ✅ | db + browser test |
| Copper phoenix: icon, header logo, full wordmark | ✅ | visual check |
| Full backup / restore with validation, comparison, confirmation; weekly reminder; last backup date | ✅ | db test (restore into empty install) + browser test |
| Persistent storage request | ✅ | browser API (untested on device) |
| Offline after first visit | ✅ | browser offline test (desktop Chrome) |
| Recipe photos | 📋 | next milestones |
| Collections (beyond tags/favorites), baking journal, ratings | 📋 | |
| Volume↔weight with ingredient densities, per-ingredient unit overrides | 📋 | |
| Approved brown-butter variants linked to originals | 📋 | |

## Costing & inventory (Workstream 3)
| Feature | Status |
|---|---|
| Optional price list, overwrite price → estimates recalculate, "incomplete" not $0 | ✅ |
| Store/brand, cost per gram display | ✅ |
| Packaging costs, cost per portion, suggested prices, margins | 📋 |
| Frozen dough batches, reservations, actual yield | 📋 |

## Orders & reporting (Workstream 4)
Customers, products/boxes/mixed boxes, orders, payments, pickup groups, sales days, reports: 📋 all planned.

## Sync
Account sign-in and automatic phone↔PC sync: 📋 **not built**. Data stays on each device; move it with backup files.
Local change records (outbox) are kept for a future sync engine.

## Not yet tested on your real devices
Android installation, wake lock, notifications, split-screen on the Samsung itself. Browser tests used desktop Chrome with phone-sized screens.
