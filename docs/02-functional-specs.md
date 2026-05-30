# Functional Specifications

---

## Module 1 — Nutritional Data Pipeline

### 1.1 Description

Ingests, normalizes, and stores nutritional data from external authoritative sources into the internal database. Provides the foundational data layer upon which all planning depends.

### 1.2 Data Sources

| Source | Dataset | Format | Size (approx.) | Update Frequency | Priority |
|---|---|---|---|---|---|
| CIQUAL (ANSES) | ~3,500 European foods | Excel/CSV | ~15 MB | Every 2–3 years | 1 — Primary |
| USDA FoodData Central | SR Legacy (~8,700 foods) + Foundation Foods (~2,100 foods) | JSON (bulk download) | ~300 MB raw | Annually | 2 — Secondary |
| NEVO (RIVM) | ~2,100 Dutch foods | Excel/CSV | ~10 MB | Every 2–3 years | 3 — Tertiary |
| EFSA Dietary Reference Values | Reference intakes by demographic | Structured constants | Hardcoded | Manual update when EFSA publishes | Reference |
| Open Food Facts | Branded/packaged products (optional) | REST API (JSON) | Per-query | Real-time | Optional |

### 1.3 ETL Process

1. **Extract**: Download bulk files (CIQUAL Excel, USDA JSON, NEVO Excel) and place in a designated import directory
2. **Transform**:
   - Normalize all nutrient values to a unified schema: `NutrientVector` (17 fields, all per 100g)
   - Convert units: all to g/mg/µg per 100g
   - Map nutrient IDs from source-specific codes to internal nutrient keys
   - Handle missing values: set to `null`, assign `nutrient_confidence = 0.0` for that field
   - Assign confidence levels:
     - `high` (0.8–1.0): USDA Foundation Foods (lab-verified), CIQUAL (ANSES lab data)
     - `medium` (0.5–0.79): USDA SR Legacy, NEVO
     - `low` (0.0–0.49): imputed, estimated, or user-entered without verification
   - Deduplicate with source priority: CIQUAL > USDA Foundation Foods > USDA SR Legacy > NEVO. When the same food exists in multiple sources, prefer the highest-priority source. CIQUAL is the European standard and takes precedence for all European food varieties. USDA is used as a gap-filler for foods not covered by CIQUAL (especially non-European foods). NEVO provides additional Dutch food coverage.
3. **Load**: Upsert into `ingredients` table with source attribution and version tracking

### 1.4 Nutrient Vector Schema

The following 17 nutrients are tracked system-wide:

| # | Nutrient | Internal Key | Unit | Category |
|---|---|---|---|---|
| 1 | Energy | `calories` | kcal | Macro |
| 2 | Protein | `protein` | g | Macro |
| 3 | Carbohydrates | `carbohydrates` | g | Macro |
| 4 | Fats (total) | `fats` | g | Macro |
| 5 | Fiber | `fiber` | g | Micro |
| 6 | Iron | `iron` | mg | Micro |
| 7 | Calcium | `calcium` | mg | Micro |
| 8 | Vitamin D | `vitamin_d` | µg | Micro |
| 9 | Vitamin B12 | `vitamin_b12` | µg | Micro |
| 10 | Folate (B9) | `folate` | µg | Micro |
| 11 | Vitamin C | `vitamin_c` | mg | Micro |
| 12 | Vitamin A | `vitamin_a` | µg RAE | Micro |
| 13 | Magnesium | `magnesium` | mg | Micro |
| 14 | Potassium | `potassium` | mg | Micro |
| 15 | Iodine | `iodine` | µg | Micro |
| 16 | Zinc | `zinc` | mg | Micro |
| 17 | Omega-3 fatty acids | `omega3` | g | Micro |

### 1.5 Live API Lookup (Optional)

- When a user searches for an ingredient not in the local database, the system queries USDA FDC API (and optionally Open Food Facts)
- Results cached in Redis with a 30-day TTL
- User can import a result into their local ingredient library
- Rate limiting: respect USDA API limits (max 1,000 requests/hour with API key)

### 1.6 Business Rules

- ETL is idempotent: re-running does not duplicate data
- User overrides are never overwritten by ETL re-runs
- Version number increments on each ETL import; previous versions preserved in an audit trail
- Ingredients with `source = UserDefined` are never modified by ETL

### 1.7 Error Handling

- If a source file is malformed: abort import for that source, log error, notify user
- If a nutrient field cannot be parsed: set to `null`, confidence = 0.0, flag in import report
- If deduplication is ambiguous: import both entries, flag for manual resolution

---

## Module 2 — Ingredient Library

### 2.1 Description

Central registry of all foods and supplements available for meal planning. Each ingredient carries a full nutritional profile, serving model, and metadata.

### 2.2 User-Facing Behavior

- **Browse**: Paginated list with search (name, alias, category), filterable by source, category, confidence
- **Search**: Fuzzy text search across name and aliases; optionally trigger live USDA FDC API lookup
- **Add**: User creates a new ingredient manually or imports from USDA/CIQUAL/NEVO search result
- **Edit**: User can override any nutritional value; overrides tracked separately from source data
- **Delete**: Soft delete; ingredient marked inactive; cannot delete if referenced by active components

### 2.3 Serving Size Model

All nutritional data is stored **per 100g** (or per 100ml for liquids, using density for conversion). Serving sizes define the default portion used when adding an ingredient to a component or dish.

| Food Category | Serving Basis | Unit | Weight Source | Example |
|---|---|---|---|---|
| Meat (chicken, beef, pork, lamb) | User-defined per serving | g | User input | Chicken breast = 160g |
| Fish & seafood | User-defined per serving | g | User input | Salmon fillet = 140g |
| Eggs | Per unit | g | DB average | 1 large egg = 60g |
| Dairy — solid (yogurt, cheese) | Per 100g or user-defined | g | User input or DB | Greek yogurt = 150g/serving |
| Dairy — liquid (milk, cream) | Per 100ml or user-defined | ml | User input or DB | Milk = 200ml/serving |
| Vegetables (whole countable) | Per unit | g | DB average | Carrot = 80g, Tomato = 120g |
| Vegetables (leafy/bulk) | Per 100g, user specifies serving | g | User defines | Spinach = 80g/serving |
| Legumes (dry weight) | Per 100g dry | g | Fixed conversion ratios | Lentils: 1:2.5 dry→cooked |
| Grains (dry weight) | Per 100g dry | g | Fixed conversion ratios | Rice: 1:3 dry→cooked |
| Oils & fats — liquid | Per tablespoon (15ml) | ml | DB standard | Olive oil = 15ml/tbsp (13.5g) |
| Oils & fats — solid (butter, coconut oil) | Per 100g or user-defined | g | User input or DB | Butter = 10g/serving |
| Sauces & liquid condiments | Per tablespoon (15ml) or user-defined | ml | User input or DB | Soy sauce = 15ml/tbsp |
| Supplements | Per unit/tablet | unit | User input | Vitamin D3: 25µg/tablet |
| Nuts & seeds | Per 100g or user-defined portion | g | User input or DB | Pumpkin seeds = 30g/serving |

For volume-based ingredients, the system stores a **density** value (g/ml) to convert between weight and volume. Nutritional calculations always use weight (grams); volume is for display and user input convenience.

### 2.4 Multi-Category Ingredients

Ingredients may belong to multiple component categories. The system tracks category contributions with caveats:

- **Legumes**: categories `[Protein, Carb]`. Protein contribution flagged with: "Incomplete essential amino acid profile — protein quality lower than animal sources"
- **Nuts/Seeds**: categories `[Fat, Protein]`. Protein contribution secondary
- **Dairy**: categories vary by product (`[Protein]` for Greek yogurt, `[Fat, Protein]` for cheese)
- **Whole grains**: categories `[Carb, Fiber]`

Caveats are displayed in the UI when the ingredient is used in a dish context and affect how the optimizer weighs protein quality (see Module 6).

### 2.5 Business Rules

- Ingredient names must be unique within the user's library
- Nutritional values per 100g must be non-negative; calories > 0 (except for supplements with 0 kcal)
- At least one component category must be assigned
- `nutrient_confidence` auto-assigned by source; editable by user
- Shelf life is optional; if absent, temporal validation skips this ingredient

### 2.6 Edge Cases

- **Duplicate ingredient names**: Reject; prompt user to use aliases or rename
- **Ingredient with all nutrients null**: Accepted but flagged as "nutritionally uncharacterized" — gap report includes it
- **Deletion of referenced ingredient**: Blocked; user must first remove from all components and dish direct ingredient entries

---

## Module 3 — Component Library

### 3.1 Description

Components are batch-prepared building blocks of dishes — preparations made from one or more ingredients with a fixed cooking method, standard serving size, batch yield, and derived nutritional profile. Components range from simple single-ingredient preparations (grilled chicken breast, steamed rice) to multi-ingredient sub-recipes (mashed potatoes, samfaina, hummus).

### 3.2 User-Facing Behavior

- **Browse/Search**: List by category, ingredient, cooking method
- **Create**: Select one or more ingredients with quantities → define cooking method → set standard serving size → set batch yield → set shelf life
- **Edit**: Modify any field; nutritional profile auto-recalculated from ingredient data × quantities × serving size
- **Delete**: Soft delete; blocked if referenced by active dishes

### 3.3 Component Categories

| Category | Description | Examples |
|---|---|---|
| Protein | Primary protein source | Grilled chicken breast, baked salmon, boiled eggs |
| Carb | Primary carbohydrate source | Steamed rice, boiled quinoa, roasted potatoes |
| Vegetable | Cooked or raw vegetables | Steamed broccoli, roasted peppers, raw spinach |
| Fat | Primary fat/caloric-density source | Olive oil dressing, avocado half, cheese portion |
| Flavoring | Sauces, spice blends, condiments | Lemon-herb sauce, tikka masala paste, pesto |

### 3.4 Nutritional Derivation

For single-ingredient components:
```
component.nutrients_per_serving = ingredient.nutrients_per_100g × (serving_quantity_g / 100) × retention_factor[nutrient][cooking_method]
```

For multi-ingredient components:
```
component.nutrients_per_serving = Σ (ingredient_i.nutrients_per_100g × (quantity_i_g_per_serving / 100) × retention_factor[nutrient][cooking_method])
```

Retention factors are sourced from USDA Nutrient Retention Factor tables (Release 6). Each nutrient–cooking method pair has a retention factor between 0 and 1 (e.g., Vitamin C + Boiled = 0.50, Iron + Grilled = 0.95). If no retention factor exists for a given pair, a default of 1.0 (no loss) is used. Components with `cooking_method = 'Raw'` always use retention factor 1.0.

For ingredients with cooking conversion ratios (legumes, grains):
```
cooked_weight = dry_weight × conversion_ratio
nutrients_per_serving = ingredient.nutrients_per_100g_dry × (dry_equivalent_of_serving / 100) × retention_factor[nutrient][cooking_method]
```

### 3.5 Batch Preparation Properties

| Property | Description | Constraint |
|---|---|---|
| `prep_time_min` | Time to prepare raw ingredients | ≥ 0 |
| `cook_time_min` | Active cooking time | ≥ 0 |
| `batch_yield_servings` | Number of servings per batch | ≥ 1 |
| `storable_days` | Shelf life once cooked (refrigerated) | ≥ 3 for batch-cookable components |
| `freezable` | Whether the component freezes well | Boolean |

### 3.6 Business Rules

- Every component must reference at least one ingredient
- `standard_serving_g` is context-independent (fixed per component definition); **portion adjustments happen at the dish level** (see Module 4)
- Components with `storable_days < 3` and `freezable = false` are flagged as incompatible with batch cooking
- A component appearing in a weekly plan must appear in ≥3 meals that week (enforced by optimizer, not by component library)

---

## Module 4 — Dish Library

### 4.1 Description

Dishes are composed meals assembled from **components** (batch-prepared) and/or **direct ingredients** (cooked at meal time). They are the primary units assigned to weekly plan slots. Dishes enter the library via **two paths**: manual creation or import from recipe websites. Each dish has a **dish role**: Main, Side, or Dessert.

Dish entries are one of two types:
- **Component reference**: A batch-cooked item from the component library. Nutrition is pre-computed and cached on the component.
- **Direct ingredient**: An ingredient cooked at meal time (e.g., pan-seared salmon, fried egg). The dish specifies the ingredient, cooking method, and serving size. Nutrition is computed at the dish level using retention factors. Direct ingredients do not appear in the batch cooking plan.

### 4.1b Dish Roles

Each dish has a `dish_role` that determines how it is used in meal composition:

| Role | Description | Examples | Structural Constraints |
|---|---|---|---|
| Main | Primary composed dish — the core of a meal | Grilled chicken with quinoa and broccoli, Salmon with rice | Full structural validity (protein, fiber, micronutrient requirements) |
| Side | Optional shareable complement (light, often vegetable-based) | Green salad, steamed vegetables, bread | No structural validity; must contain ≥1 entry (component or direct ingredient) |
| Dessert | Optional light finish to a meal | Fresh fruit, yogurt, fruit salad | No structural validity; must contain ≥1 entry (component or direct ingredient) |

Side and Dessert dishes are created manually or imported from recipe sources.

### 4.1c Recipe Import

Dishes can be imported from recipe websites. The import pipeline has two stages: **raw extraction** and **LLM normalization**.

#### Stage 1 — Raw Extraction

The user provides a URL. The system fetches the page and extracts recipe data:

- **Schema.org path** (preferred): parse `Recipe` JSON-LD or Microdata from the page.
- **HTML fallback**: heuristic extraction of title, ingredient list, and instruction blocks.
- If neither produces a usable result, the user is notified and can retry or enter the recipe manually.

The output of Stage 1 is raw, unstructured text — ingredient lines like `"1 vaso de caldo de pollo"`, `"2 tbsp EVOO"`, or `"200 g de pechuga de pollo cortada en dados"`.

#### Stage 2 — LLM Normalization (Gemma 4)

The raw extracted data is sent to a locally-hosted **Gemma 4** model (via an OpenAI-compatible API) with a structured prompt. The LLM performs the following in a single pass:

1. **Translation**: Translate all ingredient names and instructions to English (source language auto-detected).
2. **Ingredient parsing**: Decompose each raw ingredient line into:
   - `name` — canonical English ingredient name (e.g., `"chicken breast"`, `"extra-virgin olive oil"`)
   - `quantity` — numeric value
   - `unit` — standardized to metric (`g`, `mL`, `L`, `kg`); imperial and colloquial units (cups, tbsp, “a glass of”, “a pinch of”) converted using standard culinary equivalences
   - `preparation` — detected prep method (e.g., `"diced"`, `"minced"`, `"grated"`), or `null`
   - `original_text` — the verbatim source line (preserved for audit)
3. **Cooking method detection**: Infer the primary cooking method for the dish from the instructions (`Grilled`, `Baked`, `Steamed`, `Boiled`, `Roasted`, `Sautéed`, `Raw`, `Other`), aligned with the `cooking_method` enum used by retention factors.
4. **Preparation graph construction**: Parse the recipe instructions into a **directed acyclic graph (DAG)** of preparation steps (see PreparationGraph schema in data model). Each node is a step with an action, inputs, output, estimated duration, and active/passive flag. Edges encode dependencies between steps. Steps with no shared dependency can be executed **in parallel**. This allows the UI to visualize which tasks the cook can perform simultaneously (e.g., boiling water while chopping vegetables).
5. **Component candidacy hints**: For each ingredient, suggest whether it is a likely **batch-cookable component** (e.g., steamed rice, grilled chicken) or a **direct ingredient** (e.g., a squeeze of lemon, a fried egg), based on typical meal-prep patterns. This is a suggestion — the user makes the final assignment.
6. **Dish role hint**: Suggest `Main`, `Side`, or `Dessert` based on ingredient composition and calorie density.

The LLM output is validated against a **Pydantic schema** (strict JSON mode). If the output fails schema validation, the system retries once with a corrective prompt. If it still fails, the raw extraction is presented to the user with a warning that automatic normalization was unsuccessful.

#### Stage 3 — Ingredient Matching

After LLM normalization, each parsed ingredient is fuzzy-matched against the local ingredient library:

- Exact matches: auto-linked
- Fuzzy matches (similarity ≥ 80%): suggested for user confirmation
- No match: user must map to an existing ingredient or create a new one

#### Stage 4 — Review & Dish Creation

The user reviews the full import:

1. Verify/correct ingredient matches and create missing ingredients
2. Confirm or override each ingredient’s entry type (component reference vs. direct ingredient)
3. Confirm or override cooking method, dish role, meal type
4. On finalization: components created (if needed), dish assembled, nutritional profile computed from local ingredient data with retention factors

**Nutritional Validation**: The imported dish’s nutrient profile is computed from matched ingredients’ nutritional data (with cooking retention factors applied), not from the recipe source’s stated nutrition label.

This ensures all dishes in the library — whether manually created or imported — have consistent, trustworthy nutritional profiles derived from the same authoritative data sources.

### 4.2 Dish Composition

Each dish consists of entries, where each entry is either a component reference or a direct ingredient:

| Slot | Required | Count | Description |
|---|---|---|---|
| Protein source | Yes | 1 | Component or direct ingredient; primary protein source |
| Carb source | No | 0–1 | Component or direct ingredient; primary carbohydrate source |
| Vegetable sources | Yes (≥1) | 1–3 | Components or direct ingredients; fiber and micronutrient sources |
| Fat source | No | 0–1 | Component or direct ingredient; caloric density, essential fats |
| Flavor system | No | 0–1 | Sauce/seasoning profile |

### 4.3 Structural Validity Constraints

Structural validity applies only to Main dishes. Side and Dessert dishes are exempt.

A Main dish is structurally valid if and only if:

1. It contains ≥1 protein source (component or direct ingredient)
2. It contains ≥1 fiber-containing source (vegetable, legume, or whole grain component/ingredient with fiber ≥ 3g/serving)
3. It contains ≥1 micronutrient-dense source (defined as contributing ≥15% of weekly target for any Tier 1 or Tier 2 nutrient per serving)

Structural validity is computed and cached on dish creation/edit. Invalid dishes are flagged but not rejected (user may be building iteratively).

### 4.4 Dish Authoring

Dishes enter the library via two paths:

1. **Manual creation**: User selects components and/or direct ingredients, assigns a dish role and meal type, and saves.
2. **Recipe import**: User provides a recipe URL; the system extracts, matches, and creates the dish (see Section 4.1c).

In both cases the system validates structure and displays a real-time nutritional summary.

### 4.5 Serving Size at Dish Level

For component entries, the dish specifies a **serving multiplier**:

```
dish_component_serving_g = component.standard_serving_g × multiplier
```

Default multiplier = 1.0. User can adjust per component within a dish (e.g., "double the rice in this dish").

For direct ingredient entries, the dish specifies the **serving size in grams** directly, along with the cooking method:

```
direct_ingredient_nutrients = ingredient.nutrients_per_100g × (serving_g / 100) × retention_factor[nutrient][cooking_method]
```

The dish's total nutritional profile is the sum of all entry nutritional profiles (components at their adjusted serving sizes + direct ingredients at their specified serving sizes).

### 4.6 Meal Type Classification

- Each dish is tagged as `Lunch`, `Dinner`, or `Both`
- User assigns classification manually
- Default heuristic (suggested, user can override):
  - Total calories > 650 kcal → suggest `Dinner`
  - Assembly time > 15 min → suggest `Dinner`
  - Otherwise → suggest `Both`

### 4.7 Preference Tracking

| Field | Type | Description |
|---|---|---|
| `liked` | bool? | User explicitly liked this dish |
| `disliked` | bool? | User explicitly disliked this dish |
| `last_used_week` | ISO week string? | Last week this dish was assigned in a plan |
| `notes` | string? | Free-text notes |

### 4.8 Business Rules

- Dish names must be unique
- A dish must have at least 2 entries (protein source + one other), each being a component or direct ingredient
- Disliked dishes are excluded from future plan generation unless the user explicitly re-enables them
- Liked dishes receive a positive bonus in the optimizer objective function
- When a component is deleted, all dishes referencing it become invalid and are flagged for review
- When an ingredient used as a direct ingredient entry is deleted, all dishes referencing it become invalid and are flagged for review

### 4.9 Edge Cases

- **All components from same ingredient**: Valid but flagged as "low variety"
- **Dish with 0 calories**: Rejected (likely misconfiguration)
- **Multiple proteins in one dish**: Allowed (e.g., surf-and-turf); both count toward protein coverage
- **No carb component**: Valid if structural constraints are met (low-carb-friendly)

---

## Module 5 — Flavor Systems

### 5.1 Description

Flavor systems model cuisine-specific seasoning and sauce profiles as first-class entities with their own ingredients, nutritional contributions, and compatibility rules. They are ingredient-modeled (not just metadata tags).

### 5.2 Structure

A flavor system consists of:

- **Key ingredients** (e.g., olive oil, garlic, lemon, soy sauce, ginger) — each a reference to an ingredient in the ingredient library
- **Standard quantities per serving** for each key ingredient
- **Nutritional contribution**: computed as sum of all key ingredients at their standard quantities
- **Compatibility matrix**: which proteins, carbs, and vegetables this flavor system pairs well with
- **Batch-cookable flag**: whether the sauce/blend can be prepared in advance

### 5.3 User-Facing Behavior

- **Browse**: List of defined flavor systems with cuisine tag
- **Create**: Select key ingredients, define quantities, assign compatibility
- **Edit**: Modify ingredients, quantities, compatibility
- **Delete**: Soft delete; blocked if referenced by active dishes

### 5.4 Business Rules

- A flavor system must have ≥1 key ingredient
- Nutritional contributions are included in dish totals when the flavor system is assigned to a dish
- Compatibility is bidirectional: if FlavorSystem X is compatible with Protein Y, then Y appears as compatible with X in the dish authoring UI
- Multiple flavor systems can share key ingredients (e.g., garlic appears in Mediterranean and Asian)

---

## Module 6 — Constraint Solver / Optimization Engine

### 6.1 Description

The core planning engine. Formulates weekly meal planning as a Mixed-Integer Linear Program (MILP) and solves it to guaranteed optimality using Google OR-Tools CP-SAT.

### 6.2 MILP Formulation

**Sets:**

- $D$ = days \{Monday, …, Sunday\}
- $S$ = slots \{Lunch, Dinner\}
- $R$ = sub-slots \{Main, Side, Dessert\}
- $M$ = set of eligible Main dishes (filtered by meal type, availability, preferences, exclusions)
- $M_{\text{side}}$ = set of eligible Side dishes
- $M_{\text{dessert}}$ = set of eligible Dessert dishes
- $\mathcal{N}$ = set of 17 tracked nutrients
- $\mathcal{C}$ = set of components used across all eligible dishes

**Decision Variables:**

| Variable | Domain | Meaning |
|---|---|---|
| $x_{d,s,m}$ | $\{0, 1\}$ | 1 if Main dish $m$ is assigned to day $d$, slot $s$ |
| $y_{d,s,m}$ | $\{0, 1\}$ | 1 if Side dish $m$ is assigned to day $d$, slot $s$ |
| $z_{d,s,m}$ | $\{0, 1\}$ | 1 if Dessert dish $m$ is assigned to day $d$, slot $s$ |
| $\text{used}_c$ | $\{0, 1\}$ | 1 if component $c$ appears in any assigned dish this week |
| $\delta^+_\nu$ | $\geq 0$ | Positive deviation of nutrient $\nu$ from weekly target |
| $\delta^-_\nu$ | $\geq 0$ | Negative deviation of nutrient $\nu$ from weekly target |
| $\text{supp}_{d,\nu}$ | $\geq 0$ | Supplement contribution for nutrient $\nu$ on day $d$ |

**Hard Constraints:**

1. **Exactly one Main dish per slot**:
$$\sum_{m \in M} x_{d,s,m} = 1 \quad \forall d \in D, \; s \in S$$

2. **At most one Side dish per slot** (optional):
$$\sum_{m \in M_{\text{side}}} y_{d,s,m} \leq 1 \quad \forall d \in D, \; s \in S$$

3. **At most one Dessert per slot** (optional):
$$\sum_{m \in M_{\text{dessert}}} z_{d,s,m} \leq 1 \quad \forall d \in D, \; s \in S$$

4. **Meal type compatibility**:
$$x_{d,\text{Lunch},m} = 0 \;\text{ if } m.\text{meal\_type} = \text{Dinner}$$
$$x_{d,\text{Dinner},m} = 0 \;\text{ if } m.\text{meal\_type} = \text{Lunch}$$
(Analogous constraints apply to $y$ and $z$ variables.)

5. **Main dish repetition cap** (default: same dish ≤2 times/week):
$$\sum_{d \in D} \sum_{s \in S} x_{d,s,m} \leq \text{maxRep}_m \quad \forall m \in M$$
where $\text{maxRep}_m = 1 + \text{profile.max\_repeats\_per\_dish}$

6. **Component reuse** (if used, must appear in ≥3 meals):
$$\sum_{d,s} \left( \sum_{m : c \in m} x_{d,s,m} + \sum_{m : c \in m} y_{d,s,m} + \sum_{m : c \in m} z_{d,s,m} \right) \geq 3 \cdot \text{used}_c \quad \forall c \in \mathcal{C}$$

**Interpretation**: If component $c$ is used anywhere in the week (i.e., appears in at least one assigned dish across Main, Side, or Dessert), then *dishes containing $c$* must appear in at least 3 of the 14 meal slots (7 days × Lunch/Dinner). This ensures batch-cooked components are worth the preparation effort — a component cooked for only 1–2 meals is flagged as inefficient. Side and Dessert assignments count toward the 3-meal minimum. The constraint does not apply to direct ingredients (which are cooked at meal time, not batch-prepared).

7. **Component activation**:
$$\text{used}_c \geq x_{d,s,m} \quad \forall d, s, m : c \in m$$
$$\text{used}_c \geq y_{d,s,m} \quad \forall d, s, m : c \in m$$
$$\text{used}_c \geq z_{d,s,m} \quad \forall d, s, m : c \in m$$

8. **Supplement daily cap**:
$$0 \leq \text{supp}_{d,\nu} \leq \text{suppMax}_\nu \quad \forall d \in D, \; \nu \in \mathcal{N}$$
where $\text{suppMax}_\nu$ is derived from the supplement ingredient's per-unit value (0 if no supplement defined for that nutrient)

9. **Pinned meals** (user-locked assignments):
$$x_{d,s,m} = 1 \quad \text{for each pinned Main } (d, s, m)$$
(Analogous pin constraints for $y$ and $z$ variables.)

**Nutrient Balance:**

$$\sum_{d,s,m} x_{d,s,m} \cdot n_{m,\nu} + \sum_{d,s,m} y_{d,s,m} \cdot n_{m,\nu} + \sum_{d,s,m} z_{d,s,m} \cdot n_{m,\nu} + \sum_d \text{supp}_{d,\nu} = T_\nu + \delta^+_\nu - \delta^-_\nu \quad \forall \nu \in \mathcal{N}$$

where:
- $n_{m,\nu}$ = total nutrient $\nu$ content in dish $m$ (sum of all components at their serving sizes, including flavor system, with retention factors applied)
- $T_\nu$ = weekly target for nutrient $\nu$ (from active profile × `people_count`)

**Objective Function (Minimization):**

$$\min \quad \underbrace{\sum_{\nu \in \mathcal{N}} w_\nu \cdot \frac{\delta^+_\nu + \delta^-_\nu}{T_\nu}}_{\text{Nutritional deviation}} - \underbrace{\lambda_{\text{var}} \cdot \text{VarietyScore}}_{\text{Variety bonus}} - \underbrace{\lambda_{\text{pref}} \cdot \sum_{d,s,m} x_{d,s,m} \cdot \text{liked}_m}_{\text{Preference bonus}} + \underbrace{\lambda_{\text{xweek}} \cdot \sum_{d,s,m} x_{d,s,m} \cdot \text{recentUsePenalty}_m}_{\text{Cross-week repetition penalty}}$$

Where:
- $w_\nu$ = profile-specific nutrient weight (Tier 1: 3.0, Tier 2: 2.0, Tier 3: 1.0 by default)
- $\lambda_{\text{var}}, \lambda_{\text{pref}}, \lambda_{\text{xweek}}$ = mode-dependent coefficients
- $\text{VarietyScore}$ = number of unique Main dishes selected
- $\text{liked}_m$ = 1 if dish $m$ is liked, 0 otherwise
- $\text{recentUsePenalty}_m$ = 1 if dish $m$ was used in the past $N$ weeks (configurable, default 3), 0 otherwise

**Mode-Dependent Coefficients:**

| Mode | $\lambda_{\text{var}}$ | $\lambda_{\text{pref}}$ | $\lambda_{\text{xweek}}$ | Nutrient weights |
|---|---|---|---|---|
| Strict | 0.5 | 0.3 | 0.5 | Full tier weights |
| Flexible | 1.0 | 0.5 | 0.3 | Tier 3 × 0.3 |
| Inventory | 0.3 | 0.3 | 0.2 | Full tier weights |

### 6.3 Solving

- Solver: Google OR-Tools CP-SAT
- Time limit: 10 seconds (returns best feasible solution if optimum not proven in time)
- Expected solve time: < 2 seconds for libraries of ≤1,000 dishes (Main + Side + Dessert combined)
- Returns: `Optimal`, `Feasible` (time limit hit but solution found), or `Infeasible`

### 6.4 Post-Solve Operations

1. **Nutrient coverage computation**: For each nutrient, compute `actual / target × 100%`
2. **Gap report generation**: Flag nutrients below 90% coverage; compute minimal interventions
3. **Supplement schedule extraction**: For each day/nutrient where `supp_{d,ν} > 0`, generate recommendation
4. **Explainability annotations**: For each selected dish, compute its top nutrient contributions and generate explanation strings
5. **Batch cooking plan derivation**: Group selected components from all assigned dishes (Main + Side + Dessert) into 2 cooking sessions based on shelf life constraints. Direct ingredient entries are excluded from batch sessions (they are cooked at meal time).
6. **Shopping list generation**: Aggregate ingredient quantities across all selected dishes (Main + Side + Dessert) × `people_count`, including both component ingredients and direct ingredients

### 6.5 Manual Swap (Post-Solve)

When the user manually replaces a dish in the plan:

1. System accepts the swap
2. Recalculates weekly nutrient totals (no re-solve; simple arithmetic)
3. Updates gap report
4. Flags any newly-violated constraints (e.g., component reuse drops below 3)
5. Marks plan as "Modified" (no longer guaranteed optimal)

### 6.6 Infeasibility Handling

If the solver returns `Infeasible`:

1. System relaxes constraints in priority order:
   a. Component reuse constraint (≥3 → ≥2 → ≥1)
   b. Tier 3 nutrient weights → 0
   c. Tier 2 nutrient weights halved
2. Re-solves after each relaxation step
3. Reports which constraints were relaxed and why
4. User can accept the relaxed plan or adjust inputs

### 6.7 Protein Quality Modeling

For ingredients with category `Protein` that have incomplete essential amino acid profiles (e.g., legumes):

- A protein quality factor $q_m \in [0, 1]$ is assigned:
  - Animal proteins: $q = 1.0$
  - Soy, quinoa: $q = 0.9$ (complete plant protein)
  - Legumes: $q = 0.65$
  - Grains: $q = 0.5$
  - Nuts/seeds: $q = 0.55$
- Effective protein contribution: $\text{protein}_{\text{eff}} = \text{protein}_{\text{raw}} \times q$
- Complementary combinations (e.g., legumes + grains in same dish) can receive a bonus: $q_{\text{combined}} = 0.85$
- This factor is used in the optimizer's protein nutrient balance constraint

---

## Module 7 — Planning Profiles

### 7.1 Description

Profiles define the user's nutritional targets, optimization preferences, dietary restrictions, and planning mode. Multiple profiles can exist; one is active at a time.

### 7.2 Built-In Profiles

| Profile | Base Reference | Key Weight Adjustments | Calorie Strategy |
|---|---|---|---|
| Balanced Adult (Male) | EFSA PRI, adult male | Default tier weights | At EFSA reference |
| Balanced Adult (Female) | EFSA PRI, adult female | Default tier weights | At EFSA reference |
| Weight Loss | EFSA PRI, user-selected sex | Calories ×4, Protein ×3, Fiber ×2 | User-defined deficit % |
| Muscle Gain | EFSA PRI, user-selected sex | Protein ×4, Calories ×2 | User-defined surplus % |


### 7.3 Default Nutrient Importance Tiers

| Tier | Weight | Nutrients | Rationale |
|---|---|---|---|
| 1 — Critical | 3.0 | Calories, Protein, Iron, Vitamin B12, Vitamin D | Deficiency has acute/serious health impact |
| 2 — Important | 2.0 | Calcium, Folate, Omega-3, Zinc, Iodine | Common deficiency risks, especially in European diets |
| 3 — Beneficial | 1.0 | Fiber, Magnesium, Potassium, Vitamin C, Vitamin A, Carbohydrates, Fats | Important but typically easier to meet from varied diet |

### 7.4 Profile Customization

User can:

- Fork any built-in profile to create a custom profile
- Adjust individual nutrient targets (absolute values)
- Adjust individual nutrient weights
- Set dietary restrictions: list of tags (e.g., `vegetarian`, `no-shellfish`, `no-pork`, `no-dairy`)
  - Restrictions filter available dishes before solver runs
- Set `people_count` (integer ≥ 1): scales all shopping and portion quantities
- Set `max_repeats_per_dish` (default 1 = dish can appear ≤2 times/week)
- Set `cross_week_variety_weeks` (default 3): how many past weeks to penalize for repetition
- Set planning mode: Strict / Flexible / Inventory

### 7.5 Business Rules

- At least one profile must exist at all times
- Deleting the last profile is blocked
- The active profile is selected at the start of each planning session
- Profile changes do not retroactively modify existing plans

---

## Module 8 — Weekly Planner

### 8.1 Description

The primary planning interface. A calendar grid (Monday–Sunday × Lunch/Dinner) where the user configures inputs, generates an optimized plan, reviews it, and optionally modifies it.

### 8.2 Planning Session Workflow

1. **Select profile**: Choose active profile (or fork one)
2. **Set available components**: Select which components from the library are available this week (drives the set of eligible dishes)
3. **Pin meals** (optional): Lock specific day/slot/dish combinations before solving
4. **Exclude dishes** (optional): Mark specific dishes as excluded this week
5. **Temporary target adjustments** (optional): One-time overrides to nutrient targets (e.g., "+15% carbs this week") — not saved to profile
6. **Generate plan**: Click button → backend runs MILP → returns optimized plan in ≤5 seconds
7. **Review**: Calendar grid shows assigned dishes with key nutritional highlights; nutrient dashboard shows coverage
8. **Manual swaps** (optional): User replaces individual dishes; system recalculates coverage without full re-solve
9. **Save plan**: Lock and persist the plan; generates shopping list and batch cooking plan

### 8.3 Calendar Grid

| | Monday | Tuesday | Wednesday | Thursday | Friday | Saturday | Sunday |
|---|---|---|---|---|---|---|---|
| **Lunch — Main** | Dish | Dish | Dish | Dish | Dish | Dish | Dish |
| **Lunch — Side** | (optional) | (optional) | (optional) | (optional) | (optional) | (optional) | (optional) |
| **Lunch — Dessert** | (optional) | (optional) | (optional) | (optional) | (optional) | (optional) | (optional) |
| **Dinner — Main** | Dish | Dish | Dish | Dish | Dish | Dish | Dish |
| **Dinner — Side** | (optional) | (optional) | (optional) | (optional) | (optional) | (optional) | (optional) |
| **Dinner — Dessert** | (optional) | (optional) | (optional) | (optional) | (optional) | (optional) | (optional) |

Each Main cell is required. Side and Dessert cells are optional and can be left empty or assigned by the optimizer/user.

Each cell shows:
- Dish name
- Primary protein
- Calorie count
- Top 2 nutrient contributions (abbreviated)
- Pin icon (if pinned)
- Color-coded border: green (nutritionally strong), yellow (adequate), red (low coverage contribution)

### 8.4 Post-Generation Interactions

- **Click dish**: Expand to see full nutritional breakdown + explainability annotation
- **Swap dish**: Open dish picker (filtered by meal type + structural validity); select replacement; system recalculates
- **Remove dish**: Clear slot → leaves a gap → nutrient coverage recalculated → gap report updated
- **Pin/unpin**: Toggle pin status; re-generate respects pins

### 8.5 Business Rules

- A plan must have all 14 Main slots filled (7 days × 2 meals) to be saveable; Side and Dessert slots may be empty
- A plan cannot be saved if `solver_status = Infeasible` (unless the user explicitly acknowledges reduced coverage)
- Only one plan per week; generating a new plan for the same week overwrites the unsaved draft
- Saved plans are immutable; to modify, user creates a new plan for that week

---

## Module 9 — Dish Substitution

### 9.1 Description

When a user marks a Main dish as unavailable (e.g., missing ingredient), the system suggests nutritionally-similar Main dish alternatives.

### 9.2 Similarity Metric

Cosine similarity on normalized nutrient vectors:

$$\text{sim}(A, B) = \frac{\vec{n}_A \cdot \vec{n}_B}{\|\vec{n}_A\| \cdot \|\vec{n}_B\|}$$

where $\vec{n}_X$ is the 17-dimensional nutrient vector of dish $X$, normalized by weekly targets (so each dimension is comparable).

### 9.3 Ranking

Alternatives are ranked by composite score:

$$\text{score} = 0.6 \cdot \text{sim} + 0.3 \cdot \text{liked} - 0.1 \cdot \text{recentUsePenalty}$$

### 9.4 User-Facing Behavior

1. User clicks "Substitute" on a dish in the weekly plan
2. System computes top 3 alternatives (filtered by meal type, structural validity, available components)
3. Each alternative shows: name, similarity %, nutrient comparison table (side by side)
4. User selects one → replaces the dish → coverage recalculated
5. Substitution reason logged: "Substituted [Dish A] → [Dish B]: similar Protein/Iron/Omega-3 profile"

### 9.5 Business Rules

- Only structurally-valid Main dishes are offered as alternatives
- Disliked dishes are excluded from alternatives
- If no suitable alternative exists (similarity < 0.5 for all candidates), system notifies user and suggests modifying component availability

---

## Module 10 — Nutrient Gap Diagnostics

### 10.1 Description

Analyzes the current weekly plan and identifies underrepresented nutrients, quantifies gaps, and suggests minimal interventions.

### 10.2 Gap Classification

| Coverage | Status | Color |
|---|---|---|
| ≥95% | OK | Green |
| 80–94% | Mild gap | Yellow |
| 60–79% | Significant gap | Orange |
| <60% | Critical gap | Red |

### 10.3 Per-Meal Contribution Breakdown

For each nutrient, the system shows which meals contribute the most:
- Stacked bar chart: 14 meals on x-axis, nutrient contribution on y-axis
- Helps user identify which meals to swap to improve coverage

### 10.4 Minimal Intervention Suggestions

When a gap is detected, the system suggests the smallest change that improves coverage:

1. **Component addition**: "Add 30g pumpkin seeds to 3 meals → closes Zinc gap by 68%"
2. **Dish swap**: "Replace Dish X on Wednesday lunch with Dish Y → improves Iron by 22%"
3. **Supplement**: "Take 1 Vitamin D3 tablet (25µg) daily → closes Vitamin D gap"

Priority: prefer food-based interventions over supplements; prefer minimal changes.

### 10.5 Business Rules

- Gap report is auto-generated on every plan generation and after every manual swap
- Supplement recommendations only appear when food-based interventions are insufficient or would require >3 dish changes
- Intervention suggestions are ranked by: gap closure % / number of changes required

---

## Module 11 — Batch Cooking Plan

### 11.1 Description

Auto-generates a two-session cooking schedule from the weekly plan, assigning components to cooking sessions based on shelf life and usage patterns.

### 11.2 Session Assignment Logic

1. **Session 1** (default: Sunday): Components used on Monday–Wednesday
2. **Session 2** (default: Wednesday): Components used on Thursday–Saturday
3. **Sunday overflow**: Components used on Sunday are assigned to the session whose cooking day + `storable_days` can reach Sunday. If neither session's components can reach Sunday without exceeding `storable_days`, the component is flagged for a third mini-session or the user is prompted to adjust the session day (e.g., move Session 2 to Thursday).
4. **Freezable components**: Assigned to Session 1 by default (cook once, freeze, thaw as needed); exempt from shelf-life constraints.
5. **Short shelf-life components** (`storable_days ≤ 3`): Must be assigned to the session whose cooking day is closest to (and before) their first use day.

### 11.3 Output Format

Per session:
- List of components to prepare
- Per component: ingredient quantity needed, batch yield, prep + cook time, storage instructions
- Total estimated time for the session
- Equipment needed (if modeled)

Per component:
- Which days it will be used
- Storage method (refrigerate / freeze)

### 11.4 User Overrides

- User can change session days (e.g., Saturday + Tuesday instead of Sunday + Wednesday)
- User can move components between sessions manually
- System validates shelf-life constraints after any manual change

---

## Module 12 — Shopping List

### 12.1 Description

Auto-generated from the weekly plan, aggregating all required ingredients across all dishes, scaled by `people_count`.

### 12.2 Computation

```
For each ingredient:
  total_g = Σ (component.standard_serving_g × dish.multiplier × appearances × profile.people_count)
```

### 12.3 Display Format

Grouped by ingredient category (Meat & Fish, Dairy, Vegetables, Grains & Legumes, Oils & Fats, Other):

| Ingredient | Quantity | Display | Needed By |
|---|---|---|---|
| Chicken breast | 960g | "6 pieces (~960g)" | Sunday |
| Broccoli | 640g | "~3 heads" | Sunday |

### 12.4 Business Rules

- Quantities rounded up to practical purchase units (e.g., you can't buy 0.7 of a chicken breast — round to whole units)
- "Needed By" = day of the cooking session where the ingredient is first used
- Ingredients already flagged as "in inventory" excluded from purchase quantities (future Inventory Mode feature — see PRD Nice-to-Have; not implemented in MVP)
---

## Module 13 — Recipe & Assembly View

### 13.1 Description

Provides step-by-step instructions for both batch cooking of components and daily assembly of dishes.

### 13.2 Recipe Structure

**For a dish:**

Recipes are stored as a **preparation graph** (DAG) rather than a flat list of steps. The graph encodes dependencies between steps, enabling the UI to show which tasks can be performed in parallel.

1. **Assembly overview**: List of components needed (pre-cooked) and direct ingredients to cook, their states, and assembly time
2. **Preparation graph visualization**: The DAG is rendered as a visual flow showing:
   - **Parallel lanes**: Independent branches displayed side-by-side (e.g., "boil water for pasta" alongside "prepare sauce")
   - **Merge points**: Steps that depend on multiple predecessors clearly shown as convergence nodes
   - **Active vs. passive steps**: Passive steps (simmering, baking, marinating) visually distinguished — the cook knows they can start other tasks during these
   - **Time estimates**: Per-step and critical-path total time displayed
   - **Critical path**: The longest dependency chain highlighted, giving the minimum total cook time
3. **Component sub-recipes**: For each component, an expandable section with its own preparation graph:
   - Ingredients (from the batch, with quantity for one serving)
   - Sub-graph of prep and cooking steps
   - Storage instructions (for batch context)
4. **Direct ingredient cooking notes**: For each direct ingredient entry, cooking method, time, and any prep instructions (integrated into the main graph as nodes)
5. **Nutritional summary**: Per-dish nutrient table
6. **Flat view fallback**: A linearized topological-sort view of the graph is always available for users who prefer a simple numbered step list

### 13.3 Batch Cooking Instructions

Per component in a cooking session:

1. Ingredient: name, total quantity for the batch
2. Preparation graph for the component (showing parallelizable prep and cooking steps)
3. Cooling and storage instructions
4. Expected yield: "X servings, use over Y days"

When multiple components are batch-cooked in the same session, the system **merges their preparation graphs** into a combined session graph, maximizing parallelism across components (e.g., while one component simmers, start prepping another).

### 13.4 Business Rules

- Preparation graphs are validated as acyclic on save (no circular dependencies)
- Assembly instructions distinguish between pre-cooked components and direct ingredients that need cooking at meal time
- Component sub-recipes are accessible but collapsed by default — expanded on user click
- Direct ingredient entries are integrated as nodes in the dish's preparation graph
- Preparation graph is user-editable per dish/component (add/remove/reorder steps; add/remove edges)
- A linearized (topological sort) view is always available as an alternative to the graph view
- Passive steps are visually distinct (dashed borders or muted color) to signal parallelization opportunity

---

## Module 14 — Explainability

### 14.1 Description

Every optimizer decision is annotated with a human-readable explanation of why it was made.

### 14.2 Annotation Types

| Context | Template | Example |
|---|---|---|
| Dish selection | "Selected to increase {nutrient} (contributes {X}% of weekly target)" | "Selected to increase Iron (contributes 18% of weekly target) and Folate (11%)" |
| Dish exclusion | "Excluded: {reason}" | "Excluded: marked as disliked" |
| Substitution | "Replaced {A} with {B}: {similarity}% nutritional similarity; {reason}" | "Replaced Salmon with Sardines: 94% similarity; better Omega-3 profile" |
| Supplement | "Vitamin D supplement recommended: food plan covers {X}% of target" | "Vitamin D supplement recommended: food plan covers only 34% of target" |
| Gap | "{Nutrient} at {X}%: {explanation}" | "Iodine at 61%: only iodized salt among selected components contains significant iodine" |
| Constraint relaxation | "Relaxed {constraint}: {reason}" | "Relaxed component reuse to ≥2: insufficient dish variety for 3-use requirement" |

### 14.3 Implementation

- Annotations generated in the post-solve phase (Module 6.4)
- Stored as JSON array per plan
- Displayed inline in the weekly planner (per dish) and in the nutrient dashboard (per nutrient)

---

## Module 15 — Temporal Planning & Shelf-Life Validation

### 15.1 Description

Ensures that no component is served beyond its shelf life from the cooking session in which it was prepared.

### 15.2 Validation Rules

For each component $c$ assigned to day $d$:

- Let $\text{cook\_day}(c)$ = the day of the cooking session where $c$ is prepared
- Constraint: $d - \text{cook\_day}(c) \leq c.\text{storable\_days}$
- Exemption: if $c.\text{freezable} = \text{true}$, no shelf-life constraint applies

### 15.3 Integration

- Added as **soft constraints** to the MILP with a high penalty weight (10× standard nutrient deviation weight). This allows the solver to violate shelf life if no feasible assignment exists, rather than returning Infeasible.

- **Post-solve**: if any component's shelf-life constraint is violated, the batch cooking plan derivation step (Module 6.4, step 5) attempts to reassign the component to a later session. If reassignment resolves the violation, the plan is updated and the user is notified of the session change.

- If reassignment cannot resolve the violation (e.g., no session late enough to cover Sunday), the component is flagged with a warning: *"X cannot be prepared far enough in advance for its Sunday use. Consider freezing or replacing with a longer-lasting alternative."*

- **Freezable components are exempt**: the constraint is not applied if `c.freezable = true`.

---

## Module 16 — Export

### 16.1 PDF Export

Generated via WeasyPrint. Contents:

1. **Cover page**: Week dates, profile name, people count
2. **Weekly calendar grid**: Same layout as UI, with dish names and calorie counts
3. **Daily detail pages**: Per day — dishes, assembly instructions (condensed), nutrient contributions
4. **Nutrient summary page**: Coverage bars for all 17 nutrients, gap report
5. **Shopping list page**: Grouped by category, quantities
6. **Batch cooking plan page**: Two-session schedule with component details

### 16.2 ODS Export

Generated via odfpy. Sheets:

1. **Weekly Plan**: Calendar grid with dish names, calories, protein per cell
2. **Nutrient Breakdown**: 17 rows × columns (target, actual, %, status)
3. **Shopping List**: Ingredient, quantity, display, needed-by
4. **Ingredient Library**: Full export of user's ingredient library (for offline reference/editing — not re-importable)

### 16.3 Business Rules

- Export available only for saved plans
- PDF optimized for A4 landscape (calendar grid) and A4 portrait (detail pages)
- ODS cell formatting: color-coded nutrient coverage cells (green/yellow/orange/red)

---

## Module 17 — Authentication

### 17.1 Description

Simple single-user authentication via local password.

### 17.2 Behavior

- On first launch: user creates a password (minimum 8 characters)
- On subsequent launches: login screen with password field
- Session persists via HTTP-only secure cookie (or JWT stored in httpOnly cookie)
- Session timeout: configurable (default 7 days)
- Password change: accessible from settings

### 17.3 Security

- Password stored as bcrypt hash in PostgreSQL
- No password recovery mechanism (single-user local deployment — if lost, reset via CLI command)
- All API endpoints require valid session (except `/auth/login` and `/auth/setup`)
- CSRF protection via token
- Rate limiting on login: max 10 attempts per minute

---

## Module 18 — Plan History

### 18.1 Description

Browse and reference past weekly plans for cross-week variety tracking and comparison.

### 18.2 User-Facing Behavior

- List of past weeks (newest first) with summary: coverage %, dish count
- Click to view a past plan in read-only calendar grid
- Compare current plan vs. a past plan (side-by-side nutrient coverage)
- Cross-week variety: dishes used in the past N weeks are highlighted in the dish picker

### 18.3 Business Rules

- Past plans are immutable
- Plan history is used by the optimizer's cross-week variety penalty (Module 6)
- Plan history is prunable: user can delete old plans to save space
