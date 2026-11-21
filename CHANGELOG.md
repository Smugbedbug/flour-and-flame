# Changelog

## 0.34.0 — 2026-11-20
- **Cottage food notice on the order form:** the Illinois warning statement ("This product was produced in a home kitchen not inspected by a health department…") is shown prominently right above Send, as required at the point of sale (410 ILCS 625/4).
- **Boxes that fill:** picking a size on the order form shows a bakery box under it with a treat dropping into every slot (two dozens = two boxes, up to 4 drawn then "+N"); mixed boxes fill slot by slot with the flavours chosen.
- **"Order received":** the box with the customer's own treats closes, a red ribbon ties with a bow, a "Flour & Flame #44" stamp lands and sparks fly. (Replaces the phoenix.)
- **Order tracker (needs sheet script v18):** every customer email (received, confirmed, ready) has a "📦 Follow your order" link, and the thank-you screen has a "Track your order" button. The page shows Received → Confirmed → Baking → Ready → Picked up with times, the items, pickup and payment status, refreshes itself every minute, and only opens with the signed link from that order.
- **Stamp card (needs script v18):** emails show the loyalty card as stamps, e.g. "Your stamp card: 🍪🍪🍪⚪⚪  3 of 5 toward a free half dozen"; the tracker page shows a printed-card version with stamps that thump on.

## 0.33.0 — 2026-11-20
- **Phone bottom bar stays put:** it no longer shifts or jitters while scrolling, when Chrome's address bar slides in and out, or when you pull past the top or bottom of a page (page bounce is turned off on phones). The page can't be nudged sideways either.

## 0.32.0 — 2026-11-20
- **Orders intro:** a clipboard slides in and your open orders are written on the sheet in pencil (soonest pickup first, up to 5), with a tick drawn beside the confirmed ones and a red-pencil note like "3 open · 1 to confirm". With no open orders it writes "All caught up". Tap to skip.
- **Page intro settings (Aa menu → Page intros):** one switch for all page intros and one for each (Recipes cookbook, recipe page flip, Orders clipboard, Freezer, Shopping cart, import writing). Every intro can still be skipped with a tap; turning Animations off stops them all.
- The Aa menu's Close button moved to the left.

## 0.31.0 — 2026-11-20
- **Bake day → Everything to make:** one list of every batch your orders and freezer need right now (the same list as Shopping), plus anything you add. Change batch sizes, choose "Dough to the freezer" or "Bake them" for cookies, and start a batch. It adds up hands-on time, oven time (rounds × the recipe's bake time with your tray settings), and the longest chill/cool wait from the recipe steps into an approximate total and finish time.
- **Hands-on time** is a new field in Test bakes; the make list uses your latest one (or a number you type in).
- **Keep screen awake** (phone and tablet): a sun button in the top bar keeps the screen on while the app is open; it turns itself off after 3 hours.
- **Shopping cart intro:** a cart rolls in, flour, butter, chocolate and eggs drop in, a check mark pops, and it rolls on. Tap to skip; off with Animations off / reduce motion.

## 0.30.0 — 2026-11-20
- **Wide screens (about 1480 px and up):** a **kitchen rail** on the left with today's date, order counts (Requests / Confirmed / Ready) and the next pickups, freezer total with flavour chips and "make more" warnings, recipes being baked with their next timer, test bakes due for next-day scores, and recent recipes. Everything is a shortcut. From about 1680 px, the right margin shows a quiet illustration (flickering flame over a cupcake and a cookie stack, drifting flour, "sweet · salty · balanced"); it stays still with Animations off or reduce motion. Phones and smaller windows are unchanged; both hide in baking mode.

## 0.29.0 — 2026-11-20
- **Test bakes:** a form on every recipe page (and offered automatically after Finish baking for Experimental/Testing recipes) to record what you tested, changes made, oven temperature, bake time, rack, pan, portion, rest/chill, dough temperature, kitchen humidity, yield, how they came out, taste scores 1–5 on bake day plus next-day / day 3 / day 5 checks, and your decision. **Compare** shows batches side by side with the differences highlighted; **Copy for Head Baker** copies a summary to paste into your plugin. Saved on the device and shared through the bakery sheet.
- **Import animation:** importing recipes opens your cookbook and writes the new recipe onto the page in handwriting with a quill, then stamps it "Added". Tap to skip.
- **New freezer intro:** a redrawn, realistic chest freezer. The lid swings up, the inside light comes on, and frosted freezer bags show your real inventory with handwritten labels (e.g. "BBCC · 132"; up to 6, then "+N more"; "Empty, time to bake!" when empty).

## 0.28.0 — 2026-11-20
- **Allergens:** each recipe can list its major allergens (milk, eggs, wheat, soy, peanuts, tree nuts, sesame, fish, shellfish), "may contain" warnings from ingredient labels, and a detail like "pecans". Tick them in Edit → Allergens, or let your recipe GPT include them in the import file.
- **Order form:** each flavour shows "⚠️ Contains: …" under its description; mixed boxes have an "Allergens by flavour" list. When you change a recipe's allergens, the order form updates by itself. Needs **sheet script version 17**.
- The recipe import format now officially includes Cupcakes and the allergen fields (see docs/RECIPE-IMPORT-SCHEMA.md).

## 0.27.0 — 2026-11-20
- **Chest-freezer intro:** opening the Freezer shows a white chest freezer with the Flour & Flame badge. The lid swings up on its back hinge, the inside glows icy blue with dough balls, cold mist spills over the front edge, then you zoom in to the Freezer page. Tap to skip. It doesn't replay when you come back from sheet settings. Off with the Animations setting or reduce motion.

## 0.26.0 — 2026-11-20
- **Quick order views:** big buttons with counts at the top of the Orders tab (All open · Requests · Confirmed · Ready · Picked up) show just those orders. The same buttons are on the dashboard's Orders tile and jump straight there. Requests glow when some are waiting.
- **Test stock on an empty freezer** no longer counts down: the frost comes in and it only counts up to the new amount.
- The **launch checklist** on the dashboard now starts closed (tap the arrow to open it).

## 0.25.0 — 2026-11-20
- **Cookbook animations:** opening Recipes slides a leather cookbook to the centre and swings its cover open before the library appears; opening a recipe flips through a few pages. Tap to skip. Going back from a recipe to the library doesn't replay the book. Off with the Animations setting or reduce motion.
- **Freezer: “Add” on a flavour's card adds to that flavour only.** The window says “Add Brown Butter Chocolate Chip Cookies” and has no flavour dropdown. The big “Add dough balls” button at the top still lets you choose.

## 0.24.0 — 2026-11-20
- **Fix (sheet script v16): orders arriving at the same moment could overwrite each other.** The script let the next request in before its own save was final, so two orders a second apart could land on the same row and one vanished (its email and phone alert had already gone out). That's why only ~7 of 10 test orders arrived, and it explains the earlier "got the email, not in the app" and mixed-up numbering. Every save is now made final before the next request can write. **Update the sheet script to get the fix.** Orders lost before the fix can't be recovered from the sheet; their emails are the record.
- **Arrival tracker** in the Test order window: “Arrived in the app: 7 of 10 · waiting for #45, #47”, then ✅ when all have arrived, or a warning naming any that never did.
- **🎲 Test stock** button on the Freezer page: empties the freezer, then adds a random 6–60 (in half dozens) of every cookie flavour on the menu, marked “Test stock”, with the count running down to zero and back up.
- The empty-the-freezer animation is slower (about 3½ seconds down, with a pause at zero).

## 0.23.0 — 2026-11-20
- **Short freezer math** on order cards and after Confirm, with abbreviated cookie names: “BBCC: 150 − Eric 18 = 132 left”, or “… = 4 short” when there isn't enough. Hover (or long-press) shows the full names. Confirm all uses the short names too.
- **Empty the freezer** (Freezer page, next to the total): asks first (and warns if dough is set aside for confirmed orders), then the screen ices over while the count runs down to zero. Recorded as thrown out.
- **Cupcakes:** a new Cupcakes category (no freezer dough), with Single, Box of 4, Half dozen and Dozen sizes and a drawn cupcake picture. Import cupcake recipes the same way as cookies, with `"category": "Cupcakes"`.
- **Flavours of the week or month:** any flavour can be set to Always, This week, Next week, This month, Next month or custom dates. The order form shows it only during those dates, with a “Flavor of the week/month” badge, limits the pickup date to its last day, and teases upcoming flavours under “Coming soon”. The order form now groups flavours under 🍪 Cookies / 🧁 Cupcakes.
- **Notification history:** the clock button next to the logo keeps every pop-up message and new-order alert (with an Open button for orders) so you can reread anything you missed.
- **Gear button on the dashboard** (top left, next to Print cards) opens the bakery sheet settings.
- Sheet script **v15** (flavour dates and “coming soon”).

## 0.22.0 — 2026-11-19
- **Freezer nudges:** “You usually sell about 24 Brown Butter a week and have 8 free. Make about 16 more.” Based on the last few weeks of real orders (no tests, tasting boxes or cancelled orders), on the Freezer page and the dashboard Freezer tile. Stays quiet until there are ~10 days of history.
- **Confirm all I can cover** on the Requests heading: confirms every request the freezer can cover in one go, tells you which ones are left and why, and each customer gets their confirmation email.
- **Weekly summary email** to the bakery Gmail every Sunday after 6 PM: new orders, what was picked up and the sales, what's waiting, the most-ordered flavour, new and returning customers, tasting boxes, loyalty rewards and reviews. Switch and “Email me a sample now” on Pickup & form.
- **Reviews on your order form:** tap “Show on form” next to a comment in Reports → What people think (up to 3). The form shows the stars, the words and the first name only.
- **“Only … left” up front on the order form** when you've set an order limit (e.g. “🔥 Only 2 dozen left this week. Order soon!”, or the next open day/week when it's full), before anyone picks a date.
- Sheet script **v14** (weekly summary, reviews on the form, and deleted orders stay deleted on the sheet too).

## 0.21.0 — 2026-11-19
- **The new-order banner is on fire:** flames flicker up from its bottom edge, embers drift up, and the border flickers like it's catching (instead of the steady glow). With animations off or reduce-motion on, it shows a steady warm edge instead.
- **Each order gets its own card, in a stack you can flip through.** With several orders you see “1 of 5” with ‹ › arrows on the left, dots to jump to one, the arrow keys on a PC, or a swipe on the phone. Each card shows the items, total, pickup place and date, when it was placed, and any note or gift.
- **Open this order** jumps straight to that order on the Orders page and makes it flash. **Seen it** takes one card off the stack. **View all** and **Later** still handle them all at once.

## 0.20.0 — 2026-11-19
- **Instant phone alerts, even when the app is closed**, through the free ntfy app (no account, no cost). Set up on Orders → Pickup & form → “Instant phone alerts”: install ntfy, tap Set up my channel, subscribe to the private channel name, and send a test alert. The sheet sends each new order (first name, items, total, pickup, note) the moment it arrives; tapping the alert opens the app on Orders. Test orders show 🧪. Can be switched off; “New channel” makes a fresh private name.
- Sheet script **v13**: phone alerts, plus new events are numbered from the highest number in the sheet (not the last row), so deleting or re-sorting rows by hand can't cause reused numbers. This version asks Google for one new permission (to send phone alerts).

## 0.19.6 — 2026-11-19
- **Freezer status on every order card:** a green “You’re good” box shows how many dough balls confirming will set aside and how many stay free (e.g. “12 of Brown Butter Chocolate Chip · 20 free now → 8 after”). Confirmed orders show a blue “Set aside in the freezer” box. The orange “you’d need more” warning is unchanged.
- **Detailed message after Confirm:** who and when, the dough set aside and what's still free (or how many to make), whether the confirmation email went out (or why not: test order, testing mode, no email), and a reminder that the address goes out once paid.
- Messages now appear below the new-order banner instead of behind it, and longer messages stay up longer.

## 0.19.5 — 2026-11-19
- **Fix: cleared orders popping back up.** On a sheet whose numbering got out of order (for example after rows were deleted by hand), the "deleted" record could be numbered before the orders it deletes, so replaying the events brought them back. A deleted order now stays deleted whatever order the events are read in. Events that share a number are replayed oldest first.

## 0.19.4 — 2026-11-19
- Order form: the Name and Email boxes line up again. The loyalty note now sits on its own line under both, instead of making the Email column taller and stretching the Name box.

## 0.19.3 — 2026-11-19
- **Fix: orders and changes stuck because the sheet's numbering didn't match the device.** Each change on the sheet gets a running number, and the app only asked for numbers higher than the last one it saw. If rows were deleted from the sheet, or an earlier send got through but its answer was lost, the sheet's numbers fell behind the app's. Then new orders were never picked up, and changes the sheet already had kept being re-sent ("4 changes not yet on the sheet").
  - If the sheet's numbering is behind, the app re-reads everything and follows the sheet from then on.
  - If a send comes back with changes the sheet already had, the app re-reads once so they're matched up and stop being re-sent.
  - Safety net: each time the app opens, it re-reads the whole sheet once, so nothing missed stays missed.

## 0.19.2 — 2026-11-19
- **Fix: Windows/phone notifications went quiet after the first one.** Every order notification used the same label and stays on screen until tapped, so each new one silently replaced the last (no sound, no pop-up). Now each order gets its own notification, with a vibration on phones.
- **Sync rebuilt so new orders always come first:** the app checks for new orders in their own quick request, then sends this device's changes separately. A slow or failing send (the sheet sends emails while it saves) no longer holds up new orders. Time limits are now 40 s for checking and 2½ minutes for sending (0.19.1's 30 s cut off slow-but-working answers).
- **Connection check** button next to Sync now: times a real round-trip to the sheet, shows the script version, unsent changes and whether notifications are allowed on this device, with Copy details and Send a test notification.
- The status line now says when the app last checked for orders and updates itself.

## 0.19.1 — 2026-11-19
- **Fix: new orders sometimes never showed up (or took ages).** If one check with the bakery sheet stalled (phone screen locking, the app going to the background, Wi-Fi switching to data), the app waited on it forever, and every later check, including Sync now, waited behind it until the app was fully closed. Now a check gives up after 30 seconds and the app tries again 8 seconds later. Tested: with one stalled check, the old version never showed the order; the new one showed it about 37 seconds later.

## 0.19.0 — 2026-11-19
- **Loyalty: a free half dozen after every 5 picked-up orders**, then it starts again (number adjustable, can be switched off on Pickup & form). The order form asks people to use the same email every time. Tasting boxes and test orders don’t count.
- When the pickup that earns it is marked picked up, the sheet **emails the customer automatically**. The “ready” email says when this pickup will earn one; the “received” email shows their progress.
- Customers tick **“🎁 Use my free half dozen”** on the form; if they’ve earned one and the order has a half dozen, it comes off automatically. You can also apply it (or undo) on the order card.
- Predictions: a **Loyalty** tile on the dashboard (free half dozens to use, which open order earns the next one, who’s getting close), badges on order cards, and progress on Customers.
- **Pickup in Plainfield, address after payment:** set your town and a private address on Pickup & form. The form shows the town only; the sheet emails the address once an order is confirmed **and** paid. “Cash at pickup” is hidden while an address is set. Order cards show whether the address went out.
- **Ingredient swaps fixed:** the vanilla extract / bean paste choice was squeezed under the next tile. Now both choices sit inside the tile, the one in use is lit, and tapping the other flips the tile over with a copper shimmer.
- **One dashboard:** the Baking/Business switch is gone. Everything is on the dashboard and in the top menu.
- **Animated dashboard tiles:** tiles rise in one after another with a copper sheen, and each tile’s icon has its own little motion (bouncing bag, wiggling gift, turning snowflake, beating heart…). Off with the Animations setting or your device’s reduce-motion setting.
- **Auto send to phone:** recipe, price and sheet-setting changes on the PC go to the phone by themselves ~15 s after you stop editing (switch in PC → phone updates). The phone also checks every few minutes while open. Sheet script v12 reports its version on every sync, so once you update it on one device, the others stop asking.
- Sheet script **v12**.

## 0.18.0 — 2026-11-19
- **🧪 Test order button** (Orders, next to Order cards): sends 1, 3, 5 or 10 pretend orders at once through the bakery sheet, exactly like real customers, so you can watch the banner, whoosh, phone/Windows notification and (optionally) the Gmail email arrive. Random names, menu items, mixed boxes, pickup days and notes.
- Test orders need no email, send no customer emails, work even when the form is closed, ignore the order limit, and stay out of sales, Reports, Customers and the launch checklist. They show 🧪 in the banner, the notification and on the order card. **Clear orders…** now offers “🧪 Test orders” first.
- Sheet script **v11** (adds test orders; only your app can send them).

## 0.17.0 — 2026-11-19
- **Review cards:** the tuck-in cards' QR code can now open a short **review page** (the new default) or the order form. Pick “⭐ Leave a review” or “🛍️ Order more” on the cards page; the message on the card changes to match.
- The review page: stars for each flavour on the menu (with its picture), “Would you order a box?”, a comment and an optional first name, then a thank-you with an **Order a box** button. Reviews show in Reports → What people think, marked “(card)”.
- **Print cards shortcut:** a small “Print cards” button at the top left of the business dashboard opens the print window straight away with your saved designs.
- **Always opens on the Dashboard.** Customer pages (order form, feedback, reviews, unsubscribe), pairing links and taps on new-order notifications still go where they point.
- Sheet script **v10** (adds reviews). Update it from Settings → Shared sheet: the banner there walks you through it.

## 0.16.2 — 2026-11-19
- Fix: the new-order banner sometimes didn't appear. It was hidden on the Orders screen (and visiting Orders dismissed it), and the app only checked for orders every 2 minutes and not at all from a background tab.
- Now the banner shows on every screen (including Orders and baking mode), stays pinned to the top of the screen even when you scroll, and stays until you tap View order / Later or confirm or cancel the request.
- The app checks for new orders every 30 seconds while you're looking at it, about once a minute from a background tab (so the whoosh and Windows notification still come), and right away when you switch back to it.

## 0.16.1 — 2026-11-19
- Agenda: labels will print on **sticker sheets with your regular printer** (no label machine needed).
- Order cards page: notes that the layout matches the standard Avery 2″ × 3½″ business-card template (Avery 8371 inkjet / 5371 laser perforated sheets), or plain cardstock cut by hand.

## 0.16.0 — 2026-11-19
- **Launch checklist** on the business dashboard: 12 steps (plus 2 optional) for one real run-through before sharing the link: sheet connected, script up to date, menu prices, flavour descriptions, payment checked, a real test order, all four emails arriving, test orders cleared, Testing mode off, backed up, order cards printed, link shared. Steps marked "auto" tick themselves; tap the others. A progress ring, the next step highlighted, a celebration at 100%, then the checklist can be hidden.
- Dashboard **On the agenda** updated. Up next: order windows that open and close on their own (countdown + "Notify me"), expenses and real profit, loyalty card, supplies tracker. January 2027: labels, label printer, packing slips.

## 0.15.1 — 2026-11-19
- **🖨 Order cards** button right next to the Orders title (on every Orders tab), on the dashboard, on the Packing list and in the Bake day "Cool & pack" step.
- The card page remembers your designs and message; next time just tap **Print 10 cards**. Back returns to where you came from.

## 0.15.0 — 2026-11-19
- **Automatic backups to GitHub:** the PC saves an encrypted copy of everything (recipes, prices, orders, freezer, photos when they fit) to a separate secret gist every week while the app is open, plus **Back up now** and **Restore from GitHub backup** on the Backup page. Same passphrase as PC → phone updates.
- **Payment (optional):** Pickup & form → Payment. Empty = "Cash at pickup". Add a Venmo, Cash App, PayPal.me or Zelle name later and customers get one-tap pay buttons with the amount filled in (thank-you screen, and the confirmed & ready emails); paid orders don't get asked.
- **Announcements:** customers can tick "📬 Email me when new flavours or pickup days open" on the form. Customers → Announcements: write a message and send it to subscribers (with your order link and a personal unsubscribe link in each email). Shows who's subscribed and what was sent.
- **Order again:** "ready" and "How were they?" emails include a one-tap link that opens the form with the same boxes already chosen.
- **Gift orders:** "🎁 This is a gift" on the form, with who it's for and a note; shown on the order card, packing list and your email.
- **Customer notes:** private notes per customer (Customers → open a person), shown on their orders and the packing list.
- **Tuck-in order cards:** Pickup & form → Print tuck-in cards: business-card size, 10 per Letter sheet, with your logo or the cookie's picture, a message and a QR code to your order form (orders from the card count as "Tried a tasting box").
- Bakery-sheet **script version 9** (payment links, gifts, order again, announcements).

## 0.14.2 — 2026-11-19
- **Clear orders:** Orders → "Clear orders…" (all orders, or only picked-up & cancelled) and a 🗑 on every order card. Deleted orders disappear on both devices, from Packing, Planning, Customers and Reports. Dough they took out of the freezer goes back into the count, unless you tick "the cookies were really baked".
- **Emails** (Orders → Pickup & form): 🧪 **Testing mode** pauses every email (to you and customers) while you try things out. Separate switches for "Email me when a new order comes in", customer emails and "How were they?". Orders still arrive in the app with the pop-up. Needs script v8.

## 0.14.1 — 2026-11-19
- New-order pop-up: a phoenix swoops in from the left with fast wing-beats and an ember trail, overshoots, settles beside the message and keeps gently gliding.
- New sound: **phoenix wings**, two soft wing-beats and a glide that sweep from left to right (default). Choose Phoenix wings, Chime or Both in Aa or Orders → Pickup & form.
- Each new order in the pop-up (and in Windows notifications) shows when it was placed: "Placed 4:52 AM (just now)".

## 0.14.0 — 2026-11-19
- **Tasting boxes:** tick "🎁 Tasting box" in New order (free, or set a small charge). Kept out of sales totals; Reports shows "N given → M came back and ordered" with what they've spent since and the ingredient cost of the samples; Customers shows "Tasted → came back ✓".
- **"How were they?" feedback:** when you tap Picked up, customers with an email get a friendly email with a private link (signed, so only they can use it). They tap stars for each flavour, say whether they'd order again and can leave a note, then see a thank-you with floating hearts. Ratings appear on the order card, in Customers, and in Reports → "What people think" (average per flavour, would-order-again %, recent comments). Can be switched off. Needs script v7.
- **Order form polish:** short flavour descriptions under each picture (Menu → tap a picture → "Short description"); a running cart bar at the bottom ("3 boxes · $84 · Review & send"); "How did you hear about us?" (Reports → "How people found you"); a proper link preview with the phoenix when the link is shared in texts or Facebook.
- **Optional order limit:** "Up to N dozen per pickup day / per week" (Pickup & form). Customers must pick a date, see how much is still available, and can't order past the limit. Planning shows a fill bar per day. Off unless you turn it on.
- **Flourishes:** copper sparks when you confirm, mark ready, pack or hand over an order (a big burst for "mark the whole day ready"); cards and tiles drift gently into place; ✨ holiday lights across the top of the app (automatic in December, switch in Aa) and optional holiday lights + snow on the order form. All follow the Animations setting and reduced motion.
- Dashboard agenda: "Up next: tuck-in order card with a QR code".

## 0.13.0 — 2026-11-19
- **Bake-day planner** (Dashboard → "Plan this bake day", or Orders → Planning): pick a pickup day and get numbered steps: what to take out of the freezer, what to mix (with Start batch), an **oven timeline** coloured like each cookie (times from your recipes' bake steps, or minutes you type in; pans first so they can cool), cool & pack by pickup place, and one button to mark the day's orders Baked & ready. Settings: start time, cookies per tray, trays or pans in the oven at once.
- **A colder Freezer:** frosted corners, a cold blue glow, gentle falling snow, frosted cards with icicles, icy counts, and a snowflake that slowly turns and glints. The Freezer button in the menu is icy blue and glints now and then. Snow follows Display → Animations and the device's reduced-motion setting; high contrast hides it.
- **New-order emails read well as phone notifications** (script v6): e.g. "🍪 New order #12 · Sue · 1 Mixed dozen · $30.00", with the pickup and total on the first line.

## 0.12.1 — 2026-11-19
- **Create in ChatGPT**: one tap opens ChatGPT with the cookie's picture description already typed in (copy button kept as a fallback). Save the picture, then Upload.
- Menu tab: "Pictures customers see" checklist of menu recipes still using the drawn illustration; tap one to make its AI picture.

## 0.12.0 — 2026-11-19
- **Shopping list** (new Shopping button, both modes): bakes what the freezer can't cover for orders (optionally including unconfirmed requests), plus brownies/treats for orders and any batch you add. Batch sizes adjustable in ½ steps. Every ingredient combined across recipes (homemade ingredients like caramel become their own batch), amounts in friendly units (sticks, eggs, cups, grams), how many packages to buy and the estimated cost, grouped by store. Tick items off, add extras, copy as text or print. Volume and weight are only combined when the teaspoon weight is known; unpriced lists never show $0.00.
- **Cookie pictures:** every recipe gets a drawn illustration matched to its name and ingredients (dough colour, chips, sprinkles, oats, drizzle, brownie and crispy-treat squares). Shown on recipe cards, the Menu, the shopping list and the customer order form.
- **Your own pictures on the order form:** Menu → tap a recipe's picture → upload an AI-made or real photo (or use one of the recipe's photos). A ready-made description can be copied into a free AI picture tool. AI pictures show an "Illustration" tag by default. Needs bakery-sheet **script version 5**.
- **Display settings (Aa button next to the logo):** text size Normal / Large / Extra large, high contrast, moving phoenix and order chime in one place.
- Dashboard "On the agenda": box labels, label printer and packing slips for January 2027 (cottage food license), plus later ideas.

## 0.11.1 — 2026-11-19
- **Try with sample sales** (Reports and Customers): three months of made-up orders using your real menu, prices and ingredient costs, so you can see how the reports track. Shown in memory only with a clear banner; never saved, never sent to the bakery sheet, nobody emailed. "Back to my real data" turns it off (it also turns off when you close the app).
- Money shows thousands separators ($2,618.00).

## 0.11.0 — 2026-11-19
- **Order form asks for an email address** (no phone numbers), checked in the form and, with script v4, by the sheet too. Clearer "we emailed a copy to …" message.
- **More products:** any Approved recipe can be sold (Cookies / Brownies / Crispy Treats / Other tabs on Menu), in any size: "Add a size" (e.g. Box of 4, 4 pieces, $10). Only cookies use dough balls from The Freezer.
- **Mixed boxes:** e.g. "Mixed dozen", flavours chosen in groups of 1/2/3/4/6 from recipes you pick. Customers build each box on the form ("✓ 12 chosen"); you can do the same in New order. Dough is reserved and used per flavour (cookie flavours only).
- **Customers tab:** everyone who has ordered (the same email = one customer), orders, amount spent, open orders, favourite flavour, order history, **New order for…**, copy one or all email addresses (for a Bcc announcement), download as CSV.
- **Reports tab:** This week / month / last month / year / all time / custom: sales, boxes and pieces, estimated profit from ingredient costs (only orders whose cost was fully known; otherwise "—"), unpaid picked-up orders, sales-by-week (or month) chart, by product, by flavour, top customers, payment methods, booked-but-not-picked-up total, and a CSV download for Excel or Google Sheets.
- Bakery-sheet **script version 4** (needed for mixed boxes and the server-side email check).

## 0.10.2 — 2026-11-19
- **New order alerts you can't miss** (PC and phone, in both modes): a large banner across the top with the customer, items and total, staying until you tap **View order** or **Later**; a gentle chime (can be turned off); the bell-and-count button next to the logo and the Orders button pulse until every request is confirmed or cancelled; the browser tab shows the count, e.g. "(1) Flour and Flame Bakery".
- Optional **Windows/phone notifications** for new orders while the app is open (Orders → Pickup & form → New order alerts). Tapping one opens Orders.
- All app messages now appear at the top centre, larger, instead of the bottom-right corner.
- Reduced-motion setting: no pulsing, a steady highlight instead.

## 0.10.1 — 2026-11-19
- Easier to find **Bakery sheet settings**: the button next to Sync now (Orders, Freezer) is labeled "Sheet settings", and Orders → Pickup & form has a Bakery sheet card with a settings button.

## 0.10.0 — 2026-11-19
- **Order received celebration** on the customer form: the phoenix rises in a burst of embers and a check mark appears, then "Order received!" with the order number, total and pickup. Still image for devices set to reduce motion.
- **Pickup options** (Orders → Pickup & form): e.g. Work, Mom & Dad's, each with details for customers and who hands them out. Customers must choose one on the form; the New order window has the same list.
- **Order form settings**: open/closed switch (closed shows your note instead of the menu), a note at the top of the form, and customer emails on/off.
- **Customer emails** (bakery-sheet script v3): customers who give an email get "we received your order" right away, "confirmed" when you tap Confirm and "ready" when you tap Baked & ready, each at most once per order. Phone-number contacts get no email.
- **Packing** tab: confirmed orders grouped by pickup place and date, with box totals, a packed checkbox per order, paid/collect amount, and **Handed to…** (e.g. Mom) separate from **Picked up**. One tap marks all ready boxes for a place as handed to its helper. Shared between PC and phone.
- **Shared bake history**: recorded bakes now travel through the bakery sheet, so batch suggestions and production history match on both devices (existing records are shared once automatically).
- Fix: changes made quickly before a sync could reach the sheet out of order (e.g. an order could show "Confirmed" on the other device after being marked ready). Events are now sent oldest-first with strictly increasing times.
- The Apps Script now lives in its own file (`src/apps-script/Code.gs`).

## 0.9.0 — 2026-11-19
- Dashboard **What to bake** card (both modes): headline "Bake N cookies for N orders · make N more dough balls"; **Make dough first** per recipe with a batch-size suggestion and a **Start batch** button (opens baking mode at that size); **Bake for pickups** by date (today / overdue highlighted, customers, whether the dough is ready); requests waiting.
- Batch suggestions use your own results: average dough balls per 1× batch from your last 5 recorded bakes (from Finish baking), else the recipe's stated yield; rounded up to the nearest ½ batch.

## 0.8.2 — 2026-11-18
- Bakery sheet: change the Web app URL without losing your key (for when a new deployment was created); clearer "still the old version" message.

## 0.8.1 — 2026-11-18
- Cost card: **See cost of each ingredient** lists each line with amount, the package it's priced from, its cost and share of the batch (largest first; big shares highlighted), so a wrong package size or unit is easy to spot.

## 0.8.0 — 2026-11-18
- Price list "How should this be costed?": **I buy it** (package + price), **Costs nothing** (water), **Price it like another ingredient** (e.g. egg yolk = whole egg), or **I make it from one of my recipes** (e.g. homemade caramel: that recipe's batch cost ÷ its finished batch weight, updating automatically).
- Water is free automatically. Gram recipes can use per-item prices with "1 item yields __ g" (e.g. juice per lemon).
- Recipes have an optional **Finished batch weight (g)**. Loops between recipes are detected.

## 0.7.1 — 2026-11-18
- Shortage warnings everywhere: confirmed orders the freezer can't cover show "Make N more … dough balls (x of y in freezer)"; a "Make more dough" banner on Orders and The Freezer; freezer cards show dough held for orders; the New order window warns before saving. Freezer stock is assigned to confirmed orders by earliest pickup, then to requests.

## 0.7.0 — 2026-11-18
- **Menu:** half dozen and dozen products per Approved cookie recipe, with price, estimated cost and margin; hide/show (sold out).
- **Orders** from PC or phone (shared through the bakery sheet): customer, contact, pickup date and place, items, discount, notes; Requested → Confirmed → Baked & ready → Picked up, or Cancelled; payment tracked separately with method. Picked-up orders keep an ingredient-cost snapshot.
- **Freezer link:** confirmed orders reserve dough balls; "Baked & ready" uses them; cancel releases (or keeps them used if already baked). Derived from events, so never deducted twice.
- **Planning:** have vs. ordered per recipe (in freezer, confirmed, available, requests, make more) and upcoming pickups.
- **Customer order form:** a public link showing your active menu; requests are priced by the sheet (not the customer's browser), saved as Requests, and emailed to you. Spam trap and flood limit. Bakery-sheet script v2 (the app prompts you to update).
- Dashboard shows orders and "make more". Business mode navigation: Dashboard, Orders, Freezer, Recipes, Prices.

## 0.6.0 — 2026-11-18
- **The Freezer:** frozen dough-ball stock per recipe, with batches (date, size, note); oldest used first; never below zero; "use soon" quality guide (your setting, default 12 weeks; not a food-safety date). Add/remove with large +/− controls.
- Finishing a bake as **Frozen dough** offers to add the balls to The Freezer.
- **Shared bakery sheet:** a private Google Sheet + Apps Script (generated by the app with your key) keeps freezer data the same on PC and phone, both ways. An append-only event list with unique ids means no duplicates and no overwrites. Offline changes wait and sync later. Syncs on open, every 2 minutes, and right after changes.
- Send to phone also carries the sheet settings, so the phone connects automatically.
- Database v5 (adds the event list); backups include freezer events.

## 0.5.0 — 2026-11-18
- **PC → phone updates.** The PC is the hub: press **Send to phone** and the phone applies the update automatically when it opens (or "Check now").
  Encrypted with your passphrase (AES-GCM 256, PBKDF2) and stored in a secret gist in your GitHub account; the token stays on the PC.
  Sends recipes (incl. Recently deleted), prices and packaging costs. Phone keeps its own photos, production history and sessions.
  If a recipe was changed on both devices, the phone asks which to keep; the other version stays in History. Wrong passphrase never links.
- Header shows **Send to phone** with a dot when there are unsent changes.

## 0.4.3 — 2026-11-18
- Recipe Library **Export all**: one file with every recipe, to import on another device.
- Import skips recipes identical to ones already on the device, and offers "Update all as new versions" / "Import all as copies" for the ones that differ.

## 0.4.2 — 2026-11-18
- Dashboard phoenix slowly beats its wings (5-second cycle; inner feathers trail slightly; body lifts on the down-stroke). CSS transforms only; off with reduced motion or Backup → Display.

## 0.4.1 — 2026-11-18
- Delete a master recipe: "Delete recipe" moves it to **Recently deleted** (bottom of the Recipe Library), where it can be restored unchanged or deleted permanently. Permanent delete removes the recipe, its versions and photos; production history records are kept.
- Library cards left-aligned.

## 0.4.0 — 2026-11-18
- **Costing fixed.** Root cause: costs only converted weight↔weight / volume↔volume / count↔count, so any "½ tsp baking soda" priced by the pound, any "pinch", or butter priced per stick marked the whole recipe incomplete. Now: optional teaspoon weight per ingredient, US butter standard for sticks/tbsp, eggs by count incl. dozen, pinches don't block completeness, merged duplicates are followed, and names match through aliases (AP flour = all-purpose flour, white = granulated sugar, semi-sweet = semisweet).
- Price list: product/brand, package unit incl. dozen/sticks/fl oz, aliases, teaspoon weight, "needs attention" list, possible-duplicates merge (no recipe edits), alias-aware search.
- Dashboard: complete/incomplete counts, per-recipe batch and per-item cost, "what's missing" grouped by ingredient.
- Recipe page cost card: ingredient cost, per batch, per cookie/piece/square, optional packaging per item, direct cost per item; clear "Costing incomplete: N ingredients need prices".
- Vanilla extract ↔ vanilla bean paste swap (view/bake only; separate prices; product ratio override).
- Brownies/crispy treats: pans × pieces per pan; choose 9/12/16/24/custom per bake; explicit "update master" creates a revision.
- Editor: ¼-step quantity pickers, unit dropdown with safe conversion, butter sticks/tbsp→grams helper, validation, pan/pieces fields.
- Finish-baking dialog records actual yield, date, multiplier, pieces/portion, storage, notes and a cost snapshot; production history on recipe pages with "use as default yield".
- Recipe photos: take with camera or choose from gallery, compressed, main photo on recipe and library cards, stored locally and in backups.
- Blondies moved to Brownies (one-time migration with revision; imports assign Brownies).
- Subtle smoldering phoenix on the dashboard (CSS only; off with reduced motion or in settings).
- Database v4, backup format 2 (restores format 1). Tests 32 → 61.

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
