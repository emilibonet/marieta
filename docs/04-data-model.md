# Data Model

---

## Entity Relationship Overview

```
Profile  ──1:N──  WeeklyPlan
                     │
                     ├── PlanAssignment (day × slot × sub-slot → Dish)
                     ├── SupplementSchedule
                     ├── ShoppingList
                     └── BatchCookingPlan

Dish  ──N:1──  Component (protein)
Dish  ──N:1──  Component (carb, optional)
Dish  ──N:M──  Component (vegetables, 1–3)
Dish  ──N:1──  Component (fat, optional)
Dish  ──N:1──  FlavorSystem (optional)

Component  ──N:1──  Ingredient
Component  ──N:M──  RetentionFactor (via cooking_method)

FlavorSystem  ──N:M──  Ingredient (key ingredients)
FlavorSystem  ──N:M──  Component (compatibility: proteins, carbs, vegetables)

Ingredient  ←── NutrientVector (embedded)
Component   ←── NutrientVector (derived, cached, with retention factors)
Dish        ←── NutrientVector (derived, cached)
```

---

## Entities

### 1. Ingredient

The fundamental unit — a food item or supplement with a nutritional profile.

| Attribute | Type | Nullable | Constraints | Description |
|---|---|---|---|---|
| `id` | UUID | No | PK | Unique identifier |
| `name` | VARCHAR(255) | No | UNIQUE | Display name |
| `aliases` | TEXT[] | Yes | | Alternative names for search |
| `fdc_id` | INTEGER | Yes | | USDA FoodData Central ID |
| `ciqual_id` | INTEGER | Yes | | Ciqual database ID |
| `nevo_id` | INTEGER | Yes | | NEVO (RIVM) database ID |
| `source` | ENUM('USDA_FDC', 'Ciqual', 'NEVO', 'UserDefined') | No | | Origin of data |
| `serving_model` | ENUM('WeightBased', 'VolumeBased', 'UnitBased') | No | | How portions are measured |
| `nominal_serving_g` | FLOAT | No | > 0 | Grams per one serving (for VolumeBased: derived from nominal_serving_ml × density) |
| `nominal_serving_ml` | FLOAT | Yes | > 0 | Millilitres per one serving (VolumeBased only) |
| `density_g_per_ml` | FLOAT | Yes | > 0 | Density for weight↔volume conversion (VolumeBased only) |
| `nutrients_per_100g` | JSONB | No | | NutrientVector (see below) |
| `nutrient_confidence` | JSONB | Yes | | Map<nutrient_key, float 0–1> |
| `user_overrides` | JSONB | Yes | | NutrientVector of user overrides |
| `shelf_life_days` | INTEGER | Yes | > 0 | Raw ingredient shelf life |
| `component_categories` | TEXT[] | No | ≥ 1 element | ['Protein', 'Carb', 'Vegetable', 'Fat', 'Flavoring'] |
| `protein_quality_factor` | FLOAT | Yes | 0–1 | Amino acid completeness factor |
| `is_supplement` | BOOLEAN | No | Default: false | Whether this is a supplement |
| `is_active` | BOOLEAN | No | Default: true | Soft delete flag |
| `version` | INTEGER | No | Default: 1 | Auto-incremented on update |
| `created_at` | TIMESTAMP | No | Default: now() | |
| `updated_at` | TIMESTAMP | No | Default: now() | |

**Indexes:**
- `idx_ingredient_name` — GIN trigram index on `name` for fuzzy search
- `idx_ingredient_aliases` — GIN index on `aliases`
- `idx_ingredient_fdc_id` — BTREE on `fdc_id` (for ETL dedup)
- `idx_ingredient_ciqual_id` — BTREE on `ciqual_id`
- `idx_ingredient_nevo_id` — BTREE on `nevo_id`
- `idx_ingredient_categories` — GIN on `component_categories`
- `idx_ingredient_active` — BTREE on `is_active`

---

### 2. NutrientVector (Embedded JSONB Structure)

Not a separate table — stored as JSONB in Ingredient, Component, Dish, Profile, and WeeklyPlan.

| Field | Type | Unit | Description |
|---|---|---|---|
| `calories` | FLOAT? | kcal | Energy |
| `protein` | FLOAT? | g | Total protein |
| `carbohydrates` | FLOAT? | g | Total carbohydrates |
| `fats` | FLOAT? | g | Total fats |
| `fiber` | FLOAT? | g | Dietary fiber |
| `iron` | FLOAT? | mg | Iron |
| `calcium` | FLOAT? | mg | Calcium |
| `vitamin_d` | FLOAT? | µg | Vitamin D |
| `vitamin_b12` | FLOAT? | µg | Vitamin B12 |
| `folate` | FLOAT? | µg | Folate (B9) |
| `vitamin_c` | FLOAT? | mg | Vitamin C |
| `vitamin_a` | FLOAT? | µg RAE | Vitamin A |
| `magnesium` | FLOAT? | mg | Magnesium |
| `potassium` | FLOAT? | mg | Potassium |
| `iodine` | FLOAT? | µg | Iodine |
| `zinc` | FLOAT? | mg | Zinc |
| `omega3` | FLOAT? | g | Omega-3 fatty acids |

All fields nullable. A `null` means the value is unknown — excluded from summation and flagged in gap reports.

---

### 3. Component

A batch-prepared preparation from one or more ingredients with fixed serving size and batch properties.

| Attribute | Type | Nullable | Constraints | Description |
|---|---|---|---|---|
| `id` | UUID | No | PK | |
| `name` | VARCHAR(255) | No | UNIQUE | e.g., "Grilled Chicken Breast", "Mashed Potatoes" |
| `category` | ENUM('Protein', 'Carb', 'Vegetable', 'Fat', 'Flavoring') | No | | Primary category |
| `cooking_method` | ENUM('Grilled', 'Baked', 'Steamed', 'Raw', 'Boiled', 'Roasted', 'Sautéed', 'Other') | No | | |
| `standard_serving_g` | FLOAT | No | > 0 | Grams per serving (total cooked weight) |
| `nutrients_per_serving` | JSONB | No | | Derived NutrientVector |
| `storable_days` | INTEGER | No | ≥ 1 | Cooked shelf life (fridge) |
| `freezable` | BOOLEAN | No | Default: false | |
| `prep_time_min` | INTEGER | No | ≥ 0 | |
| `cook_time_min` | INTEGER | No | ≥ 0 | |
| `batch_yield_servings` | INTEGER | No | ≥ 1 | Servings per batch |
| `preparation_graph` | JSONB | Yes | | Structured DAG of preparation steps (see PreparationGraph schema below) |
| `is_active` | BOOLEAN | No | Default: true | Soft delete |
| `created_at` | TIMESTAMP | No | | |
| `updated_at` | TIMESTAMP | No | | |

**Indexes:**
- `idx_component_category` — BTREE on `category`
- `idx_component_active` — BTREE on `is_active`

**Derived field:**
```
nutrients_per_serving = Σ (ingredient_i.effective_nutrients_per_100g × (quantity_i_g_per_serving / 100) × retention_factor[nutrient][cooking_method])
```
where `effective_nutrients_per_100g` = user_overrides merged over nutrients_per_100g (overrides take precedence per field), and `retention_factor` is sourced from the RetentionFactor table (defaults to 1.0 for Raw and for nutrient–method pairs not in the table).

---

### 3b. ComponentIngredient (Join Table)

Links a component to its ingredients with per-ingredient quantities.

| Attribute | Type | Nullable | Constraints | Description |
|---|---|---|---|---|
| `component_id` | UUID | No | FK → Component, PK | |
| `ingredient_id` | UUID | No | FK → Ingredient, PK | |
| `quantity_g_per_serving` | FLOAT | No | > 0 | Grams of this ingredient per one component serving |

**Constraints:**
- A component must have ≥1 row in this table

---

### 4. FlavorSystem

Cuisine-specific sauce/seasoning profile modeled with ingredients.

| Attribute | Type | Nullable | Constraints | Description |
|---|---|---|---|---|
| `id` | UUID | No | PK | |
| `name` | VARCHAR(255) | No | UNIQUE | e.g., "Mediterranean" |
| `cuisine_tag` | VARCHAR(100) | Yes | | e.g., "Italian", "Asian" |
| `batch_cookable` | BOOLEAN | No | Default: true | Can be pre-made |
| `nutrients_per_serving` | JSONB | No | | Computed from key ingredients |
| `preparation_graph` | JSONB | Yes | | Structured DAG of preparation steps (see PreparationGraph schema) |
| `is_active` | BOOLEAN | No | Default: true | |
| `created_at` | TIMESTAMP | No | | |
| `updated_at` | TIMESTAMP | No | | |

**Indexes:**
- `idx_flavor_system_name` — BTREE on `name`

---

### 5. FlavorSystemIngredient (Join Table)

| Attribute | Type | Nullable | Constraints | Description |
|---|---|---|---|---|
| `flavor_system_id` | UUID | No | FK → FlavorSystem, PK | |
| `ingredient_id` | UUID | No | FK → Ingredient, PK | |
| `quantity_g_per_serving` | FLOAT | No | > 0 | Grams of this ingredient per dish serving |

---

### 6. FlavorSystemCompatibility (Join Table)

| Attribute | Type | Nullable | Constraints | Description |
|---|---|---|---|---|
| `flavor_system_id` | UUID | No | FK → FlavorSystem, PK | |
| `component_id` | UUID | No | FK → Component, PK | |

Represents: “this flavor system is compatible with this component.” Used to tag plausible pairings for dish authoring guidance.

---

### 7. Dish

A composed meal — the unit assigned to weekly plan slots.

| Attribute | Type | Nullable | Constraints | Description |
|---|---|---|---|---|
| `id` | UUID | No | PK | |
| `name` | VARCHAR(255) | No | UNIQUE | |
| `dish_role` | ENUM('Main', 'Side', 'Dessert') | No | Default: 'Main' | Role in meal composition |
| `meal_type` | ENUM('Lunch', 'Dinner', 'Both') | No | | |
| `flavor_system_id` | UUID | Yes | FK → FlavorSystem | |
| `total_nutrients` | JSONB | No | | Computed, cached NutrientVector |
| `assembly_minutes` | INTEGER | No | ≥ 0 | Time to assemble from pre-cooked |
| `prep_complexity` | ENUM('Low', 'Medium', 'High') | No | Default: 'Low' | |
| `structural_valid` | BOOLEAN | No | | Computed: meets structural constraints (Main dishes only; Side/Dessert always true) |
| `liked` | BOOLEAN | Yes | | User preference |
| `disliked` | BOOLEAN | Yes | | User preference |
| `last_used_week` | VARCHAR(10) | Yes | | ISO week (e.g., "2026-W16") |
| `preparation_graph` | JSONB | Yes | | Structured DAG of preparation steps (see PreparationGraph schema); for dishes, includes both component sub-recipes and assembly steps |
| `notes` | TEXT | Yes | | |
| `is_active` | BOOLEAN | No | Default: true | |
| `created_at` | TIMESTAMP | No | | |
| `updated_at` | TIMESTAMP | No | | |

**Indexes:**
- `idx_dish_meal_type` — BTREE on `meal_type`
- `idx_dish_role` — BTREE on `dish_role`
- `idx_dish_active` — BTREE on `is_active`
- `idx_dish_liked` — BTREE on `liked`
- `idx_dish_disliked` — BTREE on `disliked`
- `idx_dish_last_used_week` — BTREE on `last_used_week`

---

### 8. DishEntry (Join Table)

Links a dish to its entries — each entry is either a component reference or a direct ingredient.

| Attribute | Type | Nullable | Constraints | Description |
|---|---|---|---|---|
| `id` | UUID | No | PK | |
| `dish_id` | UUID | No | FK → Dish | |
| `entry_type` | ENUM('Component', 'DirectIngredient') | No | | Type of entry |
| `component_id` | UUID | Yes | FK → Component | Set when `entry_type = 'Component'` |
| `ingredient_id` | UUID | Yes | FK → Ingredient | Set when `entry_type = 'DirectIngredient'` |
| `cooking_method` | ENUM('Grilled', 'Baked', 'Steamed', 'Raw', 'Boiled', 'Roasted', 'Sautéed', 'Other') | Yes | | Set when `entry_type = 'DirectIngredient'` |
| `serving_g` | FLOAT | Yes | > 0 | Grams per serving; set when `entry_type = 'DirectIngredient'` |
| `role` | ENUM('Protein', 'Carb', 'Vegetable', 'Fat') | No | | Role in this dish |
| `serving_multiplier` | FLOAT | No | Default: 1.0, > 0 | Multiplier on component's standard_serving_g (component entries only) |

**Constraints:**
- Exactly one of `component_id` or `ingredient_id` must be non-null:
  `CHECK ((component_id IS NOT NULL AND ingredient_id IS NULL) OR (component_id IS NULL AND ingredient_id IS NOT NULL))`
- When `entry_type = 'Component'`: `component_id` must be non-null; `ingredient_id`, `cooking_method`, and `serving_g` must be null.
- When `entry_type = 'DirectIngredient'`: `ingredient_id`, `cooking_method`, and `serving_g` must all be non-null; `component_id` must be null.
  `CHECK ((entry_type = 'DirectIngredient') → (cooking_method IS NOT NULL AND serving_g IS NOT NULL))`
- `serving_multiplier` applies only to component entries: must be null when `entry_type = 'DirectIngredient'`.
- A dish must have ≥1 row with `role = 'Protein'`
- A dish must have ≥2 rows total

**Indexes:**
- `idx_dish_entry_dish` — BTREE on `dish_id`
- `idx_dish_entry_component` — BTREE on `component_id`
- `idx_dish_entry_ingredient` — BTREE on `ingredient_id`

---

### 8b. PreparationGraph (Embedded JSONB Structure)

Not a separate table — stored as JSONB in `preparation_graph` on Component, FlavorSystem, and Dish. Represents a **directed acyclic graph (DAG)** of preparation steps, where edges encode dependencies and independent branches indicate parallelizable work.

**Schema:**

| Field | Type | Description |
|---|---|---|
| `steps` | Array\<Step\> | All preparation steps (nodes of the graph) |
| `edges` | Array\<Edge\> | Dependency edges between steps |

**Step:**

| Field | Type | Nullable | Description |
|---|---|---|---|
| `id` | string | No | Unique step identifier within the graph (e.g., `"s1"`, `"s2"`) |
| `action` | string | No | Verb phrase describing the action (e.g., `"Dice the onion"`, `"Sear chicken breast"`) |
| `inputs` | string[] | Yes | Ingredients or intermediate outputs used by this step |
| `output` | string | Yes | Named intermediate or final result (e.g., `"diced onion"`, `"cooked rice"`) |
| `duration_min` | integer | Yes | Estimated duration in minutes |
| `is_active` | boolean | No | `true` = requires active attention; `false` = passive/unattended (e.g., simmering, marinating, oven baking) |
| `notes` | string | Yes | Optional tips (e.g., `"medium-high heat"`, `"stir every 2 minutes"`) |

**Edge:**

| Field | Type | Description |
|---|---|---|
| `from` | string | Step `id` that must complete first |
| `to` | string | Step `id` that depends on `from` |

**Semantics:**
- Steps with no incoming edges are **entry points** (can start immediately).
- Steps reachable only through independent paths (no shared ancestor edge) can be executed **in parallel**.
- The graph must be acyclic (validated on write).
- For dishes, the graph merges component sub-steps (optionally inlined or referenced) with assembly steps.

**Example** (Pasta Carbonara):
```json
{
  "steps": [
    { "id": "s1", "action": "Boil salted water", "inputs": ["water", "salt"], "output": "boiling water", "duration_min": 10, "is_active": false },
    { "id": "s2", "action": "Cut guanciale into strips", "inputs": ["guanciale"], "output": "guanciale strips", "duration_min": 3, "is_active": true },
    { "id": "s3", "action": "Cook spaghetti in boiling water", "inputs": ["spaghetti", "boiling water"], "output": "cooked spaghetti", "duration_min": 9, "is_active": false },
    { "id": "s4", "action": "Render guanciale in pan until crispy", "inputs": ["guanciale strips"], "output": "crispy guanciale + rendered fat", "duration_min": 7, "is_active": true },
    { "id": "s5", "action": "Whisk egg yolks with pecorino and black pepper", "inputs": ["egg yolk", "pecorino romano", "black pepper"], "output": "egg-cheese mixture", "duration_min": 2, "is_active": true },
    { "id": "s6", "action": "Toss hot spaghetti with guanciale, remove from heat, fold in egg-cheese mixture", "inputs": ["cooked spaghetti", "crispy guanciale + rendered fat", "egg-cheese mixture"], "output": "pasta carbonara", "duration_min": 3, "is_active": true }
  ],
  "edges": [
    { "from": "s1", "to": "s3" },
    { "from": "s2", "to": "s4" },
    { "from": "s3", "to": "s6" },
    { "from": "s4", "to": "s6" },
    { "from": "s5", "to": "s6" }
  ]
}
```
In this graph, s1 (boil water), s2 (cut guanciale), and s5 (whisk egg mixture) have no incoming edges and can begin **in parallel**. s3 depends on s1; s4 depends on s2. The final assembly s6 waits for s3, s4, and s5.

---

### 9. Profile

Planning configuration — nutrient targets, weights, restrictions.

| Attribute | Type | Nullable | Constraints | Description |
|---|---|---|---|---|
| `id` | UUID | No | PK | |
| `name` | VARCHAR(255) | No | UNIQUE | |
| `description` | TEXT | Yes | | |
| `base_reference` | ENUM('EFSA_Male', 'EFSA_Female', 'Custom') | No | | Source of default targets |
| `people_count` | INTEGER | No | ≥ 1, Default: 1 | Scaling factor |
| `weekly_targets` | JSONB | No | | NutrientVector (weekly totals) |
| `nutrient_weights` | JSONB | No | | Map<nutrient_key, float> |
| `planning_mode` | ENUM('Strict', 'Flexible', 'Inventory') | No | Default: 'Strict' | |
| `dietary_restrictions` | TEXT[] | Yes | | e.g., ['vegetarian', 'no-shellfish'] |
| `max_repeats_per_dish` | INTEGER | No | ≥ 0, Default: 1 | Max additional appearances (1 = up to 2 total) |
| `cross_week_variety_weeks` | INTEGER | No | ≥ 0, Default: 3 | Past weeks for variety penalty |
| `is_builtin` | BOOLEAN | No | Default: false | Built-in profiles not deletable |
| `created_at` | TIMESTAMP | No | | |
| `updated_at` | TIMESTAMP | No | | |

---

### 10. WeeklyPlan

A saved weekly meal plan.

| Attribute | Type | Nullable | Constraints | Description |
|---|---|---|---|---|
| `id` | UUID | No | PK | |
| `week_start` | DATE | No | Monday of the week | |
| `profile_id` | UUID | No | FK → Profile | Active profile at time of generation |
| `nutrient_totals` | JSONB | No | | Actual weekly NutrientVector |
| `nutrient_coverage` | JSONB | No | | Map<nutrient_key, float (%)> |
| `supplement_schedule` | JSONB | Yes | | Map<day, Map<nutrient_key, float>> |
| `gap_report` | JSONB | No | | Structured gap analysis |
| `explanations` | JSONB | No | | Array of explanation strings |
| `solver_status` | ENUM('Optimal', 'Feasible', 'Infeasible') | No | | |
| `solver_time_ms` | INTEGER | No | ≥ 0 | |
| `batch_cooking_plan` | JSONB | Yes | | Derived batch cooking plan; null if plan is an unsaved draft. Structure: `{ "session_1_day": "Sunday", "session_2_day": "Wednesday", "session_data": { "sessions": [...] } }` — see Module 11 of functional specs for schema |
| `is_modified` | BOOLEAN | No | Default: false | True if manually swapped post-solve |
| `is_superseded` | BOOLEAN | No | Default: false | True if replaced by a newer plan for the same week |
| `created_at` | TIMESTAMP | No | | |

**Indexes:**
- `idx_weekly_plan_week_active` — Partial unique BTREE on `week_start` WHERE `is_superseded = false` (at most one active plan per week)
- `idx_weekly_plan_profile` — BTREE on `profile_id`
- `idx_weekly_plan_week_start` — BTREE on `week_start` (non-unique, for history queries)

---

### 11. PlanAssignment

Links a weekly plan to dishes at specific day/slot/sub-slot positions.

| Attribute | Type | Nullable | Constraints | Description |
|---|---|---|---|---|
| `plan_id` | UUID | No | FK → WeeklyPlan, PK | |
| `day` | ENUM('Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday') | No | PK | |
| `slot` | ENUM('Lunch', 'Dinner') | No | PK | |
| `sub_slot` | ENUM('Main', 'Side', 'Dessert') | No | PK | |
| `dish_id` | UUID | No | FK → Dish | |
| `is_pinned` | BOOLEAN | No | Default: false | Was this meal pinned by user |
| `explanation` | TEXT | Yes | | Why this dish was selected |

**Constraints:**
- Composite PK: (`plan_id`, `day`, `slot`, `sub_slot`)
- Every plan must have exactly 14 Main assignments (7 days × 2 slots)
- Side and Dessert assignments are optional (0–14 each)
- `dish.dish_role` must match `sub_slot` (e.g., a Side sub-slot must reference a Dish with `dish_role = 'Side'`)

---

### 12. ShoppingListItem

| Attribute | Type | Nullable | Constraints | Description |
|---|---|---|---|---|
| `plan_id` | UUID | No | FK → WeeklyPlan, PK | |
| `ingredient_id` | UUID | No | FK → Ingredient, PK | |
| `total_quantity_g` | FLOAT | No | > 0 | Total grams needed (scaled by people_count) |
| `display_quantity` | VARCHAR(100) | No | | Human-readable: "3 chicken breasts (~480g)" |
| `needed_by_day` | ENUM (day) | No | | Day of first cooking session using this |
| `category` | VARCHAR(50) | No | | Grouping: "Meat & Fish", "Dairy", etc. |

---

### 13. IngredientTag (for dietary restrictions)

| Attribute | Type | Nullable | Constraints | Description |
|---|---|---|---|---|
| `ingredient_id` | UUID | No | FK → Ingredient, PK | |
| `tag` | VARCHAR(100) | No | PK | e.g., "shellfish", "pork", "dairy", "gluten" |

Profile dietary restrictions match against these tags to filter ingredients (and by extension, dishes).

Default tag set (seeded at setup): `meat`, `poultry`, `fish`, `shellfish`, `dairy`, `gluten`, `soy`, `nuts`, `tree-nuts`, `peanuts`, `eggs`, `pork`, `alcohol`, `nightshade`, `legume`, `seed`. User can add custom tags.

---

### 14. EFSAReference (Static/Seed Data)

| Attribute | Type | Nullable | Constraints | Description |
|---|---|---|---|---|
| `id` | UUID | No | PK | |
| `demographic` | ENUM('Adult_Male', 'Adult_Female') | No | | |
| `nutrient_key` | VARCHAR(50) | No | | One of the 17 nutrient keys |
| `daily_pri` | FLOAT | Yes | | Population Reference Intake (daily) |
| `daily_ai` | FLOAT | Yes | | Adequate Intake (daily, if no PRI) |
| `daily_ul` | FLOAT | Yes | | Upper Tolerable Level (daily) |
| `source_year` | INTEGER | No | | Year of EFSA publication |

Used to seed Profile.weekly_targets = daily_pri (or daily_ai) × 7.

---

### 15. RetentionFactor (Static/Seed Data)

USDA Nutrient Retention Factors (Release 6). Applied during component nutrient derivation.

| Attribute | Type | Nullable | Constraints | Description |
|---|---|---|---|---|
| `id` | UUID | No | PK | |
| `nutrient_key` | VARCHAR(50) | No | | One of the 17 nutrient keys |
| `cooking_method` | ENUM('Grilled', 'Baked', 'Steamed', 'Raw', 'Boiled', 'Roasted', 'Sautéed', 'Other') | No | | |
| `food_group` | VARCHAR(100) | Yes | | Optional food group specificity (e.g., “Meat”, “Vegetables”). If null, applies as general default for the method. |
| `retention_factor` | FLOAT | No | 0.0–1.0 | Fraction of nutrient retained after cooking |
| `source` | VARCHAR(100) | No | Default: 'USDA_RF6' | Data source reference |

**Indexes:**
- `idx_retention_lookup` — Unique BTREE on (`nutrient_key`, `cooking_method`, `food_group`)

**Lookup logic**: When computing component nutrients, look up retention factor by (`nutrient_key`, `cooking_method`, `ingredient.food_group`). If no food-group-specific entry exists, fall back to (`nutrient_key`, `cooking_method`, NULL). If no entry at all, default to 1.0.

---

### 16. RecipeImport

Tracks imported recipes and their ingredient matching status.

| Attribute | Type | Nullable | Constraints | Description |
|---|---|---|---|---|
| `id` | UUID | No | PK | |
| `source_url` | VARCHAR(2048) | No | | URL of the recipe page |
| `recipe_name` | VARCHAR(255) | No | | Recipe name extracted (or translated) from the source |
| `source_language` | VARCHAR(10) | Yes | | Auto-detected language of the original recipe (ISO 639-1, e.g., `es`, `fr`, `en`) |
| `raw_data` | JSONB | No | | Raw extracted recipe data (Stage 1 output — unprocessed ingredient lines, instructions) |
| `extraction_method` | ENUM('SchemaOrg', 'HtmlHeuristic', 'Manual') | No | | How raw data was extracted from the page |
| `llm_normalized_data` | JSONB | Yes | | Gemma 4 LLM output (Stage 2): translated names, parsed quantities/units, preparations, cooking method, component hints, dish role hint, preparation graph |
| `llm_normalization_status` | ENUM('Pending', 'Success', 'Retry', 'Failed') | No | Default: 'Pending' | Whether LLM normalization succeeded |
| `dish_id` | UUID | Yes | FK → Dish | Created dish (null if import not yet finalized) |
| `match_status` | ENUM('Pending', 'Partial', 'Complete', 'Failed') | No | Default: 'Pending' | Ingredient matching status |
| `match_details` | JSONB | Yes | | Per-ingredient match results: auto-matched, fuzzy-suggested, unmatched |
| `imported_at` | TIMESTAMP | No | Default: now() | |

**Indexes:**
- `idx_recipe_import_status` — BTREE on `match_status`
- `idx_recipe_import_dish` — BTREE on `dish_id`

**`llm_normalized_data` schema** (Pydantic-validated):
```json
{
  "recipe_name_en": "Pasta Carbonara",
  "source_language": "it",
  "cooking_method": "Sautéed",
  "dish_role_hint": "Main",
  "ingredients": [
    {
      "original_text": "200 g de guanciale tagliato a listarelle",
      "name": "guanciale",
      "quantity": 200,
      "unit": "g",
      "preparation": "cut into strips",
      "component_hint": "direct_ingredient"
    }
  ],
  "preparation_graph": {
    "steps": [
      { "id": "s1", "action": "Boil salted water", "inputs": ["water", "salt"], "output": "boiling water", "duration_min": 10, "is_active": false },
      { "id": "s2", "action": "Cut guanciale into strips", "inputs": ["guanciale"], "output": "guanciale strips", "duration_min": 3, "is_active": true },
      { "id": "s3", "action": "Cook spaghetti in boiling water", "inputs": ["spaghetti", "boiling water"], "output": "cooked spaghetti", "duration_min": 9, "is_active": false },
      { "id": "s4", "action": "Render guanciale in pan until crispy", "inputs": ["guanciale strips"], "output": "crispy guanciale + rendered fat", "duration_min": 7, "is_active": true },
      { "id": "s5", "action": "Whisk egg yolks with pecorino and black pepper", "inputs": ["egg yolk", "pecorino romano", "black pepper"], "output": "egg-cheese mixture", "duration_min": 2, "is_active": true },
      { "id": "s6", "action": "Toss hot spaghetti with guanciale, remove from heat, fold in egg-cheese mixture", "inputs": ["cooked spaghetti", "crispy guanciale + rendered fat", "egg-cheese mixture"], "output": "pasta carbonara", "duration_min": 3, "is_active": true }
    ],
    "edges": [
      { "from": "s1", "to": "s3" },
      { "from": "s2", "to": "s4" },
      { "from": "s3", "to": "s6" },
      { "from": "s4", "to": "s6" },
      { "from": "s5", "to": "s6" }
    ]
  }
}
```

---

## Relationship Summary

| Relationship | Type | Description |
|---|---|---|
| Ingredient → Component (via ComponentIngredient) | N:M | One ingredient can be used in multiple components; a component can have multiple ingredients |
| Component → Dish (via DishEntry) | N:M | Components reused across dishes |
| Ingredient → Dish (via DishEntry) | N:M | Ingredients can be used directly in dishes (cooked at meal time) |
| FlavorSystem → Ingredient (via FlavorSystemIngredient) | N:M | Flavor systems composed of ingredients |
| FlavorSystem → Component (via FlavorSystemCompatibility) | N:M | Compatibility links |
| Dish → FlavorSystem | N:1 | A dish has at most one flavor system |
| Profile → WeeklyPlan | 1:N | Each plan uses one profile |
| WeeklyPlan → Dish (via PlanAssignment) | N:M | 14 required Main + optional Side/Dessert assignments per plan |
| WeeklyPlan → ShoppingListItem | 1:N | Derived from plan |
| WeeklyPlan → BatchCookingPlan | 1:1 (embedded JSONB) | Derived from plan; stored on WeeklyPlan row |
| Ingredient → IngredientTag | 1:N | Tags for dietary restriction filtering |
| RetentionFactor → Component | N:M | Retention factors applied during nutrient derivation (by cooking_method) |
| RetentionFactor → DishEntry (DirectIngredient) | N:M | Retention factors applied to direct ingredients at dish level |
| RecipeImport → Dish | N:1 | Imported recipe linked to the dish it created |

---

## Conversion Ratios (Seed Data)

Stored as application constants or in a `conversion_ratios` table:

| Ingredient Category | Dry-to-Cooked Ratio | Notes |
|---|---|---|
| Lentils | 1:2.5 | 100g dry → 250g cooked |
| Chickpeas | 1:2.0 | 100g dry → 200g cooked |
| Black beans | 1:2.3 | |
| White rice | 1:3.0 | 100g dry → 300g cooked |
| Brown rice | 1:2.5 | |
| Quinoa | 1:2.7 | |
| Pasta | 1:2.2 | |
| Oats | 1:2.5 | |
| Bulgur | 1:2.8 | |
| Couscous | 1:1.5 | |

---

## Protein Quality Factors (Seed Data)

| Source Category | Factor | Notes |
|---|---|---|
| Animal proteins (meat, fish, eggs, dairy) | 1.0 | Complete amino acid profile |
| Soy, quinoa | 0.9 | Complete plant protein |
| Legumes + grains (same dish) | 0.85 | Complementary combination |
| Legumes (alone) | 0.65 | Limited methionine |
| Nuts/seeds | 0.55 | Limited lysine |
| Grains (alone) | 0.5 | Limited lysine |
