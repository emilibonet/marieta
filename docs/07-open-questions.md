# Open Questions & Assumptions Log

---

## Assumptions Made

These assumptions were inferred from context but not explicitly confirmed. They should be validated before or during implementation.

### A1 — EFSA DRV Data Availability

**Assumption**: EFSA Dietary Reference Values for all 17 tracked nutrients are publicly available in a structured format (or can be extracted from EFSA publications) for Adult Male and Adult Female demographics.

**Risk**: Some nutrients (e.g., Omega-3) may have only an Adequate Intake (AI) rather than a Population Reference Intake (PRI). Iodine reference values may vary by country within Europe.

**Mitigation**: Use AI where PRI is unavailable. Source from the most recent EFSA summary tables. Flag nutrients where only AI is available.

---

### A2 — USDA FDC Omega-3 Coverage

**Assumption**: USDA FoodData Central provides Omega-3 fatty acid values (DHA + EPA + ALA) for a meaningful subset of foods in the SR Legacy and Foundation Foods datasets.

**Risk**: Omega-3 data is often split across multiple nutrient IDs (DHA, EPA, ALA separately) and may be missing for many foods. Aggregation logic is needed.

**Mitigation**: Sum DHA + EPA + ALA into the single `omega3` field. Accept that many non-fish ingredients will have `omega3 = null`.

---

### A3 — Iodine Data Scarcity

**Assumption**: Iodine values will be missing for the majority of ingredients in both USDA and Ciqual databases, as iodine is one of the least-reported micronutrients.

**Risk**: Optimizer may consistently report iodine gaps, and food-based interventions may be limited.

**Mitigation**: Pre-populate known high-iodine foods (iodized salt, seaweed, dairy, fish) with verified values. Accept that iodine supplementation recommendations will be common.

---

### A4 — Protein Quality Factor Values

**Assumption**: The protein quality factors (1.0 for animal, 0.65 for legumes, etc.) are reasonable approximations derived from PDCAAS/DIAAS literature but are not sourced from a single authoritative table.

**Risk**: Experts may disagree on exact values. Different legumes have different scores.

**Mitigation**: Make protein quality factors editable per ingredient. Document the source/rationale for default values. Allow the user to disable protein quality adjustment entirely via a profile setting.

---

### A5 — Dry-to-Cooked Conversion Ratios

**Assumption**: The conversion ratios (e.g., lentils 1:2.5, rice 1:3) are standard kitchen approximations, not lab-measured constants.

**Risk**: Actual ratios vary by variety, cooking method, and water absorption. This introduces ~10-20% error in nutrient calculations for legumes and grains.

**Mitigation**: Make ratios editable per ingredient. Display a note in the UI when nutrient values are derived via conversion.

---

### A6 — Flavor System Nutritional Contribution

**Assumption**: Flavor systems (sauces, dressings) contribute meaningful calories and fats but negligible micronutrients (except where specific ingredients like garlic, lemon, or fermented sauces are used).

**Risk**: If a user models a complex sauce (e.g., peanut sauce with significant protein and fat), it changes the dish's nutritional profile substantially.

**Mitigation**: Full nutritional modeling of flavor systems is already specified. No simplification assumed — all key ingredients are summed into the flavor system's nutrient vector.

---

### A7 — Single-User Implies No Concurrent Access

**Assumption**: Since the app is single-user, there are no concurrent write conflicts to handle. No optimistic locking, no websocket-based real-time sync.

**Risk**: If the user opens two browser tabs, concurrent writes could cause race conditions (e.g., saving two different plans for the same week).

**Mitigation**: Last-write-wins is acceptable for a single-user app. Add `week_start` unique constraint on `WeeklyPlan` to prevent duplicate plans for the same week.

---

### A8 — Structural Validity Threshold

**Assumption**: The threshold "≥15% of weekly target for any Tier 1/2 nutrient per serving" used to define "micronutrient-dense component" is a reasonable heuristic.

**Risk**: This threshold may be too strict (few vegetables meet it) or too lenient (everything meets it).

**Mitigation**: Make the threshold configurable (default 15%). Evaluate against test data during development and adjust.

---

### A10 — Cross-Week Variety Based on Dish Identity

**Assumption**: Cross-week variety penalty is based on **dish identity** (same dish ID in past weeks), not on **component similarity** (similar-tasting meals with different names are not penalized).

**Risk**: User could create near-identical dishes under different names, defeating the variety penalty.

**Mitigation**: This is acceptable for a single-user system — the user is only "gaming" themselves. A future enhancement could add component-level similarity penalty.

---

### A11 — Shelf-Life Constraints Apply Only to Batch-Cooked Components

**Assumption**: Shelf-life validation in the optimizer applies only to components prepared in one of the two cooking sessions, not to raw ingredients purchased fresh.

**Risk**: Some raw vegetables or dairy products may spoil during the week.

**Mitigation**: Ingredient-level `shelf_life_days` is modeled but not enforced in the optimizer. It could be used for shopping list "buy fresh" recommendations in a future version.

---

### A12 — Cooking Losses Modeled via Retention Factors

**Assumption**: Nutrient values used in the optimizer are adjusted by USDA Nutrient Retention Factors (Release 6) based on the cooking method — whether applied at the component level (batch-cooked) or at the dish level (direct ingredients cooked at meal time). This models nutrient degradation during cooking (e.g., Vitamin C loss from boiling, Folate loss from baking).

**Risk**: Retention factors are averages across food categories and may not precisely match specific ingredients. Actual nutrient loss depends on cooking time, temperature, water volume, and other variables.

**Mitigation**: Retention factors are editable via the admin API. The system uses food-group-specific factors where available, falling back to general-method defaults. A note in the nutrient dashboard indicates that values include estimated cooking losses.
---

### A13 — Meal Structure: Main + Optional Side + Optional Dessert

**Assumption**: Each meal (Lunch/Dinner) consists of exactly 1 required Main dish + 0–1 optional Side dish (e.g., salad, steamed vegetables — may be shared across the day) + 0–1 optional Dessert (e.g., fresh fruit, yogurt). This replaces the previous model of 1 dish per meal slot.

**Risk**: The optimizer's variable count increases (from 14 binary variables per dish to up to 42), which could impact solve time. Side and Dessert dishes, being unstructured (no protein/fiber requirements), may not contribute meaningfully to nutrient coverage.

**Mitigation**: Side and Dessert dishes still contribute their full nutritional profiles to weekly totals. The solve time impact is manageable — OR-Tools CP-SAT handles the increased variable count within the 10-second budget. Side/Dessert dishes are optional in the MILP (≤1 per slot, not =1).

---

### A14 — Recipe Import Pipeline (Extraction + LLM Normalization)

**Assumption**: Recipe import uses a two-stage pipeline: (1) raw extraction from the recipe URL via Schema.org JSON-LD or HTML heuristic parsing, followed by (2) LLM normalization via a locally-hosted Gemma 4 model (served by Ollama). The LLM handles translation to English, ingredient parsing, unit conversion to metric, preparation detection, cooking method inference, and component candidacy hints. All inference runs locally — no data is sent to external APIs.

**Risk**: LLM output quality may vary for unusual ingredients, rare languages, or ambiguous recipe formats. Gemma 4 hardware requirements (GPU or ≥16 GB RAM for CPU fallback) may exceed some users’ local setups.

**Mitigation**: LLM output is validated against a strict Pydantic schema with one automatic retry on validation failure. If normalization fails entirely, raw extraction is presented to the user for manual review. The system works without the LLM (degraded mode) — users can always enter recipes manually. CPU-only inference is supported as a slower fallback.
---

### A15 — Data Source Priority: CIQUAL > USDA > NEVO

**Assumption**: CIQUAL (ANSES) is the primary data source for ingredient nutritional profiles, selected because it is the European standard with high-quality lab data. USDA FDC serves as a secondary gap-filler for foods not covered by CIQUAL. NEVO (RIVM, Netherlands) provides tertiary coverage for additional European foods. Open Food Facts is optional for branded/packaged products.

**Risk**: CIQUAL covers ~3,500 foods — fewer than USDA's ~10,800. Many common non-European foods may only exist in USDA. Deduplication between three sources adds complexity.

**Mitigation**: The deduplication algorithm uses food identifiers and name matching with source priority. CIQUAL entries always take precedence. For foods only in USDA or NEVO, those entries are used without conflict. The ETL pipeline logs all deduplication decisions for transparency.
---

## Resolved Questions

All questions below have been resolved. Decisions are final for v1 implementation.

### Q1 — Hydration Reminder Implementation

**Context**: Hydration is modeled as a "daily reminder target, not included in MILP." How should this be displayed?

**Decision**: **(A) Static text on the daily view**: "Remember to drink X liters of water today"

**Rationale**: Hydration is outside the optimizer's scope. A simple text reminder on the daily view achieves the goal without engineering overhead. The hydration target value is stored in the profile for configurability.

✅ RESOLVED

---

### Q2 — Rejected Dish Candidate Persistence

**Context**: Previously the system included a combinatorial dish candidate generator. This feature has been removed — dishes are now created manually or imported from recipe websites.

**Decision**: **No longer applicable.** The `RejectedDishCombination` table and candidate generation workflow have been removed.

✅ RESOLVED (superseded)

---

### Q3 — Component Serving Size at Dish Level vs. Fixed

**Context**: The spec says component serving sizes are fixed (`standard_serving_g`) with a per-dish `serving_multiplier`. Should the optimizer be allowed to vary the multiplier, or is it fixed at dish-creation time?

**Decision**: **(A) Multiplier fixed at dish-creation time** — the optimizer selects dishes, not portion sizes.

**Rationale**: Keeping the dish as a fixed nutritional unit preserves the MILP's binary variable structure (efficient, guaranteed optimal). Introducing continuous portion variables would create a mixed-integer nonlinear program or at minimum a much larger LP relaxation. The user controls portion sizes by creating dish variants (e.g., "Chicken + Rice (large)" vs. "Chicken + Rice (standard)"). This is the correct trade-off between solver tractability and user flexibility.

✅ RESOLVED

---

### Q4 — Ingredient Tagging Scope

**Context**: Dietary restrictions work by ingredient tags (e.g., "shellfish", "pork"). Who defines these tags?

**Decision**: **(A) System provides standard tags + user can add custom tags.**

**Standard tag set (seeded at setup):**
`meat`, `poultry`, `fish`, `shellfish`, `dairy`, `gluten`, `soy`, `nuts`, `tree-nuts`, `peanuts`, `eggs`, `pork`, `alcohol`, `nightshade`, `legume`, `seed`

**Rationale**: Standard tags aligned with common allergen and dietary categories (EU Regulation 1169/2011 lists 14 major allergens — this covers them). Custom tags allow for personal restrictions (e.g., "high-histamine", "low-FODMAP"). During ETL import, standard tags are auto-assigned to known ingredients where possible (e.g., all USDA entries classified as "Finfish and Shellfish Products" get the `fish` or `shellfish` tag).

✅ RESOLVED

---

### Q5 — Cooking Method Impact on Nutrition

**Context**: Assumption A12 noted that cooking losses were not modeled. Should this be addressed in v1?

**Decision**: **(B) Model cooking losses in v1** using USDA Nutrient Retention Factor tables.

**Rationale**: Cooking losses significantly affect heat-sensitive nutrients (Vitamin C: up to 50% loss from boiling, Folate: up to 40% from baking). Without retention factors, the optimizer would systematically overestimate coverage for these nutrients, undermining the system’s core value proposition of nutritional accuracy. The implementation is well-scoped: (1) seed 17 nutrients × 8 cooking methods retention factor table from USDA data, (2) apply per-nutrient multipliers during `nutrients_per_serving` derivation on the Component entity, (3) make factors editable via admin API for fine-tuning.

**Implementation note**: Add a `RetentionFactor` table (nutrient_key, cooking_method, food_group, retention_factor). During component nutrient derivation: `nutrients_per_serving[n] = raw_nutrients[n] × (serving_g / 100) × retention_factor[n][method]`. Components with `cooking_method = 'Raw'` always use factor 1.0. Retention factors are seeded from USDA Nutrient Retention Factor Release 6.

✅ RESOLVED

---

### Q6 — ETL Trigger Mechanism

**Context**: The ETL import needs to be triggered somehow.

**Decision**: **(B) + (C)** — Auto-import on first startup if database is empty; manual re-import from a settings page in the UI.

**Implementation details**:
- On first `docker compose up`, after DB migrations run, the backend checks if the `ingredients` table is empty. If so, it triggers the CIQUAL + USDA FDC + NEVO ETL automatically as a background job.
- A settings page provides an "Import/Refresh Nutritional Data" button with source selection (CIQUAL / USDA FDC / NEVO / All). Triggers the same ETL pipeline.
- ETL job status is polled from the UI (progress bar: imported X of Y; current phase).
- A CLI command (`python -m marieta.etl run --source ciqual|usda|nevo|all`) is also available for scripted/headless use.

✅ RESOLVED

---

### Q7 — UI Language

**Context**: The spec doesn't mention localization.

**Decision**: **English-only UI for v1.** No i18n framework needed.

**Rationale**: The user communicates in English, the data sources are English (USDA) and French (Ciqual — but ingredient names will be kept in their original language alongside English aliases for searchability). Angular's i18n can be added later if localization is needed.

✅ RESOLVED

---

### Q8 — Complementary Protein Detection Scope

**Context**: The spec mentions that legumes + grains in the same dish receive a complementary protein bonus ($q = 0.85$). Should this detection extend beyond same-dish?

**Decision**: **(A) Same-dish combinations only.**

**Rationale**: Same-day complementation (legumes at lunch, grains at dinner) is biochemically valid — amino acids are pooled over several hours. However, modeling this in the MILP would require binary interaction variables across dish pairs within a day, significantly increasing complexity for a marginal improvement in protein quality accuracy. The same-dish model is a conservative, simple, and defensible approximation. Users who want to ensure complementation can create dishes that explicitly combine legumes + grains.

✅ RESOLVED

---

### Q9 — Plan Overwrite vs. Archive on Re-Generation

**Context**: If the user generates a new plan for a week that already has a saved plan, what happens?

**Decision**: **(B) Archive the old plan and replace with the new one.**

**Rationale**: Option (A) adds friction — the user must navigate to history, delete, then return to the planner. Option (C) introduces ambiguity about which plan is "active." Option (B) is the smoothest UX: the old plan automatically moves to history (marked as `superseded = true`), and the new plan becomes the active one. The user can still view old versions in plan history. This also preserves cross-week variety data from superseded plans (the variety penalty considers all historical plans, not just non-superseded ones).

**Implementation note**: Add `is_superseded: bool` (default false) to `WeeklyPlan`. When saving a new plan for a week that already has a saved plan, set the existing plan's `is_superseded = true` before inserting the new one. The `week_start` unique constraint is removed; instead, enforce "at most one non-superseded plan per `week_start`" via a partial unique index.

✅ RESOLVED

---

### Q10 — Supplement Modeling Depth

**Context**: Supplements are marked as `is_supplement = true` in the ingredient library. How detailed should supplement modeling be?

**Decision**: **(A) Simple modeling for v1.** User adds a supplement ingredient with a NutrientVector per tablet/unit. System recommends "take X tablets of Y on day Z." EFSA Upper Tolerable Levels (UL) cap the optimizer's supplement variables.

**Implementation details**:
- Supplements are ingredients with `is_supplement = true` and `serving_model = UnitBased`
- `nominal_serving_g` represents one tablet/capsule
- `nutrients_per_100g` contains the per-unit nutrient values (despite the field name, supplements use per-unit values stored as-is since `serving_model = UnitBased`)
- The optimizer's `suppMax_ν` for each nutrient is derived from `EFSA_UL_daily - food_contribution_daily` (ensures total intake from food + supplements does not exceed UL)
- Supplement recommendations display: nutrient name, supplement name, dosage (tablets/day), which days, and the gap it closes

✅ RESOLVED

---

## Issue #1 — Component Batch-Day Alignment with Shelf Life

**Discovered**: 2026-04-20 (document review)

**Problem**: A component prepared in Session 1 (Sunday) must survive until its last use day. If a component has `storable_days = 4`, and the user wants to use it on Friday (day 5), the component would spoil before then. The temporal constraint ($d - \text{cook\_day}(c) \leq c.\text{storable\_days}$) catches this, but the solver's infeasibility handling doesn't currently attempt to reassign components between sessions as a first remedy — it relaxes the constraint entirely instead.

**Proposed**:

> **Option A — Soft constraint with post-solve reassignment**: Make shelf-life a soft constraint with a high penalty weight. If violated, the batch cooking plan derivation step attempts to reassign the component to a later session. If reassignment resolves the violation, the plan is updated. If not, warn the user. [Recommended]

> **Option B — Tighter temporal constraints in MILP**: Add per-component per-session binary variables to the MILP, constraining which session each component can be assigned to. This increases variable count but guarantees feasibility up front.

> **Option C — Accept as-is**: The user is responsible for choosing storable components. The infeasibility relaxation already handles this, and the user gets a warning.

**Decision**: Option A — see Module 15.3 in functional specs (updated to soft constraint with post-solve reassignment).  

---

## Implementation Priority Notes

The following items from the spec are candidates for deferral to post-v1:

| Feature | Reason | Priority |
|---|---|---|
| Open Food Facts integration (F25) | Nice-to-have; CIQUAL + USDA + NEVO cover most needs | Post-v1 |
| Component-level variety penalty (A10) | Low impact for single user | Post-v1 |
| Shopping list "already in inventory" flag | Requires full inventory tracking | Post-v1 |
| Advanced supplement interactions (Q10-B) | Over-engineering for planning tool | Post-v1 |
