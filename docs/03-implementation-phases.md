# Marieta — Implementation Phases

## Decisions Resolved Before Planning

| ID | Decision | Resolution |
|----|----------|------------|
| D1 | Reclassify F23 (Plan History) to Must-Have | **Yes** — required by cross-week variety penalty in MILP objective |
| D2 | Reclassify F24 (Temporal Shelf-Life Validation) to Must-Have | **Yes** — soft-constraint approach is cheap; batch plan is wrong without it |
| D3 | Gemma 4 model variant | `gemma4:latest` — let Ollama pull the default |
| D4 | Angular version | Latest stable at development start |
| D5 | Python version | Latest stable (3.13+); re-evaluate library compatibility in Phase 0 |
| OQ1 | Plan History classification | Must-Have |
| OQ2 | Shelf-life Validation classification | Must-Have |
| OQ3 | Minimum dish library for solver testing | 50 Main + 15 Side + 10 Dessert |
| OQ4 | Frontend state persistence | NgRx Signal Store in-memory only; re-fetch from API on reload |
| OQ5 | Default route after login | Plan screen |

---

## Phase Structure

```
Phase 0: Scaffolding          ████████████████  ~2 weeks
Phase 1: Ingredients + ETL    ████████████      ~1.5 weeks
Phase 2: Components + Flavors ████████          ~1 week
Phase 3: Dishes               ████████████      ~1.5 weeks
Phase 4: Solver + Planning    ████████████████████  ~2.5 weeks
Phase 5: Recipe Import        ████████████      ~1.5 weeks
Phase 6: Export + Hardening   ████████████      ~1.5 weeks
─────────────────────────────────────────────────────────
Total estimated (single dev)                    ~11.5 weeks
```

### Dependency Graph

```
Phase 0 ──────────────────────────────────────────────►
  ├─► Phase 1 ────────────────────────────────────────►
  │     ├─► Phase 2 ──────────────────────────────────►
  │     │     ├─► Phase 3 ────────────────────────────►
  │     │     │     ├─► Phase 4 ──────────────────────►
  │     │     │     │     ├─► Phase 6
  │     │     │     │     └─► Phase 5 can start once Phase 3 dishes exist
  │     │     │     └─► Phase 5 needs Phase 3 dishes to finalize into
  │     │     └─► Phase 4 needs Phase 2 components for solver
  │     └─► Phase 5 needs Phase 1 for ingredient matching
```

---

## Phase 0 — Project Scaffolding

**Goal**: `docker compose up` → healthy containers, database initialized, auth working, Angular shell loading.

**Complexity**: XL  
**Estimated**: ~2 weeks

### Tasks

| # | Task | Deliverable | Source |
|---|---|---|---|
| 0.1 | Monorepo structure: `backend/`, `frontend/`, `docs/`, `docker-compose.yml`, `.env.example`, `README.md` | Directory layout, `.gitignore` | NFR §8 |
| 0.2 | Backend skeleton: FastAPI app factory, SQLAlchemy 2.0 async engine, Alembic, structlog, Pydantic v2 settings from `.env` | `backend/src/marieta/` with `pyproject.toml`, `uvicorn main:app` running | NFR §5 |
| 0.3 | Frontend skeleton: Angular (latest stable) standalone app, Angular Material, 4 lazy-loaded routes (plan, library, nutrients, shopping), dark theme CSS variables from `08-style.md` | `frontend/` with `package.json`, `ng serve` at `localhost:4200` | PRD §5, Style Guide |
| 0.4 | `docker-compose.yml`: 5 services (frontend/nginx, backend/uvicorn, postgres, redis, ollama) with health checks, volumes, GPU passthrough block (commented for CPU-only fallback) | `docker compose up` → all 5 containers healthy | NFR §8 |
| 0.5 | Database init: Alembic migration 001 creating all tables (Ingredients, Components, ComponentIngredients, FlavorSystems, FlavorSystemIngredients, FlavorSystemCompatibilities, Dishes, DishEntries, Profiles, WeeklyPlans, PlanAssignments, ShoppingListItems, IngredientTags, EFSAReferences, RetentionFactors, RecipeImports) | `alembic upgrade head` → all tables exist | Data Model |
| 0.6 | Seed data: EFSAReference rows for Adult_Male and Adult_Female (all 17 nutrients, PRI/AI/UL), RetentionFactor rows from USDA RF6, protein quality factors, dry-to-cooked conversion ratios, default IngredientTag set | Seed scripts runnable via CLI or migration | Data Model §14–16 |
| 0.7 | Health endpoint: `GET /health` (no auth) → `{"status":"healthy","checks":{"database":"ok","redis":"ok","ollama":"ok"},"version":"0.1.0"}` | API Spec §0 | API Spec §0 |
| 0.8 | Auth endpoints: `POST /auth/setup`, `POST /auth/login`, `POST /auth/logout`, `GET /auth/status` — bcrypt hash, HTTP-only session cookie, CSRF token, login rate limiting | Auth cycle working end-to-end | NFR §2, PRD §5 |
| 0.9 | Angular auth flow: setup screen (password creation on first access), login screen, auth interceptor, route guards | Auth redirects working in frontend | US-15.1, US-15.2 |

### Acceptance Criteria

- [ ] `docker compose up` from clean checkout starts all 5 services
- [ ] `GET /health` returns `200` with all checks `ok` (ollama reports `degraded` if model not yet pulled — acceptable)
- [ ] First access: setup screen → create password → redirect to login
- [ ] Login → plan screen loads (empty)
- [ ] Logout clears session; protected routes redirect to login
- [ ] All 16 tables exist in PostgreSQL (`\dt` in psql)
- [ ] Seed data: `SELECT count(*) FROM efsa_reference` → ≥34 rows (17 nutrients × 2 demographics)
- [ ] Frontend renders dark theme per style guide (radial gradient background, correct text opacities)

---

## Phase 1 — Ingredient Library & Nutritional Data Pipeline

**Goal**: ~15,000 ingredients imported from CIQUAL + USDA + NEVO. Full CRUD and search operational.

**Complexity**: L  
**Estimated**: ~1.5 weeks

### Tasks

| # | Task | Depends On | Deliverable | User Story | Complexity |
|---|---|---|---|---|---|
| 1.1 | Ingredient API: `GET /ingredients` (paginated, fuzzy search, filters), `GET /ingredients/{id}`, `POST /ingredients`, `PUT /ingredients/{id}`, `DELETE /ingredients/{id}`, `POST /ingredients/{id}/revert-overrides` | 0.2, 0.5 | Full CRUD with Pydantic validation | US-2.1–2.5 | M |
| 1.2 | Ingredient fuzzy search: PostgreSQL GIN trigram index on `name`; query with `pg_trgm` similarity ranking | 1.1 | Search returns in <500ms for 15K entries | US-2.1 | M |
| 1.3 | Ingredient tags API: `GET /ingredient-tags`, `PUT /ingredients/{id}/tags` | 1.1 | Tag management working | US-6.2 | S |
| 1.4 | CIQUAL ETL: Excel parser → map columns to internal NutrientVector schema → normalize units to per-100g → upsert with source priority dedup (CIQUAL > USDA Foundation > USDA SR Legacy > NEVO) → idempotent re-run | 1.1, 0.6 | ~3,500 CIQUAL ingredients imported | US-1.1 | M |
| 1.5 | USDA FDC ETL: JSON bulk parser → SR Legacy (~8,700 foods) + Foundation Foods (~2,100 foods) → normalize → upsert with dedup → aggregate DHA+EPA+ALA into single `omega3` field | 1.1 | ~10,800 USDA ingredients imported | US-1.1 | L |
| 1.6 | NEVO ETL: Excel/CSV parser → normalize → upsert with dedup | 1.1 | ~2,100 NEVO ingredients imported | US-1.1 | M |
| 1.7 | ETL admin API: `POST /admin/etl/run` (source: CIQUAL/USDA/NEVO/All) → returns job_id; `GET /admin/etl/status/{job_id}` → progress, imported count, errors, confidence flags | 1.4–1.6 | Background ETL with polling | US-1.1 | S |
| 1.8 | USDA FDC live API search: `GET /ingredients/search-fdc?q=...` → fetch from USDA API → cache in Redis (TTL 30 days); `POST /ingredients/import-fdc/{fdc_id}` → import single result | 1.1, 0.4 (Redis) | Live search with caching | US-1.2 | M |
| 1.9 | Auto-import on first startup: backend checks if `ingredients` table is empty on startup → if so, triggers CIQUAL + USDA + NEVO ETL as background job | 1.7 | Clean first-run experience | US-1.1 | S |
| 1.10 | Ingredient library Angular page: paginated table with columns (name, categories, source, calories, protein, confidence), search bar, source/category/confidence filters, sort controls, add/edit forms (all 17 nutrient fields, serving model, categories), tag chips, soft-delete with dependency warning | 1.1–1.3 | Full ingredient management UI | US-2.1–2.5 | L |
| 1.11 | ETL trigger UI: settings page with "Import/Refresh Nutritional Data" button per source, progress bar polling job status | 1.7, 1.10 | User-triggered ETL from UI | US-1.1 | S |

### Acceptance Criteria

- [ ] All three ETL imports complete without errors; idempotent re-run produces zero new rows
- [ ] Ingredient library contains ~15,000 entries; dedup correctly prefers CIQUAL over USDA over NEVO
- [ ] Fuzzy search for "chicken breast" returns relevant results in <500ms
- [ ] Missing nutrient fields show as `null`, confidence = 0.0 flagged in UI
- [ ] User creates custom ingredient "My Protein Powder" with 6 known nutrients → appears in library, searchable
- [ ] USDA live search: query "quinoa" → returns USDA results → import one → appears in library
- [ ] ETL job status polled; UI shows progress bar during import
- [ ] First startup auto-triggers ETL; user sees progress after setup/login
- [ ] Ingredient soft-delete blocked if referenced by active component → error lists dependent components

### Data Validation Notes (Phase 1)

Before importing, validate each source file:

- **CIQUAL**: Verify column mapping for all 17 nutrients. CIQUAL uses French nutrient names — maintain a mapping table. Check for unexpected NULL rates per nutrient column.
- **USDA FDC**: SR Legacy and Foundation Foods use different JSON schemas. Foundation Foods has per-food nutrient arrays (not a flat map). Omega-3 aggregation needs explicit handling: DHA = nutrient_id 1273, EPA = 1274, ALA = 1276 (verify against actual download — nutrient IDs may differ by release).
- **NEVO**: Dutch nutrient names; verify encoding (likely UTF-8 with Latin-1 fallback). NEVO may use `mg/100g` for some nutrients where CIQUAL uses `µg/100g` — unit conversion required.

---

## Phase 2 — Components & Flavor Systems

**Goal**: Create batch-cooked components with auto-derived nutrition (retention factors applied). Flavor systems with ingredient-level nutritional modeling.

**Complexity**: M  
**Estimated**: ~1 week

### Tasks

| # | Task | Depends On | Deliverable | User Story | Complexity |
|---|---|---|---|---|---|
| 2.1 | Component API: `GET /components` (paginated, filter by category/ingredient), `GET /components/{id}`, `POST /components`, `PUT /components/{id}`, `DELETE /components/{id}` | 1.1 | Full CRUD with auto-computed `nutrients_per_serving` | US-3.1–3.4 | M |
| 2.2 | Nutritional derivation engine: for each component, `nutrients_per_serving = Σ (ingredient.effective_nutrients_per_100g × (quantity_g / 100) × retention_factor[nutrient][cooking_method])`. Retention factor lookup: try (nutrient, cooking_method, food_group) → fall back to (nutrient, cooking_method, NULL) → default 1.0. For legumes/grains: apply dry-to-cooked conversion ratio before retention factors. `cooking_method = Raw` → all factors = 1.0 | 2.1 | Correct cooked-nutrient values for all components | US-3.1, US-5.8 | M |
| 2.3 | Component recalculation trigger: on ingredient update or serving size change, flag dependent components for recalculation. On component PUT: auto-recompute if `cooking_method`, `standard_serving_g`, or ingredient quantities changed. | 2.1, 2.2 | Components always reflect current ingredient data | US-3.3 | S |
| 2.4 | Retention factor admin API: `GET /admin/retention-factors` (filter by method/nutrient), `PUT /admin/retention-factors/{id}` → updates factor; flags all components using that method for recalculation | 2.2, 0.6 | Retention factors editable | NFR §10 | S |
| 2.5 | Flavor system API: `GET /flavor-systems`, `GET /flavor-systems/{id}`, `POST /flavor-systems`, `PUT /flavor-systems/{id}`, `DELETE /flavor-systems/{id}` — key ingredients with quantities, compatible component IDs, batch_cookable flag, auto-computed `nutrients_per_serving` | 1.1 | Flavor system CRUD | US-4.1, US-4.2 | M |
| 2.6 | Component + FlavorSystem Angular pages: list with category/ingredient filters, create/edit forms (ingredient picker with search, cooking method dropdown, batch properties, freezable toggle), preparation_graph placeholder (collapsed JSON editor for now — full DAG editor in Phase 3), cooking loss visibility (raw vs. cooked side-by-side, retention factor <0.80 in yellow, <0.50 in orange per US-5.8) | 2.1, 2.5 | Component and flavor system management UI | US-3.1–3.4, US-4.1–4.2, US-5.8 | M |

### Acceptance Criteria

- [ ] Create "Grilled Chicken Breast": 160g, Grilled, 6 servings → `nutrients_per_serving` computed with retention factors; protein ~30g (raw protein × 0.95 retention for Grilled)
- [ ] Create "Mashed Potatoes": 2 ingredients (potato + butter), Boiled → nutrients = sum of both with respective retention factors
- [ ] Create "Steamed Broccoli": Steamed → Vitamin C retention factor ~0.80 shown in yellow in UI
- [ ] Change "Chicken Breast" ingredient protein value → dependent components flagged for recalculation
- [ ] Create "Lemon-Herb Dressing" flavor system: olive oil + lemon juice + garlic → nutrients computed; compatible with 3 proteins
- [ ] Component soft-delete blocked if referenced by active dish → error lists dependent dishes
- [ ] Retention factor admin: change Boiled Vitamin C from 0.50 to 0.55 → all Boiled components flagged

---

## Phase 3 — Dishes & Structural Validation

**Goal**: Composed dishes from components and direct ingredients, structural validity enforcement, preparation graph model, dish substitution.

**Complexity**: L  
**Estimated**: ~1.5 weeks

### Tasks

| # | Task | Depends On | Deliverable | User Story | Complexity |
|---|---|---|---|---|---|
| 3.1 | Dish API: `GET /dishes` (paginated, filter by meal_type/dish_role/liked/structural_valid), `GET /dishes/{id}`, `POST /dishes`, `PUT /dishes/{id}`, `DELETE /dishes/{id}` — with DishEntry sub-resource management (add/remove/update entries) | 2.1, 2.5 | Full CRUD with entry management | US-5.1, US-5.2, US-5.6, US-5.7 | L |
| 3.2 | DishEntry validation: enforce CHECK constraints from Data Model §8 — exactly one of component_id/ingredient_id non-null; entry_type consistency (Component → component_id set, ingredient_id null; DirectIngredient → ingredient_id, cooking_method, serving_g all set, component_id null); serving_multiplier null for DirectIngredient; ≥1 Protein role; ≥2 entries total (Main); ≥1 entry (Side/Dessert) | 3.1 | Validated entries on create/update | US-5.1 | M |
| 3.3 | Total nutrients computation: for component entries → `component.nutrients_per_serving × serving_multiplier`; for direct ingredient entries → `ingredient.nutrients_per_100g × (serving_g / 100) × retention_factor[nutrient][cooking_method]`. Sum all entries. Flavor system nutrients added if assigned. Cache as `total_nutrients` JSONB. | 3.1, 2.2 | Computed dish nutrition with both entry types | US-5.1 | M |
| 3.4 | Structural validity for Main dishes: ≥1 Protein entry, ≥1 fiber source (≥3g fiber/serving), ≥1 micronutrient-dense source (≥15% weekly target for any Tier 1/2 nutrient). Computed and cached on create/update. Side/Dessert dishes: always valid (no structural constraints). Threshold configurable via profile (`micronutrient_threshold_pct`, default 15). | 3.1, 3.3 | `structural_valid` boolean on Dish | US-5.1 | M |
| 3.5 | Like/dislike API: `PATCH /dishes/{id}/preference` → sets liked/disliked; disliked dishes excluded from solver eligible set; liked dishes get bonus in objective function | 3.1 | Preference tracking | US-5.3 | S |
| 3.6 | Dish substitution API: `GET /dishes/{id}/substitutes?meal_type=&available_component_ids=&limit=3` → cosine similarity on 17-dim normalized nutrient vectors; composite score = 0.6×similarity + 0.3×liked - 0.1×recentUsePenalty; filter by meal_type, structural validity, available components; exclude disliked | 3.1, 3.3, 3.5 | Top-3 alternatives with similarity % and nutrient comparison | US-9.1 | M |
| 3.7 | PreparationGraph model: Pydantic schema (Step, Edge, Graph), acyclic validation (topological sort), critical path computation, flat linearization. Stored as JSONB on Dish and Component (Phase 2 placeholder). | 3.1 | DAG validation and analysis utilities | US-5.4 | M |
| 3.8 | Dish Angular pages: list with meal_type/dish_role/liked filters, manual creation form (component-entry rows + direct-ingredient-entry rows, role assignment, serving_multiplier/serving_g inputs), real-time nutritional summary widget updating as entries change, structural validity indicator (green ✓ / red ⚠ with explanation), meal type classifier (Lunch/Dinner/Both with calorie heuristic suggestion), like/dislike toggles | 3.1–3.7 | Full dish management UI | US-5.1–5.7 | L |
| 3.9 | Preparation graph editor: DAG visual editor (nodes = steps, edges = dependencies, parallel lanes highlighted), flat list toggle, acyclic validation on save, active vs. passive step styling (dashed border for passive), time estimates per step and critical path summary | 3.7, 3.8 | Visual recipe editor | US-5.4 | L |
| 3.10 | Side/Dessert dish creation: dish_role selector, simplified creation form (≥1 entry, no structural checks), calories automatically computed | 3.1, 3.8 | Side and Dessert dishes in library | US-5.6, US-5.7 | S |

### Acceptance Criteria

- [ ] Create Main dish "Chicken Quinoa Bowl": Grilled Chicken (Protein, component, 1.0×) + Steamed Quinoa (Carb, component, 1.0×) + Steamed Broccoli (Vegetable, component, 1.0×) + Olive Oil (Fat, direct ingredient, Sautéed, 15ml) → nutritional totals computed with all retention factors, structural_valid = true
- [ ] Create Main dish "Just Chicken": only a protein component → structural_valid = false, UI shows red warning with missing requirements
- [ ] Create Side dish "Green Salad": lettuce + tomato + dressing → structural_valid = true (always), appears in Side sub-slot picker
- [ ] Create Dessert dish "Fruit Bowl": apple + orange → structural_valid = true, appears in Dessert sub-slot picker
- [ ] Like a dish → appears with preference badge in list; disliked dish excluded from substitution results
- [ ] Substitution: "Chicken Quinoa Bowl" → top 3 alternatives returned, #1 has 94% similarity, nutrient comparison table shown
- [ ] Preparation graph: 6-step pasta recipe with 3 parallel lanes → DAG editor renders correctly, critical path highlighted, flat list available
- [ ] DishEntry with both Component and DirectIngredient rows on same dish passes validation

---

## Phase 4 — Solver & Weekly Planning

**Goal**: MILP-based plan generation working end-to-end. Calendar grid with expand-in-place, draft/save flow, nutrient dashboard.

**Complexity**: XL  
**Estimated**: ~2.5 weeks

### Tasks

| # | Task | Depends On | Deliverable | User Story | Complexity |
|---|---|---|---|---|---|
| 4.1 | MILP formulation in OR-Tools CP-SAT: implement all variables (x, y, z, used_c, δ⁺, δ⁻, supp), all hard constraints (one Main per slot, ≤1 Side, ≤1 Dessert, meal type compatibility, repetition cap, component reuse ≥3 with activation, supplement cap, pinned meals), nutrient balance equation (sum of dish nutrients + supplements = target + δ⁺ - δ⁻), objective function (nutritional deviation weighted by tier − variety bonus − preference bonus + cross-week penalty) with mode-dependent coefficients | 3.1–3.6 | Solver module returning assignments, nutrient totals, solver status | US-7.1 | XL |
| 4.2 | Solver input preparation: query eligible dishes (filter by available components, meal_type, dish_role, dietary restrictions from profile, excluded dishes, disliked dishes), build component index for reuse constraint, load plan history for cross-week variety penalty | 4.1 | Eligible dish set and solver parameters | US-7.1 | M |
| 4.3 | Solver wrapper: CP-SAT model construction, 10-second time limit, status interpretation (OPTIMAL/FEASIBLE/INFEASIBLE), solution extraction to assignment list | 4.1, 4.2 | Solve result with assignments and status | US-7.1 | M |
| 4.4 | Infeasibility handling: constraint relaxation cascade — (1) component reuse ≥3 → ≥2 → ≥1, (2) Tier 3 weights → 0, (3) Tier 2 weights halved. Re-solve after each relaxation. Report which constraints were relaxed. | 4.3 | Graceful degradation when no feasible plan exists | US-7.1 | M |
| 4.5 | Post-solve: nutrient coverage computation per nutrient (actual / target × 100%), gap report generation (flag nutrients <90%, classify severity, generate intervention suggestions — food-based preferred over supplements) | 4.3, 4.4 | Nutrient coverage and gap report | US-10.1, US-10.2 | M |
| 4.6 | Post-solve: batch cooking plan derivation — assign components to Session 1 (Sunday) or Session 2 (Wednesday) based on usage days; Sunday overflow handling (Module 11.2); shelf-life soft constraint validation with post-solve session reassignment (Module 15.3); freezable components exempt; flag violations that can't be resolved. Direct ingredients excluded from batch plan. | 4.3, 4.4 | Two-session batch cooking plan | US-12.1 | L |
| 4.7 | Post-solve: shopping list aggregation — for each ingredient (component ingredients + direct ingredients), sum quantities × appearances × people_count, round up to practical purchase units, generate human-readable display quantities, group by category, set needed_by_day | 4.3, 4.4 | Shopping list grouped by category | US-11.1 | M |
| 4.8 | Post-solve: explainability annotations — per assigned dish: top 2–3 nutrient contributions with % of weekly target, selection rationale; per supplement: reason (food coverage insufficient); per gap: explanation string | 4.3, 4.4 | Explanations JSON per plan | US-7.1 | M |
| 4.9 | Profile API: `GET /profiles`, `GET /profiles/{id}`, `POST /profiles` (with fork_from_id), `PUT /profiles/{id}`, `DELETE /profiles/{id}`, `GET /profiles/efsa-defaults` | 0.5, 0.6 | Full profile CRUD with EFSA defaults endpoint | US-6.1, US-6.2, US-6.3 | M |
| 4.10 | Plan generate endpoint: `POST /plans/generate` → accepts profile_id, week_start, available_component_ids, pinned_meals, excluded_dish_ids, target_overrides, session_1_day, session_2_day → runs solver + post-solve → stores draft in Redis (TTL 30 min) → returns draft_token + full plan data | 4.1–4.9 | Plan generation API | US-7.1 | L |
| 4.11 | Draft swap endpoint: `POST /plans/{draft_token}/swap` → accepts day/slot/sub_slot/new_dish_id → validates new dish (meal_type, dish_role), replaces in draft, recalculates nutrient totals/coverage/gap report/batch plan/shopping list (arithmetic, no re-solve), sets is_modified=true, updates Redis | 4.10 | Manual swap on draft | US-7.3 | M |
| 4.12 | Draft save endpoint: `POST /plans/{draft_token}/save` → retrieves draft from Redis → archives existing non-superseded plan for same week (sets is_superseded=true) → inserts WeeklyPlan + PlanAssignments + ShoppingListItems → returns persisted plan with permanent ID. Validates all 14 Main slots filled. | 4.10, 0.5 | Plan persistence | US-7.5 | M |
| 4.13 | Plan history API: `GET /plans` (paginated, sorted by week_start desc), `GET /plans/{id}`, `GET /plans/{id}/daily/{day}`, `DELETE /plans/{id}` | 4.12 | Plan retrieval and history browsing | US-16.1, US-16.2 | M |
| 4.14 | Weekly planner Angular page: 7-column calendar grid (Mon–Sun) × 2 slots (Lunch/Dinner) with 3 sub-slots each (Main required, Side optional, Dessert optional), expand-in-place per style guide (one day open at a time), per-cell: dish name + primary protein + calories + top 2 nutrients, color-coded borders (green/yellow/red), pin icon for pinned meals, status line at bottom | 4.10–4.13, 0.3 | Calendar grid UI with expand-in-place | US-7.1, US-7.2, US-7.4 | XL |
| 4.15 | Plan controls: generate button (opens config panel: select profile, select available components, pin meals, exclude dishes, session days), loading state during solver, draft review mode (swap button per cell opens dish picker filtered by meal_type/role/structural validity with nutrient comparison), save button → persisted, "Modified" badge on plans with is_modified=true | 4.10–4.12, 4.14 | Plan generation and review workflow | US-7.1, US-7.3, US-7.5 | L |
| 4.16 | Daily view Angular page: per-day detail — lunch section (main dish + optional side + optional dessert), dinner section (same), expanded dish details (full nutrient breakdown, component list, assembly instructions), daily nutrient totals vs. daily average target, supplement reminders | 4.13 | Daily detail view | US-8.1 | M |
| 4.17 | Nutrient dashboard Angular page: 17 horizontal coverage bars (target vs. actual, %, color-coded green/yellow/orange/red per Module 10.2), click to expand per-meal contribution breakdown (stacked bar chart), gap report list with intervention suggestions, supplement schedule display | 4.5 | Nutrient analysis UI | US-10.1–10.3 | L |
| 4.18 | Plan history Angular page: past weeks list (newest first) with coverage avg and dish count, click to view read-only calendar grid, compare button (side-by-side nutrient coverage with current week), delete with confirmation | 4.13 | Plan history UI | US-16.1, US-16.2 | M |
| 4.19 | Profile settings Angular page: list profiles, create (fork from existing or from EFSA defaults), edit targets/weights/restrictions/mode/people_count, set active profile, delete (blocked if last profile) | 4.9 | Profile management UI | US-6.1–6.3 | M |

### Acceptance Criteria

- [ ] Generate plan for test library (50 Main + 15 Side + 10 Dessert) → solves in <5s, returns Optimal
- [ ] All 14 Main slots filled; Side and Dessert slots populated where solver assigned them
- [ ] Pinned meals preserved exactly; excluded dishes absent
- [ ] Component reuse constraint: no component appears in 1–2 meals only (unless no feasible alternative — then relaxed with warning)
- [ ] Nutrient coverage ≥90% for Tier 1 nutrients with a reasonable dish library
- [ ] Manual swap: replace a dish → coverage recalculated within 200ms, no full re-solve
- [ ] Draft expires after 30 min; re-generate required
- [ ] Save persists plan; previous plan for same week auto-archived
- [ ] Infeasible case: system relaxes constraints and reports which ones were relaxed
- [ ] Batch cooking plan: components assigned to correct sessions; freezable components in Session 1; short-shelf-life components in nearest session; Sunday overflow handled
- [ ] Shopping list: quantities scaled by people_count, human-readable display ("3 chicken breasts (~480g)"), grouped by category
- [ ] Calendar grid matches style guide (dark background, opacity-based text, semantic colors, expand-in-place)
- [ ] Nutrient dashboard: all 17 bars rendered, click for per-meal breakdown
- [ ] Plan history: past plans viewable in read-only grid; compare shows side-by-side coverage

---

## Phase 5 — Recipe Import Pipeline

**Goal**: Import recipes from URLs via Schema.org/HTML extraction → Gemma 4 LLM normalization → ingredient matching → dish creation.

**Complexity**: L  
**Estimated**: ~1.5 weeks

### Tasks

| # | Task | Depends On | Deliverable | User Story | Complexity |
|---|---|---|---|---|---|
| 5.1 | Recipe extraction service: fetch URL → parse Schema.org `Recipe` JSON-LD and Microdata → extract title, ingredient lines, instruction blocks. HTML heuristic fallback: look for common recipe markup patterns (`.recipe-ingredients`, `[itemprop="recipeIngredient"]`, list-based heuristics). Return raw extracted data (original text, no normalization). | 0.2 | Raw recipe extraction from URLs | US-5.5 | M |
| 5.2 | LLM normalization client: Ollama `/v1/chat/completions` call with system prompt (instructs: translate to English, parse quantities/units to metric, detect preparation, infer cooking method, classify component vs. direct ingredient, suggest dish_role, build preparation graph), temperature=0.0, JSON mode, Pydantic validation on response. One retry on validation failure with corrective prompt. Timeout: 60s. | 5.1, 0.4 (Ollama) | Normalized ingredient data + cooking method + dish role hint + preparation graph | US-5.5 | L |
| 5.3 | Ingredient fuzzy matching: for each normalized ingredient → query local library with trigram similarity (threshold 0.80). ≥0.80 auto-match; ≥0.60 suggest with confidence; <0.60 unmatched. Return match results with suggested alternatives. | 5.2, 1.2 | Matched ingredient list with confidence scores | US-5.5 | M |
| 5.4 | Recipe import API: `POST /recipes/import-from-url` (triggers extraction + LLM + matching → returns RecipeImport with match_status, ingredients with match details, preparation graph), `GET /recipes/imports` (paginated list, filter by status), `PUT /recipes/imports/{id}/resolve` (accept ingredient resolution map), `POST /recipes/imports/{id}/finalize` (creates Dish + Components) | 5.1–5.3 | Full import pipeline API | US-5.5 | L |
| 5.5 | Graceful degradation: if Ollama unavailable → extraction still runs, returns raw data with `llm_normalization_status = 'Failed'`, user can edit manually. If extraction fails → `422` with clear error. LLM timeout (60s) → abort, return raw extraction. | 5.1–5.4 | Resilient import pipeline | US-5.5, NFR §11 | M |
| 5.6 | Recipe import Angular page: URL input → extraction progress (spinner) → review screen showing normalized ingredients with match status (auto-matched green, fuzzy-suggested yellow with dropdown, unmatched red with search-to-resolve), cooking method and dish role suggestions (editable), preparation graph preview (collapsed), name input (pre-filled from recipe), finalize button → creates dish → navigates to dish detail | 5.4, 3.8 | Full recipe import UI | US-5.5 | L |

### Acceptance Criteria

- [ ] Import English recipe with Schema.org data: "Pasta Carbonara" → all ingredients extracted, normalized, matched, preparation graph with parallel lanes, dish created
- [ ] Import Spanish recipe "Pollo al Ajillo" → LLM translates to English, converts units to metric, detects cooking method "Sautéed", creates dish
- [ ] Import French recipe "Ratatouille" from a site without Schema.org → HTML heuristic extracts ingredients, LLM normalizes and translates
- [ ] Fuzzy match: "guanciale" → suggests "pancetta" at 85% confidence with dropdown to accept or search for alternative
- [ ] Unmatched ingredient: "za'atar" → user searches library, finds nothing, prompted to create new ingredient inline before finalizing
- [ ] Ollama unavailable → extraction runs, raw ingredients shown with warning "Automatic normalization unavailable — please enter manually"
- [ ] Extraction fails (page has no recognizable recipe) → clear error "No recipe data found at this URL"
- [ ] Full pipeline (extraction + LLM + matching) completes in <45s on GPU, <90s CPU
- [ ] Finalize creates Dish with correct DishEntries (component references for batch-cookable items, direct ingredient entries for meal-time items)
- [ ] Preparation graph from import is acyclic and renders correctly in dish detail

---

## Phase 6 — Export, Hardening & Polish

**Goal**: PDF/ODS export, cross-week variety integration, test coverage, performance validation, error handling completeness.

**Complexity**: M  
**Estimated**: ~1.5 weeks

### Tasks

| # | Task | Depends On | Deliverable | User Story | Complexity |
|---|---|---|---|---|---|
| 6.1 | PDF export: `GET /plans/{id}/export/pdf` → WeasyPrint renders from HTML template. Pages: cover (week dates, profile name, people_count), calendar grid (landscape A4), daily details (one page per day, portrait A4 — condensed dish info with assembly instructions), nutrient summary (coverage bars, gap report), shopping list (grouped by category), batch cooking plan (two-session schedule). Color-coded nutrient bars. | 4.13 | Downloadable PDF | US-14.1 | M |
| 6.2 | ODS export: `GET /plans/{id}/export/ods` → odfpy generates multi-sheet workbook. Sheets: Weekly Plan (calendar grid with dish names, calories, protein), Nutrient Breakdown (17 rows × target/actual/%/status), Shopping List (ingredient, quantity, display, needed_by), Ingredient Library (full export of user's library — one-way, not re-importable). Color-coded nutrient cells (green/yellow/orange/red background). | 4.13 | Downloadable ODS | US-14.2 | M |
| 6.3 | Cross-week variety penalty: query plan history (all non-deleted plans) for dish usage in past N weeks (from profile.cross_week_variety_weeks, default 3). Compute recentUsePenalty_m = 1 if dish was used in that window, 0 otherwise. Integrate into solver objective function (λ_xweek × Σ x_{d,s,m} × recentUsePenalty_m). | 4.1, 4.2, 4.13 | Variety penalty active in solver | US-16.1 | S |
| 6.4 | Ingredient library ODS export: separate endpoint `GET /ingredients/export/ods` → user's full ingredient library in a single-sheet ODS for offline reference | 1.11 | Ingredient reference export | (convenience) | S |
| 6.5 | Backend test suite: pytest-asyncio. Unit tests: NutrientVector arithmetic, retention factor lookup, protein quality factor application, dry-to-cooked conversion, MILP constraint satisfaction (mini test cases with 5-dish library), preparation graph acyclic validation, DAG topological sort and critical path, fuzzy search query generation, ETL normalization functions. Integration tests: API endpoint CRUD for all entities, auth flow (setup → login → protected route → logout), ETL idempotency, plan generate/save/swap cycle, recipe import pipeline (mock Ollama response), PDF/ODS generation. Target: ≥80% coverage on backend business logic. | All phases | Passing test suite | NFR §5 | L |
| 6.6 | Frontend test suite: Jasmine/Karma or Jest. Component tests: ingredient list rendering with mock data, component form validation, dish entry editor (component vs. direct ingredient switching), calendar grid rendering (7 days × 2 slots), expand-in-place behavior (one day open at a time), nutrient bar rendering. Service tests: API client methods, NgRx Signal Store state transitions. Target: ≥60% coverage on critical paths. | All phases | Passing test suite | NFR §5 | M |
| 6.7 | Error handling audit: every API endpoint returns appropriate HTTP codes per API Spec §Common Response Patterns. Frontend: every API call handles loading/error/empty states — loading spinners during fetch, error toasts with retry, empty state messages ("No dishes yet — create one"). Edge cases: 404 on entity detail → redirect to list with toast; 422 on delete → show dependency list modal; network error → retry button; Redis draft expiry → "Session expired, please re-generate" message. | All phases | Graceful error handling throughout | NFR §2, §4 | M |
| 6.8 | Performance validation: measure all NFR §1 targets. Instrument backend with structlog timing. Measure: ingredient search (<500ms), CRUD endpoints (<200ms), plan generate (<10s total), PDF export (<5s), ODS export (<3s), page loads. Optimize slow paths: add missing indexes, batch DB queries with `selectinload`, verify GIN indexes active, profile solver for large eligible sets. | All phases | All NFR §1 targets met or documented exceptions | NFR §1 | M |
| 6.9 | Accessibility review: verify WCAG 2.1 AA (best-effort per NFR §6). Keyboard navigation through calendar grid (Tab through days, Enter to expand, Escape to collapse), ARIA labels on nutrient bars (`aria-valuenow`, `aria-valuemin`, `aria-valuemax`), semantic HTML landmarks, color contrast verification for all text/background pairs (especially semantic colors on dark background), 200% browser zoom test for calendar grid (horizontal scroll acceptable). | 4.14–4.18 | Accessible UI | NFR §6 | M |
| 6.10 | Final integration test: end-to-end walkthrough — `docker compose up` from clean state → health green → setup password → login → ETL auto-starts → browse ingredients → create component → create dish manually → import one recipe → create profile → generate plan → review calendar → swap one dish → save → view nutrient dashboard → export PDF → export ODS → view plan history → logout. Document any issues. | All phases | Verified full workflow | All user stories | M |
| 6.11 | Documentation: update README with quickstart (docker compose up, setup, ETL), architecture overview (container diagram, data flow), development guide (local setup, testing, code style, migration workflow). Update API docs (FastAPI auto-generates `/docs` — verify all endpoints documented). | All phases | Developer and user documentation | NFR §5 | S |

### Acceptance Criteria

- [ ] PDF export renders correctly in Firefox PDF viewer (all 6 sections present, no overflow, color-coded bars visible)
- [ ] ODS export opens in LibreOffice with correct formatting, all 4 sheets present, nutrient cells color-coded
- [ ] Cross-week variety: dish used in week 1 → week 2 generates with penalty → same dish less likely to appear (subjective — penalty coefficient validated in solver unit tests)
- [ ] Backend test suite: ≥80% coverage on `marieta/` package (excluding migration files)
- [ ] All NFR §1 timing targets met or documented with explanation
- [ ] Error handling: every error state triggerable and recoverable (network disconnect, 404, 422, 500)
- [ ] Keyboard: full calendar grid interaction possible without mouse
- [ ] End-to-end walkthrough completes without errors
- [ ] README: first-time user can follow steps and reach a generated plan

---

## Risk Register

| # | Risk | Phase | Likelihood | Impact | Mitigation |
|---|---|---|---|---|---|
| R1 | **MILP infeasible too often** — user has insufficient dishes for a feasible plan | 4 | Medium | High | Infeasibility relaxation cascade (Module 6.6). UI warns if eligible dish count <20. Guide user to build dish library before first plan generation. |
| R2 | **LLM normalization quality poor** for non-English recipes | 5 | Medium | Medium | Degraded mode: raw extraction with manual review. System prompt includes Spanish/French examples. Pydantic retry on validation failure. |
| R3 | **Ollama GPU passthrough fails** on some Docker hosts | 5 | Medium | Low | CPU-only fallback documented. Health endpoint reports Ollama status. Recipe import still works (degraded mode). |
| R4 | **Angular Signal Store learning curve** — developer unfamiliar with newest patterns | 0, 4 | Medium | Medium | Start with simple CRUD pages (Phase 1–2) to build familiarity. Signal Store has fewer concepts than classic NgRx. |
| R5 | **Nutrient data quality inconsistent** — missing values, conflicting measurements across sources | 1 | High | Medium | Confidence scoring tracks data quality. ETL logs low-confidence fields. Gap report flags nutrients with low-confidence ingredients. User overrides available (US-2.3). |
| R6 | **Scope creep from fully-spec'd features** — every module is fully designed, tempting to build everything | All | High | High | Strict phase ordering. Features outside current phase scope are blocked. PRD priority levels (Must/Should/Nice-to-Have) enforced at each phase review. |
| R7 | **Cross-week variety needs plan history** — no variety signal in first 1–3 weeks | 4 | Certain | Low | Penalty term naturally starts at zero. Correct behavior — variety improves over time. UI note: "Variety tracking improves with multiple weeks of use." |
| R8 | **Redis draft_token expiry** — user loses draft if Redis restarts mid-review | 4 | Low | Low | Full plan data returned in generate response (frontend displays immediately). Only swap/save need Redis. User re-generates (<5s). Annoyance, not data loss. |
| R9 | **Docker Compose complexity** — 5 services with networking, volumes, GPU passthrough | 0 | Medium | Medium | `.env.example` with all variables documented. `docker compose up` tested on Linux, macOS, Windows+WSL2 before Phase 0 sign-off. CPU-only fallback for Ollama. |
| R10 | **Python 3.13 library compatibility** — OR-Tools, WeasyPrint, SQLAlchemy may not support newest Python | 0 | Low | Medium | Pin to Python 3.12 if compatibility issues found during Phase 0. Document minimum supported version. |

---

## Test Data Plan

### Minimum viable dish library for solver development (Phase 4)

The solver needs realistic test data before user has populated the system. Seed a development fixture with:

| Category | Count | Examples |
|---|---|---|
| Main dishes — Chicken | 10 | Grilled Chicken + Rice + Broccoli, Chicken Stir-Fry + Noodles, Chicken Salad, etc. |
| Main dishes — Beef | 6 | Steak + Potatoes + Asparagus, Beef Stew, Burger + Salad |
| Main dishes — Fish/Seafood | 8 | Salmon + Quinoa + Spinach, Tuna Pasta, Shrimp Stir-Fry, Sardine Salad |
| Main dishes — Legume-based | 6 | Lentil Curry + Rice, Chickpea Bowl, Bean Chili, Tofu Stir-Fry |
| Main dishes — Egg-based | 4 | Omelette + Salad, Frittata + Vegetables, Shakshuka |
| Main dishes — Pork | 4 | Pork Tenderloin + Sweet Potato, Pork Stir-Fry |
| Main dishes — Pasta/Rice forward | 6 | Pasta Bolognese, Carbonara, Risotto, Paella |
| Main dishes — Varied | 6 | Combinations covering all meal types (Lunch/Dinner/Both) |
| Side dishes | 15 | Green Salad, Steamed Vegetables, Roasted Peppers, Bread, Soup, etc. |
| Dessert dishes | 10 | Fresh Fruit, Yogurt + Honey, Fruit Salad, Berries + Cream, etc. |

**Total**: 50 Main + 15 Side + 10 Dessert = 75 dishes.

This covers: all meal types, multiple protein sources, liked/disliked variants, component reuse patterns (same Grilled Chicken component in multiple dishes), dietary restriction filtering (vegetarian dishes, no-pork dishes).

### ETL test data

For Phase 1 development, use small subsets of actual source data (~100 foods each) before running full imports. This allows fast iteration on normalization and dedup logic without waiting for 10-minute full imports.

---

## Post-MVP / Deferred Features

Features explicitly deferred per PRD priority levels and open questions document:

| Feature | Reason for Deferral | Where Spec'd |
|---|---|---|
| Open Food Facts integration | Nice-to-Have; CIQUAL+USDA+NEVO covers ~15,000 foods | PRD F26 |
| Component-level variety penalty | Low impact for single user; dish-identity penalty is sufficient | Open Questions A10 |
| Shopping list "already in inventory" flag | Requires full inventory tracking system | Open Questions §Implementation Priority |
| Advanced supplement interactions (multi-nutrient, timing) | Over-engineering for planning tool | Open Questions Q10-B |
| Breakfast/snack planning | Out of scope per PRD §6 | PRD §6 |
| Mobile-native app | Out of scope | PRD §6 |
| Multi-user accounts | Out of scope | PRD §6 |
| Automated grocery ordering | Out of scope | PRD §6 |
| Barcode scanning | Out of scope | PRD §6 |
| Calorie tracking from consumption | Planning system, not tracking app | PRD §6 |
| Imperial units | Metric only | PRD §6 |
| Cloud-hosted deployment | Local Docker Compose only | PRD §6 |

---

## Source Document Cross-Reference

| Phase | PRD | Functional Specs | User Stories | Data Model | API Spec | NFR | Style Guide | Open Questions |
|---|---|---|---|---|---|---|---|---|
| 0 | §5 (Tech Stack) | §17 (Auth) | US-15.1–15.3 | All entities | §0, §1 | §2, §5, §8 | Color palette, Typography | Q6 |
| 1 | F1, F10 | §1, §2 | US-1.1–1.2, US-2.1–2.5 | §1–2, §13–14, §16 | §2, §10–11 | §1 (search <500ms, ETL timing) | — | A1–A3, A5, A15, Q4 |
| 2 | F2, F4, F14 | §3, §5 | US-3.1–3.4, US-4.1–4.2, US-5.8 | §3–6, §15 | §3, §4, §13 | §1 (CRUD <200ms) | — | A6, A12, Q5 |
| 3 | F3, F15, F18 | §4, §9, §13 | US-5.1–5.7, US-9.1, US-13.1 | §7–8b | §5 | §1 (CRUD <200ms) | — | A6, A8, Q3, Q8 |
| 4 | F5–F9, F11, F16–F17, F19–F20, F23–F25 | §6–8, §10–12, §14–15 | US-6.1–8.1, US-10.1–12.1, US-16.1–16.2 | §9–12 | §6–8 | §1 (solve <10s, API <200ms), §3 | Plan view, Nutrient bars, Status line | A4, A7–A11, A13, Issue #1, Q1, Q3, Q9–10 |
| 5 | F13 | §4.1c | US-5.5 | §16 | §12 | §1 (import <45s), §11 | — | A14 |
| 6 | F21–F22 | §16, §18 | US-14.1–14.2, US-16.1–16.2 | — | §7, §9 | §1 (PDF <5s, ODS <3s), §6 | — | — |
