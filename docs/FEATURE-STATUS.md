# Feature status — v0.16.0

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
| — | Delete recipe → Recently deleted → restore or delete permanently (keeps production history) | ✅ | unit + browser |

## Earlier features (unchanged, still tested)
Recipe library/search/favorites, import with matching, revisions & restore, ingredient tiles, butter g/tbsp/sticks, scaling & pan calculator, baking mode with timers & step mode, brown-butter record, full backup/restore, offline, GitHub Pages publishing.

## PC → phone updates (v0.5)
| Feature | Status | Verified by |
|---|---|---|
| Send to phone (encrypted, secret gist in your GitHub), pairing link, passphrase | ✅ | unit (simulated GitHub) + two-browser test (simulated GitHub) |
| Phone auto-applies on open; conflicts ask; other version kept in History; deletions follow | ✅ | unit + browser |
| Real GitHub round trip | 🟡 | GitHub API behaviour confirmed from GitHub docs (CORS, Gists permission); my test environment can't reach GitHub, so the first real send is on your PC |
| Photos / production history between devices | 📋 | use Backup for now |

## The Freezer (v0.6)
| Feature | Status | Verified by |
|---|---|---|
| Freezer stock, batches, oldest-first, never below zero, quality guide | ✅ | unit + browser |
| Shared both ways via your Google Sheet (Apps Script), offline queue, no duplicates | ✅ / 🟡 | unit tests run the real script against a fake sheet; two-browser test against a simulated sheet. **First real Google deployment happens on your PC.** |
| Finish bake as frozen dough → added to freezer | ✅ | browser |

## Orders (v0.7)
| Feature | Status | Verified by |
|---|---|---|
| Menu (half dozen / dozen, Approved recipes only), prices, cost & margin | ✅ | browser |
| Orders on both devices, statuses, payment separate, cost snapshot at pickup | ✅ | unit + three-browser test |
| Reserve on confirm, use on Baked & ready, release on cancel, never twice | ✅ | unit |
| Planning: have vs. ordered, make more, upcoming pickups | ✅ | unit + browser |
| Customer order link → Request + email to owner; server-side prices; spam trap; flood limit | ✅ / 🟡 | real script tested with fake Google services; browser test against a simulated sheet. **Real email arrives once you deploy script v2.** |

## Pickups, packing & customer experience (v0.10)
| Feature | Status | Verified by |
|---|---|---|
| Order received celebration (phoenix + check mark; still image with reduced motion) | ✅ | browser (normal + reduced motion) |
| Pickup options (details, helper), required choice on the form, select in New order | ✅ | unit (real script) + browser |
| Order form open/closed + note | ✅ | unit (real script) + browser |
| Customer emails: received / confirmed / ready, once each, email contacts only, on/off | ✅ / 🟡 | real script with fake Google services. **Real emails need script v3 deployed.** |
| Packing tab: groups by place & date, packed checkbox, handed to…, picked up; shared PC ↔ phone | ✅ | unit + three-browser test |
| Shared bake history (one-time share of older records) | ✅ | unit |
| Events reach the sheet in the order they were made | ✅ | unit (regression test) |

## Products, customers & reports (v0.11)
| Feature | Status | Verified by |
|---|---|---|
| Email-only order form (form + script v4 check) | ✅ | unit (real script) + browser |
| Any approved recipe sellable, custom sizes; only cookies use freezer dough | ✅ | unit + browser |
| Mixed boxes (flavour groups, server validation, per-flavour dough) | ✅ | unit (real script) + browser |
| Customers tab (merge by email, history, copy emails, CSV) | ✅ | unit + browser |
| Reports tab (periods, tiles, chart, tables, unpaid, CSV) | ✅ | unit + browser |

## Shopping, pictures & display (v0.12)
| Feature | Status | Verified by |
|---|---|---|
| Shopping list (orders + manual batches, combined ingredients, packages, cost, stores, tick-off, copy/print) | ✅ | unit + browser |
| Drawn cookie illustrations | ✅ | unit + browser (visual check) |
| Uploaded / AI pictures on the order form (script v5) | ✅ | unit (real script) + browser |
| Text size and high contrast | ✅ | browser (1280 px and 360 px phone at extra large) |

## Bake day, Freezer look, notifications (v0.13)
| Feature | Status | Verified by |
|---|---|---|
| Bake-day planner (freezer pulls, mixing, oven timeline from recipe bake times, packing, mark ready) | ✅ | unit + browser |
| Frosty Freezer theme (snow follows animation and reduced-motion settings) | ✅ | browser (visual) |
| Notification-friendly new-order email subject (script v6) | ✅ / 🟡 | unit (real script); real Gmail after the update |

## Tasting, feedback, form polish (v0.14)
| Feature | Status | Verified by |
|---|---|---|
| Tasting boxes + came-back tally | ✅ | unit + browser |
| Feedback email, signed link, rating page, ratings in Reports/Customers (script v7) | ✅ / 🟡 | unit (real script, real HMAC) + browser; real email after the update |
| Flavour descriptions, cart bar, heard-from, link preview | ✅ | unit + browser |
| Optional order limit per day/week | ✅ | unit (real script) + browser |
| Sparks, entrance motion, holiday lights/snow | ✅ | browser (visual) |

## Turning tastings into orders (v0.15)
| Feature | Status | Verified by |
|---|---|---|
| Automatic encrypted backup to GitHub + restore | ✅ | browser (simulated GitHub) |
| Optional payment links (Venmo, Cash App, PayPal, Zelle, cash) | ✅ | unit (real script) + browser |
| Announcement emails with opt-in and unsubscribe (script v9) | ✅ / 🟡 | unit (real script) + browser; real email after the update |
| Order again links, gift orders, customer notes | ✅ | unit + browser |
| Tuck-in QR cards (10 per Letter sheet) | ✅ | browser + QR decoded from the print view |

## Launch checklist (v0.16)
| Feature | Status | Verified by |
|---|---|---|
| Dashboard launch checklist (auto + manual steps, progress, celebration) | ✅ | browser |

## Review cards (v0.17)
| Feature | Status | Verified by |
|---|---|---|
| Card QR choice: review page (default) or order form; message follows the choice | ✅ | browser (QR decoded) |
| Public review page → review event → Reports “What people think” | ✅ | tests + browser (simulated sheet) |
| Script v10 `review` action (menu flavours only, honeypot, rate limit, empty rejected) | ✅ | tests |
| Dashboard “Print cards” shortcut opens the print window once | ✅ | browser |
| App always opens on the Dashboard; customer pages, pairing and notification taps keep their address | ✅ | browser |
| Real sheet with script v10 | ⏳ | needs the owner to update the script |

## Test orders (v0.18)
| Feature | Status | Verified by |
|---|---|---|
| Test order button: 1/3/5/10 random orders at once through the sheet | ✅ | tests + browser (simulated sheet; banner arrived by itself in 26 s) |
| Script v11 `testOrder`: key required, no email, ignores closed/limit, no customer emails, owner email only if ticked, “🧪 TEST” subject | ✅ | tests |
| Test orders marked 🧪 (banner, notification, card); left out of Reports, Customers, checklist; Clear orders → Test orders | ✅ | browser |
| Real sheet with script v11, real phone notification | ⏳ | needs the owner to update the script |

## Loyalty, private address, one dashboard (v0.19)
| Feature | Status | Verified by |
|---|---|---|
| Loyalty count by email, every N picked-up orders (default 5); tests and tasting boxes excluded | ✅ | tests |
| Automatic “your next half dozen is on us” email, once per earning pickup; progress lines in received/ready emails | ✅ | tests |
| Form claim “Use my free half dozen” (applied, need-half, none) and owner Apply/Undo on the order card | ✅ | tests + browser |
| Predictions: dashboard Loyalty tile, order-card badges, Customers progress | ✅ | tests + browser |
| Town on form; private address emailed only after confirmed + paid; cash at pickup hidden | ✅ | tests + browser |
| Ingredient swap chips inside the tile, flip + shimmer animation | ✅ | browser (phone size) |
| Baking/Business switch removed; one dashboard | ✅ | browser |
| Animated dashboard tiles; off with reduced motion / Animations setting | ✅ | browser |
| Auto send to phone; phone checks every 3 min; script version via every sync | ✅ (logic) | type check; needs the real PC + phone to confirm |
| Real sheet with script v12 | ⏳ | needs the owner to update the script |

## Phone alerts (v0.20)
| Feature | Status | Verified by |
|---|---|---|
| Script v13 posts each new order to the private ntfy topic (click opens Orders; tests marked; off/no topic = nothing) | ✅ | tests |
| A failed or unauthorized phone alert never loses the order; “needs permission” reported to the app | ✅ | tests |
| Numbering from the highest number in the sheet | ✅ | tests |
| Setup card: channel, copy, test alert, on/off, new channel | ✅ | browser (simulated sheet) |
| Real ntfy delivery to the owner's phone | ⏳ | needs the owner: script v13 + ntfy app |

## Nudges, confirm all, weekly email, reviews on form, availability (v0.22)
| Feature | Status | Verified by |
|---|---|---|
| Freezer nudges from the last 4 weeks of real orders | ✅ | tests + browser |
| Confirm all I can cover | ✅ | browser (simulated sheet) |
| Weekly summary email (Sunday 6 PM, once; catch-up to Tuesday; off switch; sample) | ✅ | tests |
| Featured reviews on the order form (max 3, first name only) | ✅ | tests + browser |
| “Only … left” availability on the order form | ✅ | browser |
| Script v14 on the real sheet | ⏳ | needs the owner to update the script |

## Short freezer math, empty freezer, cupcakes, history, gear (v0.23)
| Feature | Status | Verified by |
|---|---|---|
| Abbreviated flavour names; freezer math lines on cards and in the Confirm message | ✅ | tests + browser |
| Empty the freezer with ice-over count-down | ✅ | tests + browser |
| Cupcakes category, sizes, illustration, no freezer dough | ✅ | tests + browser |
| Flavour dates (week/month/custom), coming soon, pickup-date limit; script v15 enforces | ✅ | tests + browser |
| Notification history panel | ✅ | tests + browser |
| Dashboard gear → sheet settings | ✅ | browser |
| Script v15 on the real sheet | ⏳ | needs the owner to update the script |

## Simultaneous orders fix, test stock (v0.24)
| Feature | Status | Verified by |
|---|---|---|
| Script v16: SpreadsheetApp.flush() before every lock release (orders can't overwrite each other) | ✅ | tests (write → flush → release order on every path) |
| Arrival tracker for test orders | ✅ | browser (simulated sheet) |
| Test stock: empty + random 6–60 per cookie flavour; deducts correctly at Baked & ready | ✅ | tests + browser |
| Slower ice animation | ✅ | browser |
| Real sheet with script v16, 10 test orders all arriving | ⏳ | needs the owner to update the script |

## Allergens (v0.28)
| Feature | Status | Verified by |
|---|---|---|
| Recipes can list the nine major allergens, "may contain" warnings and a detail note (e.g. pecans); import accepts any capitalisation and normalises it | ✅ | unit tests |
| Editor tick boxes; recipe page shows the line or "not listed yet" | ✅ | browser |
| Order form shows "Contains: …" under each flavour, plus "Allergens by flavour" for mixed boxes (script v17) | ✅ | tests + browser (simulated sheet) |
| Menu entries refresh automatically when a recipe's allergens change (main device only) | ✅ | unit tests |
| Real sheet with script v17 | ⏳ | needs the owner to update the script |

## Test bakes, import animation, new freezer (v0.29)
| Feature | Status | Verified by |
|---|---|---|
| Test-bake form, later taste checks, edit/delete, compare table, copy for Head Baker; shared via sheet events (`bakelog.save` / `bakelog.delete`) | ✅ | unit tests + browser |
| Finish baking offers the form (prefilled with date, batch, yield, portion, swaps, brown butter loss) | ✅ | code review; not clicked through in a browser |
| Cookbook writing animation on import (bundled Caveat font, OFL) | ✅ | browser (PC + phone sizes) |
| Illustrated freezer intro with real inventory labels | ✅ | browser (sample inventory) |
| On the owner's Samsung and PC | ⏳ | owner to check |

## Wide-screen kitchen rail and artwork (v0.30)
| Feature | Status | Verified by |
|---|---|---|
| Left kitchen rail (orders, freezer, baking timers, taste checks due, recent recipes) at ≥1480 px | ✅ | browser at 1706 px (150% scaling), 2560 px; unchanged at 1366 px |
| Right-side illustration at ≥1680 px, still when animations are off | ✅ | browser |

## Make list, keep awake, cart intro (v0.31)
| Feature | Status | Verified by |
|---|---|---|
| Everything to make (shared with Shopping), batch steppers, freeze/bake choice, time estimate | ✅ | unit tests + browser |
| Hands-on minutes in Test bakes feed the estimate | ✅ | unit tests |
| Keep screen awake button (touch devices), auto-off after 3 h | ✅ / ⏳ | browser (button shows on phone size, hidden on PC); wake lock itself needs a real phone |
| Shopping cart intro | ✅ | browser |

## Orders intro and intro settings (v0.32)
| Feature | Status | Verified by |
|---|---|---|
| Clipboard intro with real open orders, ticks for confirmed | ✅ | browser (PC + phone sizes) |
| Per-intro on/off switches + all-at-once switch in the Aa menu | ✅ | unit tests + browser (Orders intro stops when switched off) |

## Customer side: notice, boxes, tracker, stamp card (v0.34, script v18)
| Feature | Status | Verified by |
|---|---|---|
| Cottage food warning statement above Send (exact statutory wording) | ✅ | browser |
| Boxes fill as items are picked; mixed boxes fill by flavour | ✅ | browser (simulated menu) |
| Box closes / ribbon / stamp on "Order received" | ✅ | browser |
| Signed tracker link (`track:` HMAC), tracker page, links in received/confirmed/ready emails | ✅ | script tests + browser (simulated sheet) |
| Stamp card in emails and on the tracker | ✅ | script tests + browser |
| Real sheet with script v18 | ⏳ | owner to update the script |

## Up next 📋
- Order windows that open and close automatically, with a countdown on the form and a “Notify me” box when closed.
- Expenses and real profit, with a year-end tax summary.
- Supplies tracker (boxes, bags, stickers, order cards) with low-stock warnings on the shopping list.

## Planned for January 2027 (with the cottage food license) 📋
- Box labels: product name, ingredients by weight and allergens from recipes, matched to the state's cottage food rules. (The order-form warning statement is done in v0.34.)
- Labels printed on sticker sheets with the owner’s regular printer (no label machine), laid out to match the chosen sheet (e.g. Avery 2″ round, 12 per sheet).
- Printable packing slips.

- Texting customers is out of scope by design (email only).
- Photo sync.
- "Historical sales keep cost snapshots": production records keep snapshots now; sales will do the same when built.

## Known limitations
- Teaspoon weights must be entered from the label; the app never guesses densities.
- Timer alarms only sound while the app is open.
- Photos make backups larger (~200 KB each).
