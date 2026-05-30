# User Stories

All stories assume a single user role: **Planner** (the sole user of the system).

---

## US-1 — Nutritional Data Pipeline

### US-1.1 — Initial Data Import

> As a Planner, I want to import nutritional data from CIQUAL, USDA FoodData Central, and NEVO at setup so that I have a comprehensive ingredient database to work with.

**Acceptance Criteria:**

- [ ] System provides a CLI or admin command to trigger CIQUAL + USDA FDC + NEVO ETL
- [ ] After import, the ingredient library contains ~3,500 CIQUAL + ~8,700 USDA SR Legacy + ~2,100 Foundation Foods + ~2,100 NEVO entries
- [ ] All entries have normalized NutrientVector (17 fields, per 100g)
- [ ] Missing nutrient fields are set to `null` with confidence = 0.0
- [ ] Duplicate foods between sources are deduplicated (CIQUAL preferred as primary, then USDA Foundation Foods, then USDA SR Legacy, then NEVO)
- [ ] Import report shows: total imported, duplicates resolved, fields with low confidence
- [ ] Re-running the import is idempotent (no duplicates created)

### US-1.2 — Live Ingredient Lookup

> As a Planner, I want to search for ingredients not in my local database via the USDA FDC API so that I can add new foods without waiting for a full re-import.

**Acceptance Criteria:**

- [ ] Search field in ingredient library triggers live API query after local results
- [ ] API results distinguished visually from local results
- [ ] User can import an API result into their local library with one click
- [ ] Imported result cached in Redis (30-day TTL)
- [ ] Rate limits respected; user notified if limit exceeded

---

## US-2 — Ingredient Library

### US-2.1 — Browse and Search Ingredients

> As a Planner, I want to browse and search my ingredient library by name, category, or source so that I can find ingredients quickly.

**Acceptance Criteria:**

- [ ] Paginated list of ingredients with columns: name, categories, source, calories, protein, confidence
- [ ] Fuzzy text search across name and aliases
- [ ] Filters: source (CIQUAL/USDA/NEVO/UserDefined), category (Protein/Carb/Vegetable/Fat/Flavoring), confidence level
- [ ] Sort by: name, calories, protein
- [ ] Results load in < 500ms for libraries up to 15,000 entries

### US-2.2 — Add Custom Ingredient

> As a Planner, I want to manually add an ingredient with its nutritional profile so that I can include foods not in any external database.

**Acceptance Criteria:**

- [ ] Form with fields: name, aliases, serving model (weight-based/unit-based), nominal serving weight, all 17 nutrient fields, shelf life, categories, is_supplement flag
- [ ] All nutrient fields default to `null` (user fills what they know)
- [ ] Confidence auto-set to `low` for user-defined entries (overridable)
- [ ] Validation: name unique, at least one category assigned, calories ≥ 0
- [ ] On save, ingredient immediately available in component library

### US-2.3 — Edit Ingredient

> As a Planner, I want to override specific nutritional values of an external ingredient so that I can correct inaccuracies.

**Acceptance Criteria:**

- [ ] User can edit any nutrient field; overrides stored separately from source data
- [ ] Original source values still visible alongside overrides
- [ ] Version number incremented on edit
- [ ] Override can be reverted to source value individually

### US-2.4 — Delete Ingredient

> As a Planner, I want to remove an ingredient from my library so that I can keep it clean.

**Acceptance Criteria:**

- [ ] Soft delete (ingredient marked inactive, not physically removed)
- [ ] Deletion blocked if ingredient is referenced by any active component — error message lists dependent components
- [ ] Deleted ingredients hidden from searches by default; toggle to show inactive

### US-2.5 — Multi-Category Ingredients

> As a Planner, I want to assign multiple categories to an ingredient (e.g., legumes as both Protein and Carb) so that the system accurately models their dual contribution.

**Acceptance Criteria:**

- [ ] Ingredients can have 1+ categories
- [ ] Category-specific caveats displayed when relevant (e.g., "Incomplete essential amino acid profile" for legumes as protein)
- [ ] Optimizer uses protein quality factor for multi-category protein sources

---

## US-3 — Component Library

### US-3.1 — Create Component

> As a Planner, I want to define a cooking component from one or more ingredients so that I can use it as a batch-prepared building block for dishes.

**Acceptance Criteria:**

- [ ] Select one or more ingredients with quantities per serving → choose cooking method → set standard serving size (g) → set batch yield → set shelf life → set freezable flag → set prep/cook times
- [ ] Nutritional profile per serving auto-computed from ingredient data × quantities × retention factors (based on cooking method)
- [ ] For multi-ingredient components: nutritional profile is the sum of all ingredient contributions
- [ ] Retention factors sourced from USDA Nutrient Retention Factor tables; displayed per nutrient
- [ ] For legumes/grains: dry-to-cooked conversion ratios applied automatically
- [ ] Component saved and immediately available in dish library

### US-3.2 — Browse Components

> As a Planner, I want to browse and filter components by category and ingredient so that I can find available building blocks.

**Acceptance Criteria:**

- [ ] List with columns: name, category, ingredient, serving size, calories/serving, protein/serving, shelf life
- [ ] Filter by category (Protein/Carb/Vegetable/Fat/Flavoring)
- [ ] Search by name or ingredient name

### US-3.3 — Edit Component

> As a Planner, I want to edit a component's properties so that I can adjust serving sizes or cooking methods.

**Acceptance Criteria:**

- [ ] All fields editable
- [ ] Nutritional profile recalculated automatically on serving size change
- [ ] Dependent dishes flagged for recalculation

### US-3.4 — Delete Component

> As a Planner, I want to remove a component so that I can clean up unused building blocks.

**Acceptance Criteria:**

- [ ] Soft delete
- [ ] Blocked if referenced by active dishes — error lists dependent dishes
- [ ] Deletion of ingredient also blocked if used as direct ingredient in any dish

---

## US-4 — Flavor Systems

### US-4.1 — Create Flavor System

> As a Planner, I want to define a flavor system (sauce/seasoning profile) from ingredients so that I can model sauces as nutritionally-contributing components.

**Acceptance Criteria:**

- [ ] Select key ingredients, define quantity per serving for each
- [ ] Nutritional contribution computed as sum of key ingredients at defined quantities
- [ ] Set compatibility: which proteins, carbs, and vegetables this pairs well with
- [ ] Set batch-cookable flag
- [ ] Flavor system available for dish assignment

### US-4.2 — Edit Flavor System

> As a Planner, I want to modify a flavor system's composition and compatibility so that I can refine my sauce profiles.

**Acceptance Criteria:**

- [ ] All fields editable; nutritional profile recalculates
- [ ] Compatibility changes immediately affect dish generation candidates

---

## US-5 — Dish Library

### US-5.1 — Manual Dish Creation

> As a Planner, I want to manually compose a dish from components and/or direct ingredients so that I can create specific recipes.

**Acceptance Criteria:**

- [ ] Select dish role: Main, Side, or Dessert
- [ ] For each entry, choose: component reference (from library) OR direct ingredient (select ingredient + cooking method + serving size in grams)
- [ ] For Main dishes: must include protein source (required), can include carb, vegetables (1–3), fat, flavor system
- [ ] For Side/Dessert dishes: ≥1 entry (no structural constraints)
- [ ] Adjust serving multiplier per component entry (default 1.0); adjust serving grams per direct ingredient entry
- [ ] Real-time nutritional summary updates as entries are added (with retention factors applied)
- [ ] Structural validity indicator for Main dishes (green checkmark / red warning)
- [ ] Classify as Lunch / Dinner / Both (system suggests based on calorie heuristic)

### US-5.2 — Edit Dish

> As a Planner, I want to modify an existing dish's components or properties so that I can refine my recipes.

**Acceptance Criteria:**

- [ ] Add/remove/swap entries (components or direct ingredients); adjust serving multipliers/sizes
- [ ] Nutritional profile recalculates automatically
- [ ] Structural validity re-evaluated
- [ ] Change meal type classification

### US-5.3 — Like / Dislike Dish

> As a Planner, I want to mark dishes as liked or disliked so that the optimizer respects my preferences.

**Acceptance Criteria:**

- [ ] Toggle liked / disliked / neutral per dish
- [ ] Disliked dishes excluded from future plan generation (unless re-enabled)
- [ ] Liked dishes receive optimizer bonus
- [ ] Preference persists across sessions

### US-5.4 — Define Preparation Steps

> As a Planner, I want to define structured preparation steps for a dish as a graph so that I can see which tasks can be done in parallel during cooking.

**Acceptance Criteria:**

- [ ] Preparation is a directed acyclic graph (DAG): each step has an action, inputs, output, duration, and active/passive flag
- [ ] Steps are connected by dependency edges; steps without shared dependencies can be performed in parallel
- [ ] Graph editor allows adding/removing steps and edges visually
- [ ] Graph validated as acyclic on save
- [ ] Active vs. passive steps visually distinguished (passive = unattended, e.g., simmering, baking)
- [ ] A linearized (topological sort) flat view is always available as an alternative
- [ ] Preparation graph visible in daily view and recipe view

### US-5.5 — Import Dishes from Recipe Websites

> As a Planner, I want to import dishes from recipe websites so that my dish library contains culinarily-valid meals with accurate nutritional profiles.

**Acceptance Criteria:**

- [ ] Provide a recipe URL; system extracts recipe data via Schema.org Recipe structured data (JSON-LD / Microdata) or HTML heuristic parsing
- [ ] Extracted raw data is normalized by Gemma 4 LLM: ingredient names translated to English, quantities parsed and converted to metric units, preparation methods detected, cooking method inferred, preparation steps structured as a DAG (showing parallelizable tasks)
- [ ] If LLM normalization fails, raw extraction is shown with a warning; user can edit manually
- [ ] If extraction fails entirely, user is notified with a clear error and can retry or enter the recipe manually
- [ ] Each normalized ingredient is fuzzy-matched against the local ingredient library
- [ ] Exact matches auto-linked; fuzzy matches (≥80% similarity) suggested for confirmation; no-matches flagged for manual resolution
- [ ] LLM suggests component vs. direct ingredient classification per ingredient; user confirms or overrides
- [ ] User reviews and resolves all ingredient matches before finalizing
- [ ] On finalization: components created (if needed), dish assembled, nutritional profile computed from local ingredient data with retention factors
- [ ] Imported dish’s `dish_role` (Main/Side/Dessert) suggested by LLM heuristic with user override
- [ ] Import history viewable (recipe name, source URL, source language, match status, linked dish)

### US-5.6 — Create Side Dish

> As a Planner, I want to create simple Side dishes (salads, steamed vegetables, bread) so that they can optionally accompany my main meals.

**Acceptance Criteria:**

- [ ] Select `dish_role = Side` during creation
- [ ] No structural validity constraints (no required protein/fiber/micronutrient-dense components)
- [ ] Must contain ≥1 entry (component or direct ingredient)
- [ ] Side dishes available in the Side sub-slot of the weekly planner
- [ ] Side dishes are shareable: the same Side dish can appear in both Lunch and Dinner of the same day

### US-5.7 — Create Dessert Dish

> As a Planner, I want to create simple Dessert dishes (fresh fruit, yogurt) so that they can optionally complete my meals.

**Acceptance Criteria:**

- [ ] Select `dish_role = Dessert` during creation
- [ ] No structural validity constraints
- [ ] Must contain ≥1 entry (component or direct ingredient)
- [ ] Dessert dishes available in the Dessert sub-slot of the weekly planner
- [ ] Typical desserts: fresh fruit portions, yogurt servings, fruit salads

### US-5.8 — Cooking Loss Visibility

> As a Planner, I want to understand how cooking methods affect nutrient retention in my components and dishes so that I can make informed decisions about preparation methods.

**Acceptance Criteria:**

- [ ] When creating a component, the system displays the nutrient retention factor applied per nutrient (based on cooking method) in the nutritional summary
- [ ] When creating a direct ingredient entry in a dish, the system applies and displays the corresponding retention factors
- [ ] Nutrients with significant loss (retention factor < 0.80) are highlighted in yellow; nutrients with severe loss (< 0.50) in orange
- [ ] The UI shows both "raw ingredient nutrition" and "post-cooking nutrition" side by side for transparency
- [ ] Raw cooking method shows retention factor 1.0 for all nutrients
- [ ] Retention factors are sourced from USDA Nutrient Retention Factor tables (Release 6); a default of 1.0 is used for nutrient–method pairs not covered in the data

---

## US-6 — Planning Profiles

### US-6.1 — Create Custom Profile

> As a Planner, I want to create a custom planning profile with specific nutrient targets and weights so that I can tailor plans to my current goals.

**Acceptance Criteria:**

- [ ] Fork from any existing profile (built-in or custom)
- [ ] Edit all fields: name, description, base reference, nutrient targets, nutrient weights, dietary restrictions, people count, planning mode, max dish repeats, cross-week variety window
- [ ] Saved immediately; available for selection in planning sessions

### US-6.2 — Set Dietary Restrictions

> As a Planner, I want to define dietary restrictions (e.g., vegetarian, no shellfish) so that incompatible dishes are automatically excluded.

**Acceptance Criteria:**

- [ ] Free-tag input for restrictions (predefined suggestions + custom)
- [ ] Restrictions filter dishes before solver runs: any dish containing a restricted ingredient is excluded from eligible set
- [ ] Tag matching is on ingredient level (e.g., "no-shellfish" excludes all ingredients tagged as shellfish)

### US-6.3 — Scale for Multiple People

> As a Planner, I want to set a people count so that shopping lists and portions scale accordingly.

**Acceptance Criteria:**

- [ ] `people_count` field in profile (integer ≥ 1)
- [ ] Weekly plan itself does not change (same dishes for everyone)
- [ ] Shopping list quantities multiplied by `people_count`
- [ ] Batch cooking quantities multiplied by `people_count`
- [ ] Nutrient targets remain per-person (the plan is nutritionally valid for one person)

---

## US-7 — Weekly Planner

### US-7.1 — Generate Weekly Plan

> As a Planner, I want to generate an optimized weekly meal plan that meets my nutritional targets so that I have a concrete plan to follow.

**Acceptance Criteria:**

- [ ] Select active profile
- [ ] Select available components for the week
- [ ] Optionally pin meals, exclude dishes, adjust targets temporarily
- [ ] Click "Generate" → system runs MILP → returns plan in ≤5 seconds
- [ ] Calendar grid populates with 14 Main dishes (Mon–Sun × Lunch/Dinner) plus optional Side and Dessert dishes per meal
- [ ] Solver status displayed: Optimal / Feasible / Infeasible
- [ ] If infeasible, system reports which constraints were relaxed

### US-7.2 — View Plan in Calendar Grid

> As a Planner, I want to see my weekly plan as a calendar grid so that I can quickly review the week.

**Acceptance Criteria:**

- [ ] 7-column (Mon–Sun) × rows per meal (Main required, Side optional, Dessert optional) for Lunch and Dinner
- [ ] Each Main cell shows: dish name, primary protein, calorie count, top 2 nutrient contributions
- [ ] Side and Dessert cells show dish name and calorie count (or empty placeholder if unassigned)
- [ ] Color-coded borders (green/yellow/red) based on nutritional contribution strength
- [ ] Pinned meals marked with a pin icon
- [ ] Click a cell to expand details (full nutrients, explanation, swap option)

### US-7.3 — Manually Swap a Dish

> As a Planner, I want to replace a dish in my plan with another so that I can make manual adjustments.

**Acceptance Criteria:**

- [ ] Click "Swap" on any dish cell → opens dish picker filtered by meal type, dish role, and structural validity
- [ ] Picker shows nutritional comparison between current and candidate dish
- [ ] On selection, dish replaced and weekly totals recalculated (no full re-solve)
- [ ] Gap report and explainability annotations updated
- [ ] Plan marked as "Modified" (no longer guaranteed optimal)

### US-7.4 — Pin/Unpin Meals

> As a Planner, I want to lock specific day/slot/dish assignments before generating a plan so that I can keep certain meals fixed.

**Acceptance Criteria:**

- [ ] Before generation: select a slot → choose a dish → mark as pinned
- [ ] Pinned meals are hard constraints in the MILP
- [ ] Pinned meals display with a pin icon; unpinnable at any time
- [ ] Re-generating with pins produces a plan that keeps pinned meals unchanged

### US-7.5 — Save Plan

> As a Planner, I want to save my finalized plan so that it persists and generates derived outputs.

**Acceptance Criteria:**

- [ ] Save button available when all 14 Main slots are filled (Side and Dessert slots may be empty)
- [ ] On save: plan persisted to DB; shopping list generated; batch cooking plan generated; plan added to history
- [ ] Saved plan is immutable
- [ ] Previous unsaved draft for the same week is discarded

---

## US-8 — Daily View

### US-8.1 — View Day Details

> As a Planner, I want to see detailed information for a specific day so that I know exactly what to eat and prepare.

**Acceptance Criteria:**

- [ ] Select a day from the calendar grid or a dedicated day picker
- [ ] View shows: lunch details (main dish + optional side + optional dessert), dinner details (main dish + optional side + optional dessert)
- [ ] Per dish: full nutritional breakdown (17 nutrients), component list, assembly instructions
- [ ] Daily nutrient total: sum of all lunch + dinner items (main + side + dessert), comparison to daily average target
- [ ] Hydration reminder (static daily target from profile)

---

## US-9 — Dish Substitution

### US-9.1 — Substitute Unavailable Dish

> As a Planner, I want to request a substitute for a dish I can't make this week so that I maintain nutritional coverage.

**Acceptance Criteria:**

- [ ] Click "Substitute" on any dish in the weekly plan
- [ ] System computes top 3 alternatives by cosine similarity on nutrient vectors
- [ ] Each alternative shows: name, similarity %, nutrient comparison (side-by-side)
- [ ] User selects one → dish replaced → plan recalculated
- [ ] Substitution reason logged and displayed in explainability layer
- [ ] If no alternative with similarity ≥ 50%: notify user to adjust component availability

---

## US-10 — Nutrient Dashboard

### US-10.1 — View Weekly Nutrient Coverage

> As a Planner, I want to see how well my weekly plan covers each nutrient target so that I can identify gaps.

**Acceptance Criteria:**

- [ ] 17 horizontal bars (one per nutrient): target vs. actual, percentage, color-coded (green ≥95%, yellow 80–94%, orange 60–79%, red <60%)
- [ ] Click a nutrient bar → expand to show per-meal contribution breakdown (stacked bar chart)
- [ ] Supplement contributions shown separately in the bar

### US-10.2 — View Gap Report

> As a Planner, I want to see specific gap diagnostics with improvement suggestions so that I can close nutritional shortfalls.

**Acceptance Criteria:**

- [ ] List of nutrients with status below "OK" (coverage < 95%)
- [ ] Per nutrient: current %, target, actual, deficit amount
- [ ] Minimal intervention suggestions: component additions, dish swaps, or supplement recommendations
- [ ] Suggestions ranked by gap closure efficiency (% improvement per change)

### US-10.3 — Supplement Recommendations

> As a Planner, I want to see supplement recommendations when food alone can't meet my targets so that I can fill remaining gaps.

**Acceptance Criteria:**

- [ ] Supplements recommended only when food-based interventions are insufficient
- [ ] Per supplement: name, dosage, which days to take, nutrients covered, remaining gap after supplementation
- [ ] User acknowledges/dismisses recommendations (no auto-purchase)

---

## US-11 — Shopping List

### US-11.1 — View Shopping List

> As a Planner, I want to see a complete shopping list for the week so that I know exactly what to buy.

**Acceptance Criteria:**

- [ ] Auto-generated from saved weekly plan
- [ ] Grouped by category (Meat & Fish, Dairy, Vegetables, Grains & Legumes, Oils & Fats, Other)
- [ ] Per item: ingredient name, total quantity (grams), display quantity (human-readable), needed-by day
- [ ] Quantities scaled by `people_count`
- [ ] Quantities rounded up to practical purchase units

---

## US-12 — Batch Cooking Plan

### US-12.1 — View Batch Cooking Plan

> As a Planner, I want to see a cooking schedule that tells me what to prepare in each session so that I can batch cook efficiently.

**Acceptance Criteria:**

- [ ] Two cooking sessions displayed (default: Sunday + Wednesday)
- [ ] Per session: components to prepare, ingredient quantities, prep+cook time, total session time
- [ ] Per component: which days it will be consumed, storage method
- [ ] Session days configurable by user

---

## US-13 — Recipe & Assembly View

### US-13.1 — View Dish Recipe

> As a Planner, I want to see full recipe and assembly instructions for a dish so that I can prepare it correctly.

**Acceptance Criteria:**

- [ ] Full recipe displayed by default (not just assembly)
- [ ] Assembly overview at the top: components needed, their states, assembly time
- [ ] Preparation graph rendered as a visual DAG with parallel lanes for independent branches
- [ ] Active vs. passive steps visually distinguished; passive steps signal parallelization opportunity
- [ ] Critical path highlighted with minimum total cook time
- [ ] Per component: expandable sub-recipe with its own preparation sub-graph
- [ ] If component is from a batch: note “Pre-cooked — retrieve from fridge/freezer”
- [ ] Flat linearized (topological sort) view available as an alternative to the graph
- [ ] Nutritional summary table at bottom

---

## US-14 — Export

### US-14.1 — Export to PDF

> As a Planner, I want to export my weekly plan as a PDF so that I can print it or view it offline.

**Acceptance Criteria:**

- [ ] PDF contains: cover page, weekly calendar grid, daily detail pages, nutrient summary, shopping list, batch cooking plan
- [ ] A4 landscape for calendar grid, A4 portrait for detail pages
- [ ] Clean typography and color-coded nutrient bars

### US-14.2 — Export to ODS

> As a Planner, I want to export my plan data as an ODS spreadsheet so that I can view it in LibreOffice.

**Acceptance Criteria:**

- [ ] Multi-sheet ODS: Weekly Plan, Nutrient Breakdown, Shopping List, Ingredient Library
- [ ] Nutrient cells color-coded (green/yellow/orange/red)
- [ ] One-way export only (not re-importable)

---

## US-15 — Authentication

### US-15.1 — Initial Setup

> As a Planner, I want to set a password on first launch so that my data is protected.

**Acceptance Criteria:**

- [ ] On first access: setup screen prompting for new password (min 8 characters)
- [ ] Password stored as bcrypt hash
- [ ] After setup, redirected to login screen

### US-15.2 — Login

> As a Planner, I want to log in with my password so that I can access my planning data.

**Acceptance Criteria:**

- [ ] Login screen with password field
- [ ] On success: session cookie set (httpOnly, secure); redirect to weekly planner
- [ ] On failure: generic error "Invalid password"; rate limited (10 attempts/min)
- [ ] Session timeout: 7 days (configurable)

### US-15.3 — Change Password

> As a Planner, I want to change my password from settings so that I can maintain security.

**Acceptance Criteria:**

- [ ] Requires current password + new password + confirmation
- [ ] New password must meet minimum length requirement
- [ ] All existing sessions invalidated on password change

---

## US-16 — Plan History

### US-16.1 — Browse Past Plans

> As a Planner, I want to browse past weekly plans so that I can see what I've eaten and track patterns.

**Acceptance Criteria:**

- [ ] List of past weeks (newest first): week dates, coverage %, dish count
- [ ] Click to view plan in read-only calendar grid
- [ ] Compare button: side-by-side nutrient coverage with current plan

### US-16.2 — Delete Old Plans

> As a Planner, I want to delete old plans so that I can free up storage space.

**Acceptance Criteria:**

- [ ] Delete button per plan with confirmation dialog
- [ ] Deletion removes plan from history and from cross-week variety calculations
- [ ] Current week's plan cannot be deleted
