# Flour and Flame recipe import schema — version 1

The app imports a single recipe object, or a list (`[ ... ]`) of recipe objects, from a `.json` file or pasted text.
Everything is validated and previewed **before** anything is saved. A multi-recipe import is all-or-nothing.
Prices never belong in a recipe file; costs come from the separate ingredient price list.

A complete working example is in `examples/sample-recipe.json`.

## Required fields

| Field | Type | Notes |
|---|---|---|
| `schemaVersion` | `1` | Always the number 1 for this version. |
| `id` | text | Stable id, e.g. `"ff-cocoa-espresso"`. Never reuse an id for a different recipe. |
| `version` | whole number ≥ 1 | The app assigns its own version number on import. |
| `title` | text | |
| `category` | `"Cookies"`, `"Brownies"`, `"Crispy Treats"`, `"Other"` | |
| `status` | `"Experimental"`, `"Testing"`, `"Approved"`, `"Retired"` | Recovered/new recipes should be Experimental or Testing. |
| `yieldAmount` | number > 0 | |
| `yieldUnit` | text | e.g. `"cookies"`, `"bars"`, `"pan"`. |
| `updatedAt` | ISO date text | e.g. `"2026-11-18T00:00:00.000Z"` |
| `ingredients` | list (≥ 1) | See below. |
| `steps` | list of text | Method steps in order. Durations like "10–12 minutes" become timer buttons. |

## Ingredient fields

| Field | Required | Notes |
|---|---|---|
| `id` | yes | Unique within this recipe. |
| `name` | yes | Display name, e.g. `"All-purpose flour"`. |
| `amount` | yes | Number ≥ 0 (use decimals: `0.25`, not `"1/4"`). |
| `unit` | yes | `g`, `kg`, `oz`, `lb`, `tsp`, `tbsp`, `cup`, `ml`, `each`, `stick`, `pinch`… |
| `section` | no | Group heading: `Dough`, `Coating`, `Filling`, `Frosting`, `Topping`, `Ganache`… |
| `optional` | no | `true` for optional ingredients. |
| `note` | no | Short text shown behind an info button on the tile. |
| `catalogIngredientId` | no | Normally omitted; matching happens on the import screen. |

## Optional recipe fields

`description`, `tags` (list of text), `notes`, `source`, `storage`, `ovenTemp` (text),
`portionWeightG` (number), `panSize` (`{"shape":"rect","widthIn":9,"lengthIn":13}` or `{"shape":"round","diameterIn":9}`, optional `thicknessIn`),
`tips` (list of `{"id","title","text","step"}`, where `step` is the 0-based step index; omit for general tips).

Only include `panSize`, `portionWeightG`, yield and temperatures when the source recipe actually states them.

## What happens on import

1. The JSON is checked; any problem is listed and nothing is saved.
2. Each ingredient name is matched to the price list (exact name, then a close-name suggestion) or set to "create new ingredient". **No price is ever required.**
3. If a recipe id already exists, you choose: import as a separate copy (default) or save as a new version (old version kept in history).
4. Confirm: all recipes and new ingredients are saved in one step, or none are.
