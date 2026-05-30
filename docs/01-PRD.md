# Product Requirements Document (PRD)

## Project Name

**Marieta** — Modular Nutritionally-Constrained Weekly Meal Planning System

---

## 1. Purpose and Problem Being Solved

Most meal planning approaches fail because they either:

- Prioritize taste/convenience while ignoring nutritional completeness
- Are nutritionally rigorous but impractical (require daily cooking, ignore batch preparation)
- Produce repetitive plans that are unsustainable beyond a few weeks
- Ignore real-world constraints: ingredient availability, shelf life, and cooking time

Marieta solves this by formalizing weekly meal planning as a **constraint optimization problem**, producing guaranteed-optimal plans that satisfy macro- and micronutrient targets while maximizing ingredient reuse, minimizing cooking sessions, and adapting to user preferences and inventory.

The system is an **adaptive, data-driven, inventory-aware nutrition optimization engine** — not a static meal planner.

---

## 2. Target User

**Single technically-capable user** who:

- Wants nutritional completeness backed by authoritative European/international data (EFSA, USDA)
- Practices batch cooking (1–2 sessions/week)
- Assembles most meals from pre-cooked components
- Wants to minimize daily decision-making while maintaining variety
- May cook for 1 or more people (scalable portions)
- Uses metric units exclusively

---

## 3. Goals and Success Metrics

| Goal | Metric | Target |
|---|---|---|
| Nutritional completeness | Weekly nutrient coverage across all 17 tracked nutrients | ≥90% of targets |
| Preparation efficiency | Batch cooking sessions per week | ≤2 |
| Assembly ratio | Meals assembled from pre-cooked components (assembly may include light per-meal cooking, e.g. searing protein) | ≥80% assembled |
| Ingredient waste | Unused purchased ingredients per week | Minimal (system-tracked) |
| Variety | Unique main dishes per week / cross-week non-repetition | 14 unique mains; 3-week variety window |
| Planning time | Time from opening planner to finalized plan | ≤30 minutes/week |
| Plan generation speed | Solver computation time | ≤5 seconds |
| Sustainability | System usable across months without degradation of variety or user satisfaction | Subjective; tracked via preference feedback |

---

## 4. High-Level Feature List

### Must Have (MVP)

| # | Feature | Description |
|---|---|---|
| F1 | Ingredient library | Browse, search, add, edit, delete ingredients with full nutritional profiles sourced from CIQUAL, USDA FDC, and NEVO |
| F2 | Component library | Define reusable batch-cooked components from one or more ingredients (grilled chicken, steamed broccoli, mashed potatoes, samfaina, etc.) |
| F3 | Dish library | Define dishes from components and/or direct ingredients (cooked at meal time); classify lunch/dinner; manual creation or recipe import; dish roles: Main, Side, Dessert |
| F4 | Flavor systems | Model sauces/seasoning profiles as ingredient-based components with nutritional contributions |
| F5 | Planning profiles | EFSA-derived nutrient targets with profile presets (Balanced, Weight Loss, Muscle Gain) and custom profiles |
| F6 | Weekly planner | Calendar grid (Mon–Sun × Lunch/Dinner); each meal = 1 required main + optional side + optional dessert; MILP-based plan generation; manual swaps; pinned meals; exclusions |
| F7 | Nutrient dashboard | Weekly coverage visualization per nutrient; gap diagnostics; supplement recommendations |
| F8 | Shopping list | Auto-generated from weekly plan; scaled by number of people; grouped by category |
| F9 | Batch cooking plan | Two-session schedule with component assignments, quantities, and total time estimates |
| F10 | Nutritional data pipeline | ETL for CIQUAL, USDA FDC, and NEVO datasets; normalization to internal schema; confidence flags |
| F11 | Authentication | Simple local password login (single user) |
| F12 | Data persistence | PostgreSQL storage; all data persists across sessions |
| F13 | Recipe import | Import dishes from recipe websites (Schema.org extraction + HTML fallback); normalize multilingual ingredients, units, and preparation methods via locally-hosted Gemma 4 LLM; fuzzy-match to local ingredient library; create dishes from imported recipes |
| F14 | Cooking loss modeling | Apply USDA Nutrient Retention Factors by cooking method to derive accurate cooked nutrient values |

### Should Have

| # | Feature | Description |
|---|---|---|
| F15 | Dish substitution | When a main dish is unavailable, suggest nutritionally-similar alternatives ranked by similarity and preference |
| F16 | Explainability | Per-meal, per-substitution, and per-supplement annotations explaining optimizer decisions |
| F17 | Daily view | Detailed view for a selected day: dishes, assembly instructions, nutrient contributions |
| F18 | Recipe/assembly view | Preparation as a DAG (directed acyclic graph) showing parallelizable steps; critical path and timing; component sub-graphs expandable inline; flat linearized view available as fallback |
| F19 | Preference & feedback | Like/dislike per dish; repetition tolerance; feedback influences future plans |
| F20 | Scenario modes | Strict, Flexible, Inventory modes affecting optimizer behavior |
| F21 | Export — PDF | Weekly calendar grid + nutrient summary + shopping list + batch cooking plan |
| F22 | Export — ODS | Multi-sheet export: weekly grid, nutrient breakdown, shopping list, ingredient library |

### Nice to Have

| # | Feature | Description |
|---|---|---|
| F23 | Plan history | Browse past weeks; cross-week variety tracking; re-run previous plans |
| F24 | Temporal shelf-life validation | Ensure no component is served beyond its shelf life from the cooking session |
| F25 | Nutrient gap minimal interventions | "Add 20g pumpkin seeds to 3 meals to close Zinc gap by 68%" suggestions |
| F26 | Open Food Facts integration | Optional lookup for European branded/packaged foods and supplements |

---

## 5. Known Constraints

### Technical Stack (Decided)

| Layer | Technology |
|---|---|
| Frontend | Angular 17+ (TypeScript, Standalone Components, Angular Material) |
| State management | NgRx (Signal Store) |
| Backend | Python 3.12 + FastAPI |
| Optimizer | Google OR-Tools CP-SAT |
| ORM | SQLAlchemy 2.0 (async) + Alembic |
| Database | PostgreSQL 16 |
| Cache | Redis |
| Export — ODS | odfpy |
| Export — PDF | WeasyPrint |
| Deployment | Docker Compose (local machine) |

### Data Sources

| Source | Role | Priority | Access |
|---|---|---|---|
| CIQUAL (ANSES) | Primary nutritional profiles — European standard | 1 (Primary) | Static bulk download (Excel/CSV) |
| USDA FoodData Central (SR Legacy + Foundation Foods) | Gap-filler for foods not covered by CIQUAL | 2 (Secondary) | Bulk download (embedded at build) + optional live API |
| NEVO (RIVM) | Dutch food composition — additional European coverage | 3 (Tertiary) | Static bulk download (Excel/CSV) |
| EFSA Dietary Reference Values | Default nutrient targets | Reference | Hardcoded structured constants |
| Open Food Facts | Optional: branded/packaged foods and supplements | Optional | Free REST API |

### Other Constraints

- **Units**: Metric only (grams, milligrams, micrograms, litres/millilitres)
- **Users**: Single user (with scalable portion count)
- **Meals**: Lunch + Dinner only (no breakfast, no snacks); each meal = 1 required main dish + 0–1 optional shareable side (e.g., salad) + 0–1 optional dessert (fruit, yogurt)
- **Auth**: Simple local password (bcrypt)
- **Hosting**: Docker Compose on local machine/NAS
- **Export**: One-way only (no re-import from ODS/PDF)

---

## 6. Out of Scope

- Breakfast and snack planning
- Multi-user accounts / role-based access
- Mobile-native app (responsive web only)
- Real-time collaboration
- Automated grocery ordering / delivery integration
- Barcode scanning for inventory
- Calorie tracking from consumption (this is a planning system, not a tracking app)
- Imperial units
- Cloud-hosted deployment (user deploys locally via Docker Compose)
- Re-importable ODS/PDF (exports are one-way)
- Hydration tracking within meals (modeled as a separate daily reminder, not in optimizer)

