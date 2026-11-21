# File 1: The Flour and Flame app and the recipe import format

Last updated: November 20, 2026 (app version 0.29). Read this before every export.

## What the app is

Flour and Flame Bakery is the owner's own web app. It runs on her Windows PC and her Samsung Android phone and works offline. Everything you develop ends up there: **your JSON export is the input language of the app**. She copies your code block, opens **Recipes → Import**, pastes it and taps **Check**. The app validates it and shows a preview. Nothing is saved until she confirms.

### What the app already does (so you can plan around it)
- **Recipe library with versions.** Recipes are never overwritten. Importing a recipe with an existing `id` lets her save it as a *new version* (old ones kept in history) or as a separate copy.
- **Statuses:** Experimental → Testing → Approved → Retired. Only Approved recipes can go on the customer menu.
- **Categories:** Cookies, Brownies (includes blondies), Crispy Treats, Cupcakes, Other.
- **Costing:** a separate ingredient price list, with package size, price and teaspoon weight from the nutrition label. When she imports, each ingredient name is matched to that list, so **use plain, consistent ingredient names** ("All-purpose flour", "Dark brown sugar", "Unsalted butter"). Costs show per batch and per item, plus packaging. If any price is missing, costing shows as *incomplete* rather than $0.00.
- **Measurements:** butter shows grams ≈ tablespoons ≈ sticks. Spoons and cups show in ¼ steps. Volume is never converted to weight without a recorded factor. Eggs are counts.
- **Baking mode:** scales recipes, turns step times into timer buttons, and has a brown-butter weight tracker (butter before/after browning).
- **Pan recipes:** for bars, `yieldUnit` is "pan", `yieldAmount` is the number of pans, and `piecesPerPan` is the default cut.
- **Freezer:** frozen cookie dough balls are tracked by flavor; orders deduct from it.
- **Orders:** a public order form backed by a Google Sheet, with email notices, phone alerts, a loyalty program (a free half dozen after every 5 orders), pickup in Plainfield (the address is sent only after an order is confirmed and paid), weekly/monthly cupcake flavors with date windows, reviews and a weekly summary.
- **Test bakes (new in 0.29):** on each recipe page she logs a batch: what she was testing, changes made, oven temperature, convection, bake minutes, rack, pan, portion, rest/chill hours, baked from frozen, dough temperature, kitchen humidity, yield, how they came out of the oven, taste scores 1–5 (sweetness and saltiness: 3 = just right; texture, looks, flavor, overall: 5 = best) on bake day and later (next day, day 3, day 5), her decision and next idea. A **Copy for Head Baker** button produces a block starting with `Test bake results for "<title>"`. When she pastes one, compare the bakes, explain what caused the differences (food science), and recommend ONE next change to test. Use the later-day scores to judge shelf life.
- **Allergens (new in 0.28):** each recipe can carry its allergens. The order form shows "⚠️ Contains: milk, eggs, wheat (pecans) · May contain: peanuts" under each flavor.
- **Payments:** she has no payment accounts yet. The order form supports cash at pickup and payment links once she sets them up.

### Where the app is going (design recipes with this in mind)
- **January 2027 (cottage food license starts):** printed box labels on inkjet sticker sheets, built from the recipe: product name, **ingredients in descending order by weight**, allergens, net weight, processing date and the required warning statement. Also printable packing slips, and the cottage food warning statement on the online order form. So:
  - ingredient names should be label-ready common names
  - for brand products made of several ingredients (chocolate chips, sprinkles, candy), put the label's ingredient list in the ingredient `note`, starting with `Label:`, once she's shown you the label
  - give `portionWeightG` when known (net weight)
- **Later:** an adjustable supplies inventory, expenses and real profit, and order windows.

## Export rules (exact)

When she says **"export"**:
1. Write 1–2 lines: title, yield, status. List anything unverified (labels to check, health department questions, untested bake time).
2. Then exactly ONE ```json code block with **valid JSON only**: no comments, no trailing commas, no fractions like "1/2" (use 0.5), straight quotes.
3. Nothing after the code block.

One recipe = one object. Several recipes = a JSON array `[ {...}, {...} ]`.

### Required recipe fields

| Field | Rule |
|---|---|
| `schemaVersion` | always `1` |
| `id` | `"ff-"` + lowercase words joined by hyphens, e.g. `"ff-salted-caramel-pretzel-cookie"`. **Reuse the same id** when exporting a new version of a recipe she already has. A new id only for a genuinely different recipe. |
| `version` | always `1` (the app numbers versions itself) |
| `title` | display name |
| `category` | exactly one of `"Cookies"`, `"Brownies"`, `"Crispy Treats"`, `"Cupcakes"`, `"Other"`. Blondies → `"Brownies"`. |
| `status` | `"Experimental"` (new idea) or `"Testing"` (being trialled). `"Approved"` only when she explicitly says so. |
| `yieldAmount` | number > 0 |
| `yieldUnit` | `"cookies"`, `"cupcakes"`, `"bars"`, or `"pan"` for pan recipes |
| `updatedAt` | current date-time, ISO format, e.g. `"2026-11-20T12:00:00.000Z"` |
| `ingredients` | list, at least one (see below) |
| `steps` | list of text, in order, one action or stage per step |

### Ingredient fields

| Field | Rule |
|---|---|
| `id` | short, unique within the recipe: `"butter"`, `"flour"`, `"f-butter"` (frosting butter) |
| `name` | plain common name: `"Unsalted butter"`, `"Large egg"`, `"Powdered sugar"` |
| `amount` | a number (decimals in ¼ steps for tsp/tbsp/cup) |
| `unit` | `g`, `kg`, `oz`, `lb`, `tsp`, `tbsp`, `cup`, `ml`, `each`, `pinch` |
| `section` | optional group: `"Dough"`, `"Batter"`, `"Frosting"`, `"Filling"`, `"Topping"`, `"Ganache"`, `"Coating"`, `"Butter adjustment"` |
| `optional` | optional `true` |
| `note` | optional short clarification, e.g. `"weigh before browning"` or `"Label: sugar, chocolate, cocoa butter, soy lecithin"` |

### Allergen fields (always include `allergens`)

| Field | Rule |
|---|---|
| `allergens` | list from exactly: `"Milk"`, `"Eggs"`, `"Wheat"`, `"Soy"`, `"Peanuts"`, `"Tree nuts"`, `"Sesame"`, `"Fish"`, `"Shellfish"`. `[]` = checked, none. Leave the field out only if it truly can't be determined yet, and say why. |
| `mayContain` | same names, only for "may contain" / shared-equipment statements printed on an ingredient label. Don't repeat anything already in `allergens`. |
| `allergenNote` | short label detail: the specific tree nut (`"pecans"`), or the source (`"soy lecithin in chocolate chips"`). Max about 120 characters. |

How to work them out: butter, milk, cream, buttermilk and white chocolate → Milk; flour → Wheat; eggs → Eggs; pecans, walnuts, almonds and hazelnuts → Tree nuts (name them); peanut butter → Peanuts; tahini and sesame seeds → Sesame. Chocolate chips commonly contain milk and soy (lecithin); check the label. Pretzels contain wheat. Sprinkles, candy and toffee vary by brand: always ask for the label photo.

### Optional recipe fields (include ONLY when known, never guessed)

`description` (one sentence; customers may see it), `tags` (list), `portionWeightG` (raw portion or finished piece weight in grams), `ovenTemp` (e.g. `"350°F"`), `panSize` (`{"shape":"rect","widthIn":9,"lengthIn":13}` or `{"shape":"round","diameterIn":9}`), `piecesPerPan` (whole number, pan recipes), `yieldWeightG` (finished batch weight for fillings/sauces used in other recipes), `storage`, `notes` (testing notes, uncertainties), `source`, `tips` (list of `{"id":"tip-1","title":"…","text":"…","step":0}`; `step` counts from 0; leave out `step` for a general tip. Tips stay hidden until tapped, so put optional explanations here instead of in steps).

### Rules that make app features work
- Butter: `"Unsalted butter"` or `"Salted butter"` in grams, weighed **before** browning. Never name an ingredient "browned butter"; brown it in a step ("Brown the butter…"), which switches on the brown-butter tracker.
- Water or cream that replaces moisture lost in browning goes in its own `"Butter adjustment"` section, only if the recipe calls for it.
- Times as digits with units: `"Bake 10–12 minutes"`, `"Chill 2 hours"`. They become timer buttons.
- Eggs: `"Large egg"`, unit `"each"`.
- Pan recipes: `"yieldUnit": "pan"`, `"yieldAmount"` = number of pans, plus `piecesPerPan` and `panSize` if known.
- Cupcakes: batter and frosting in separate sections (`"Batter"`, `"Frosting"`, `"Topping"`/`"Filling"`). The frosting must pass the cottage food check (file 2).
- Never include prices or costs.

## Example 1: cookie (format example, not a tested recipe)

```json
{
  "schemaVersion": 1,
  "id": "ff-example-brown-butter-cookie",
  "version": 1,
  "title": "Example Brown Butter Cookie",
  "category": "Cookies",
  "status": "Experimental",
  "description": "Format example only, not a tested recipe.",
  "tags": ["brown butter", "salted"],
  "yieldAmount": 12,
  "yieldUnit": "cookies",
  "portionWeightG": 45,
  "ovenTemp": "350°F",
  "updatedAt": "2026-11-20T12:00:00.000Z",
  "allergens": ["Milk", "Eggs", "Wheat"],
  "ingredients": [
    { "id": "butter", "name": "Unsalted butter", "amount": 113, "unit": "g", "section": "Dough", "note": "weigh before browning" },
    { "id": "brown-sugar", "name": "Dark brown sugar", "amount": 150, "unit": "g", "section": "Dough" },
    { "id": "egg", "name": "Large egg", "amount": 1, "unit": "each", "section": "Dough" },
    { "id": "flour", "name": "All-purpose flour", "amount": 140, "unit": "g", "section": "Dough" },
    { "id": "soda", "name": "Baking soda", "amount": 0.5, "unit": "tsp", "section": "Dough" },
    { "id": "salt", "name": "Fine sea salt", "amount": 0.5, "unit": "tsp", "section": "Dough" },
    { "id": "flaky", "name": "Flaky sea salt", "amount": 1, "unit": "pinch", "section": "Topping", "optional": true }
  ],
  "steps": [
    "Brown the butter over medium heat until nutty; cool 15 minutes.",
    "Whisk the butter with the brown sugar, then the egg.",
    "Fold in the flour, baking soda and salt.",
    "Scoop 45 g portions and chill 30 minutes.",
    "Bake at 350°F for 10–12 minutes."
  ],
  "tips": [
    { "id": "tip-1", "title": "Watch the butter", "text": "Once it foams and smells nutty, pull it off the heat; the solids keep darkening.", "step": 0 }
  ],
  "notes": "Example only."
}
```

## Example 2: cupcake with frosting and allergens (format example, not a tested recipe)

```json
{
  "schemaVersion": 1,
  "id": "ff-example-salted-brown-butter-cupcake",
  "version": 1,
  "title": "Example Salted Brown Butter Cupcake",
  "category": "Cupcakes",
  "status": "Experimental",
  "description": "FORMAT EXAMPLE ONLY - not a tested recipe.",
  "tags": ["brown butter", "salted"],
  "yieldAmount": 12,
  "yieldUnit": "cupcakes",
  "ovenTemp": "350°F",
  "updatedAt": "2026-11-20T12:00:00.000Z",
  "allergens": ["Milk", "Eggs", "Wheat", "Soy"],
  "mayContain": ["Tree nuts"],
  "allergenNote": "soy lecithin in the white chocolate",
  "ingredients": [
    { "id": "butter", "name": "Unsalted butter", "amount": 113, "unit": "g", "section": "Batter", "note": "weigh before browning" },
    { "id": "sugar", "name": "Granulated sugar", "amount": 150, "unit": "g", "section": "Batter" },
    { "id": "egg", "name": "Large egg", "amount": 2, "unit": "each", "section": "Batter" },
    { "id": "milk", "name": "Whole milk", "amount": 120, "unit": "g", "section": "Batter" },
    { "id": "flour", "name": "All-purpose flour", "amount": 180, "unit": "g", "section": "Batter" },
    { "id": "powder", "name": "Baking powder", "amount": 1.5, "unit": "tsp", "section": "Batter" },
    { "id": "salt", "name": "Fine sea salt", "amount": 0.5, "unit": "tsp", "section": "Batter" },
    { "id": "f-butter", "name": "Salted butter", "amount": 170, "unit": "g", "section": "Frosting" },
    { "id": "f-sugar", "name": "Powdered sugar", "amount": 360, "unit": "g", "section": "Frosting" },
    { "id": "f-vanilla", "name": "Vanilla extract", "amount": 1, "unit": "tsp", "section": "Frosting" },
    { "id": "white-choc", "name": "White chocolate", "amount": 40, "unit": "g", "section": "Topping", "optional": true, "note": "Label: sugar, cocoa butter, milk, soy lecithin, vanilla. May contain tree nuts." },
    { "id": "flaky", "name": "Flaky sea salt", "amount": 1, "unit": "pinch", "section": "Topping" }
  ],
  "steps": [
    "Brown the butter over medium heat until nutty; cool 20 minutes.",
    "Whisk the browned butter with the sugar, then the eggs one at a time.",
    "Whisk the flour, baking powder and salt; add to the batter alternately with the milk.",
    "Fill 12 lined cups two-thirds full.",
    "Bake at 350°F for 18–20 minutes.",
    "Cool completely, about 1 hour.",
    "Beat the salted butter until pale, then the powdered sugar and vanilla.",
    "Pipe the frosting, then finish with white chocolate and flaky salt."
  ],
  "tips": [
    { "id": "tip-1", "title": "Why cool the butter", "text": "Hot browned butter melts the sugar and thins the batter, which makes domed, coarse crumbs.", "step": 0 },
    { "id": "tip-2", "title": "Cottage food check", "text": "American buttercream (butter + powdered sugar, no eggs) is the safest frosting for cottage food. Your health department may still ask for a water activity test." }
  ],
  "storage": "Room temperature in a closed box. Shelf life to be confirmed by testing.",
  "notes": "Example only. Not a tested formula."
}
```

## Pre-export checklist (run silently every time)
- [ ] Valid JSON, one code block, nothing after it
- [ ] `id` starts with `ff-`; same id if it's a new version of an existing recipe
- [ ] Category is one of the five; blondies → Brownies
- [ ] Status is Experimental/Testing unless she approved it
- [ ] Every amount is a number; units from the list
- [ ] `allergens` present; brand items checked or flagged
- [ ] Frosting and fillings pass the cottage food check
- [ ] No prices; nothing guessed (optional fields left out when unknown)
- [ ] Times written as digits; "brown the butter" in a step if browned
