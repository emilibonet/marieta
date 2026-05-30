# API Specification

## Base URL

```
http://localhost:8000/api/v1
```

## Authentication

All endpoints except `/auth/setup` and `/auth/login` require a valid session.

- **Mechanism**: HTTP-only secure cookie (`session_id`) set on login
- **CSRF**: Token-based protection via `X-CSRF-Token` header on mutating requests
- **Unauthorized response**: `401 Unauthorized` with `{"detail": "Not authenticated"}`

---

## Common Response Patterns

**Success (single entity):**
```json
{ "data": { ... } }
```

**Success (list):**
```json
{ "data": [ ... ], "total": 150, "page": 1, "page_size": 50 }
```

**Error:**
```json
{ "detail": "Human-readable error message", "code": "ERROR_CODE" }
```

**Common error codes:**

| HTTP | Code | Meaning |
|---|---|---|
| 400 | `VALIDATION_ERROR` | Request body failed validation |
| 401 | `NOT_AUTHENTICATED` | No valid session |
| 404 | `NOT_FOUND` | Entity does not exist |
| 409 | `CONFLICT` | Uniqueness or referential constraint violated |
| 422 | `UNPROCESSABLE` | Business rule violation (e.g., delete blocked by references) |
| 429 | `RATE_LIMITED` | Too many requests |
| 500 | `INTERNAL_ERROR` | Unexpected server error |

---

## 0. Health

### GET `/health`

Service health check. Used by Docker Compose healthchecks and monitoring.

- **Auth**: Not required
- **Response**: `200 OK`
  ```json
  {
    "status": "healthy",
    "checks": {
      "database": "ok",
      "redis": "ok",
      "ollama": "ok"
    },
    "version": "0.1.0"
  }
  ```
- **`200 OK` with `ollama: "degraded"`**: Ollama container reachable but model not yet pulled (recipe import will show degraded mode).
- **`200 OK` with `ollama: "unavailable"`**: Ollama container is down — recipe import will fall back to manual entry.
- **`503 Service Unavailable`**: Database or Redis is down.

---

## 1. Authentication

### POST `/auth/setup`

Create initial password (first-time setup only).

- **Precondition**: No user exists in the database
- **Request Body**:
  ```json
  { "password": "string (min 8 chars)" }
  ```
- **Response**: `201 Created`
  ```json
  { "data": { "message": "Setup complete" } }
  ```
- **Errors**: `409 CONFLICT` if user already exists

### POST `/auth/login`

Authenticate and create session.

- **Request Body**:
  ```json
  { "password": "string" }
  ```
- **Response**: `200 OK` — Sets `session_id` cookie
  ```json
  { "data": { "message": "Logged in", "expires_at": "ISO datetime" } }
  ```
- **Errors**: `401` invalid password; `429` rate limited (>10 attempts/min)

### POST `/auth/logout`

Invalidate current session.

- **Response**: `200 OK` — Clears `session_id` cookie

### PUT `/auth/password`

Change password.

- **Request Body**:
  ```json
  { "current_password": "string", "new_password": "string (min 8 chars)" }
  ```
- **Response**: `200 OK` — All sessions invalidated
- **Errors**: `401` if current password incorrect

### GET `/auth/status`

Check if setup is complete and if session is valid.

- **Response**: `200 OK`
  ```json
  { "data": { "setup_complete": true, "authenticated": true } }
  ```

---

## 2. Ingredients

### GET `/ingredients`

List ingredients with search and filters.

- **Query Parameters**:
  | Param | Type | Default | Description |
  |---|---|---|---|
  | `q` | string | — | Fuzzy search on name + aliases |
  | `source` | string | — | Filter: `Ciqual`, `USDA_FDC`, `NEVO`, `UserDefined` |
  | `category` | string | — | Filter by component_categories (contains) |
  | `is_supplement` | bool | — | Filter supplements |
  | `is_active` | bool | true | Include inactive (soft-deleted) |
  | `sort_by` | string | `name` | `name`, `calories`, `protein` |
  | `sort_dir` | string | `asc` | `asc`, `desc` |
  | `page` | int | 1 | |
  | `page_size` | int | 50 | Max 200 |
- **Response**: `200 OK` — Paginated list of Ingredient objects

### GET `/ingredients/{id}`

Get single ingredient with full details.

- **Response**: `200 OK` — Ingredient object including `nutrients_per_100g`, `user_overrides`, `nutrient_confidence`

### POST `/ingredients`

Create a new user-defined ingredient.

- **Request Body**:
  ```json
  {
    "name": "string",
    "aliases": ["string"],
    "serving_model": "WeightBased | VolumeBased | UnitBased",
    "nominal_serving_g": 100.0,
    "nominal_serving_ml": null,
    "density_g_per_ml": null,
    "nutrients_per_100g": { NutrientVector },
    "shelf_life_days": 7,
    "component_categories": ["Protein"],
    "protein_quality_factor": 1.0,
    "is_supplement": false,
    "tags": ["meat", "poultry"]
  }
  ```
- **Notes**: For `VolumeBased` ingredients, `nominal_serving_ml` and `density_g_per_ml` are required; `nominal_serving_g` is auto-computed as `nominal_serving_ml × density_g_per_ml`
- **Response**: `201 Created` — Ingredient object
- **Errors**: `409 CONFLICT` if name already exists; `400` if validation fails

### PUT `/ingredients/{id}`

Update an ingredient. For external-sourced ingredients, changes are stored as `user_overrides`.

- **Request Body**: Partial Ingredient (only fields to update)
- **Response**: `200 OK` — Updated Ingredient object
- **Errors**: `404`; `409` if name conflicts

### DELETE `/ingredients/{id}`

Soft-delete an ingredient.

- **Response**: `200 OK`
- **Errors**: `422 UNPROCESSABLE` if referenced by active components (response includes list of dependent component IDs)

### POST `/ingredients/{id}/revert-overrides`

Revert user overrides to original source values.

- **Request Body**:
  ```json
  { "fields": ["calories", "protein"] }
  ```
  Omit `fields` to revert all overrides.
- **Response**: `200 OK` — Updated Ingredient object

### GET `/ingredients/search-fdc`

Search USDA FoodData Central API for ingredients not in local DB.

- **Query Parameters**:
  | Param | Type | Description |
  |---|---|---|
  | `q` | string | Search query |
  | `page_size` | int | Max 25 |
- **Response**: `200 OK`
  ```json
  {
    "data": [
      {
        "fdc_id": 12345,
        "description": "Chicken breast, raw",
        "nutrients": { NutrientVector },
        "source": "SR Legacy",
        "already_imported": false
      }
    ]
  }
  ```

### POST `/ingredients/import-fdc/{fdc_id}`

Import an ingredient from FDC search results into local library.

- **Response**: `201 Created` — Ingredient object
- **Errors**: `409` if already imported

---

## 3. Components

### GET `/components`

List components with filters.

- **Query Parameters**:
  | Param | Type | Default | Description |
  |---|---|---|---|
  | `category` | string | — | Protein, Carb, Vegetable, Fat, Flavoring |
  | `ingredient_id` | UUID | — | Filter by source ingredient |
  | `is_active` | bool | true | |
  | `page` | int | 1 | |
  | `page_size` | int | 50 | |
- **Response**: `200 OK` — Paginated list of Component objects

### GET `/components/{id}`

Get single component with derived nutritional profile.

- **Response**: `200 OK` — Component object including `nutrients_per_serving`

### POST `/components`

Create a new component.

- **Request Body**:
  ```json
  {
    "name": "Grilled Chicken Breast",
    "category": "Protein",
    "ingredients": [
      { "ingredient_id": "uuid", "quantity_g_per_serving": 160.0 }
    ],
    "cooking_method": "Grilled",
    "standard_serving_g": 160.0,
    "storable_days": 4,
    "freezable": false,
    "prep_time_min": 5,
    "cook_time_min": 20,
    "batch_yield_servings": 6,
    "preparation_graph": { "steps": [...], "edges": [...] }
  }
  ```
- **Response**: `201 Created` — Component object (nutrients_per_serving auto-computed)
- **Errors**: `409` name conflict; `404` ingredient not found; `400` if no ingredients provided

### PUT `/components/{id}`

Update a component. Nutritional profile recalculated if serving size changes.

- **Request Body**: Partial Component
- **Response**: `200 OK`

### DELETE `/components/{id}`

Soft-delete a component.

- **Response**: `200 OK`
- **Errors**: `422` if referenced by active dishes

---

## 4. Flavor Systems

### GET `/flavor-systems`

List all flavor systems.

- **Response**: `200 OK` — List of FlavorSystem objects with ingredient details and nutrient totals

### GET `/flavor-systems/{id}`

Get single flavor system with full details.

### POST `/flavor-systems`

Create a flavor system.

- **Request Body**:
  ```json
  {
    "name": "Mediterranean",
    "cuisine_tag": "Italian",
    "batch_cookable": true,
    "key_ingredients": [
      { "ingredient_id": "uuid", "quantity_g_per_serving": 10.0 },
      { "ingredient_id": "uuid", "quantity_g_per_serving": 5.0 }
    ],
    "compatible_component_ids": ["uuid", "uuid"],
    "preparation_graph": { "steps": [...], "edges": [...] }
  }
  ```
- **Response**: `201 Created`

### PUT `/flavor-systems/{id}`

Update a flavor system.

### DELETE `/flavor-systems/{id}`

Soft-delete. Blocked if referenced by active dishes.

---

## 5. Dishes

### GET `/dishes`

List dishes with filters.

- **Query Parameters**:
  | Param | Type | Default | Description |
  |---|---|---|---|
  | `q` | string | — | Search by name |
  | `meal_type` | string | — | Lunch, Dinner, Both |
  | `dish_role` | string | — | Main, Side, Dessert |
  | `liked` | bool | — | Filter liked/disliked |
  | `structural_valid` | bool | — | Filter by validity |
  | `is_active` | bool | true | |
  | `sort_by` | string | `name` | `name`, `calories`, `protein` |
  | `page` | int | 1 | |
  | `page_size` | int | 50 | |
- **Response**: `200 OK` — Paginated list of Dish objects

### GET `/dishes/{id}`

Get dish with full entry details (components and direct ingredients), nutritional breakdown, and recipe.

### POST `/dishes`

Create a dish manually.

- **Request Body**:
  ```json
  {
    "name": "Grilled Chicken with Quinoa and Broccoli",
    "dish_role": "Main",
    "meal_type": "Both",
    "entries": [
      { "entry_type": "Component", "component_id": "uuid", "role": "Protein", "serving_multiplier": 1.0 },
      { "entry_type": "Component", "component_id": "uuid", "role": "Carb", "serving_multiplier": 1.0 },
      { "entry_type": "Component", "component_id": "uuid", "role": "Vegetable", "serving_multiplier": 1.0 },
      { "entry_type": "DirectIngredient", "ingredient_id": "uuid", "cooking_method": "Sautéed", "serving_g": 140.0, "role": "Protein" }
    ],
    "flavor_system_id": "uuid or null",
    "preparation_graph": { "steps": [...], "edges": [...] },
    "notes": ""
  }
  ```
- **Response**: `201 Created` — Dish object with computed `total_nutrients`, `structural_valid`
- **Errors**: `409` name conflict; `400` validation (Main dishes: no protein source or <2 entries; Side/Dessert: <1 entry)

### PUT `/dishes/{id}`

Update a dish.

### DELETE `/dishes/{id}`

Soft-delete a dish.

### PATCH `/dishes/{id}/preference`

Set like/dislike preference.

- **Request Body**:
  ```json
  { "liked": true, "disliked": false }
  ```
- **Response**: `200 OK`

### GET `/dishes/{id}/substitutes`

Find nutritionally-similar substitutes for a dish.

- **Query Parameters**:
  | Param | Type | Default | Description |
  |---|---|---|---|
  | `meal_type` | string | (from dish) | Filter by meal type |
  | `available_component_ids` | string (comma-sep UUIDs) | — | Limit to dishes using these components |
  | `limit` | int | 3 | Max alternatives |
- **Response**: `200 OK`
  ```json
  {
    "data": [
      {
        "dish": { Dish },
        "similarity_pct": 94.2,
        "nutrient_comparison": { "original": NutrientVector, "substitute": NutrientVector },
        "reason": "Similar Protein/Iron/Omega-3 profile"
      }
    ]
  }
  ```

---

## 6. Profiles

### GET `/profiles`

List all profiles.

- **Response**: `200 OK` — List of Profile objects

### GET `/profiles/{id}`

Get profile with full details including weekly targets and nutrient weights.

### POST `/profiles`

Create a new profile (or fork from existing).

- **Request Body**:
  ```json
  {
    "name": "My Weight Loss Plan",
    "description": "Caloric deficit with high protein",
    "base_reference": "EFSA_Male",
    "fork_from_id": "uuid or null",
    "people_count": 1,
    "weekly_targets": { NutrientVector },
    "nutrient_weights": { "calories": 4.0, "protein": 3.0, ... },
    "planning_mode": "Strict",
    "dietary_restrictions": ["no-pork"],
    "max_repeats_per_dish": 1,
    "cross_week_variety_weeks": 3
  }
  ```
  If `fork_from_id` is set, omitted fields are copied from the source profile.
- **Response**: `201 Created`

### PUT `/profiles/{id}`

Update a profile.

- **Errors**: `422` if attempting to modify a built-in profile's `is_builtin` flag

### DELETE `/profiles/{id}`

Delete a profile.

- **Errors**: `422` if it's the last profile or if it's built-in; `422` if referenced by saved plans (must be unreferenced first — plans reference profile by ID at time of creation, but profile deletion doesn't cascade)

### GET `/profiles/efsa-defaults`

Get EFSA reference intake values for profile creation.

- **Query Parameters**:
  | Param | Type | Description |
  |---|---|---|
  | `demographic` | string | `Adult_Male` or `Adult_Female` |
- **Response**: `200 OK`
  ```json
  {
    "data": {
      "daily_pri": { NutrientVector },
      "daily_ai": { NutrientVector },
      "daily_ul": { NutrientVector },
      "weekly_targets": { NutrientVector },
      "default_weights": { "calories": 3.0, "protein": 3.0, ... }
    }
  }
  ```

---

## 7. Weekly Planning

### POST `/plans/generate`

Generate an optimized weekly plan. Returns a **draft** plan (not yet persisted — held server-side for 30 minutes).

- **Request Body**:
  ```json
  {
    "profile_id": "uuid",
    "week_start": "2026-04-20",
    "available_component_ids": ["uuid", ...],
    "pinned_meals": [
      { "day": "Monday", "slot": "Lunch", "sub_slot": "Main", "dish_id": "uuid" }
    ],
    "excluded_dish_ids": ["uuid"],
    "target_overrides": { "carbohydrates": 2100 },
    "session_1_day": "Sunday",
    "session_2_day": "Wednesday"
  }
  ```
- **Response**: `200 OK`
  ```json
  {
    "data": {
      "draft_token": "temp-uuid-for-saving",
      "assignments": [
        { "day": "Monday", "slot": "Lunch", "sub_slot": "Main", "dish_id": "uuid", "is_pinned": false, "explanation": "..." },
        { "day": "Monday", "slot": "Lunch", "sub_slot": "Side", "dish_id": "uuid or null", "is_pinned": false, "explanation": "..." },
        { "day": "Monday", "slot": "Lunch", "sub_slot": "Dessert", "dish_id": "uuid or null", "is_pinned": false, "explanation": "..." }
      ],
      "nutrient_totals": { NutrientVector },
      "nutrient_coverage": { "calories": 98.5, "protein": 102.1, ... },
      "supplement_schedule": { "Monday": { "vitamin_d": 25.0 }, ... },
      "gap_report": {
        "gaps": [
          {
            "nutrient": "iodine",
            "target": 1050.0,
            "actual": 640.5,
            "coverage_pct": 61.0,
            "status": "Significant",
            "interventions": [
              { "type": "food", "description": "Add 5g seaweed to 3 meals", "gap_closure_pct": 45 },
              { "type": "supplement", "description": "Take iodine supplement 150µg daily", "gap_closure_pct": 100 }
            ]
          }
        ]
      },
      "explanations": ["..."],
      "batch_cooking_plan": { ... },
      "shopping_list": [ ... ],
      "solver_status": "Optimal",
      "solver_time_ms": 1200
    }
  }
  ```
- **Behavior**: The generated plan is held server-side (in Redis, TTL 30 minutes) keyed by `draft_token`. The user can review, swap dishes, and then save or discard.
- **Errors**: `400` if no plan can be generated (insufficient dishes, invalid profile)

### POST `/plans/{draft_token}/swap`

Swap a dish in a **draft** plan (before saving).

- **Request Body**:
  ```json
  {
    "day": "Wednesday",
    "slot": "Lunch",
    "sub_slot": "Main",
    "new_dish_id": "uuid"
  }
  ```
- **Response**: `200 OK` — Updated draft with recalculated nutrient totals, coverage, and gap report; `is_modified = true`
- **Errors**: `404` if draft_token expired or not found

### POST `/plans/{draft_token}/save`

Persist a generated draft plan, making it immutable.

- **Request Body**: _(none — the server already has the full plan from generation and any swaps)_
- **Response**: `201 Created` — WeeklyPlan object with permanent `id`
- **Behavior**: If a non-superseded plan for this week already exists, it is automatically archived (`is_superseded = true`) before the new plan is saved. The archived plan remains accessible in plan history.
- **Errors**: `404` if draft_token expired or not found; `400` if not all 14 Main slots are filled

### GET `/plans`

List saved plans (history).

- **Query Parameters**:
  | Param | Type | Default | Description |
  |---|---|---|---|
  | `sort_dir` | string | `desc` | By week_start |
  | `page` | int | 1 | |
  | `page_size` | int | 20 | |
- **Response**: `200 OK` — Paginated list with summary (week, coverage avg, dish count)

### GET `/plans/{id}`

Get full plan details.

- **Response**: `200 OK` — Complete WeeklyPlan with all assignments, nutrients, gap report, batch plan, shopping list

### GET `/plans/{id}/daily/{day}`

Get detailed daily view.

- **Response**: `200 OK`
  ```json
  {
    "data": {
      "day": "Monday",
      "lunch": {
        "main": {
          "dish": { Dish with components },
          "nutrients": { NutrientVector },
          "explanation": "...",
          "preparation_graph": { "steps": [...], "edges": [...] }
        },
        "side": { "dish": { Dish } or null },
        "dessert": { "dish": { Dish } or null }
      },
      "dinner": {
        "main": { ... },
        "side": { ... or null },
        "dessert": { ... or null }
      },
      "daily_nutrients": { NutrientVector },
      "daily_target_comparison": { "calories": { "actual": 1800, "target": 1900, "pct": 94.7 }, ... },
      "supplements": { "vitamin_d": 25.0 }
    }
  }
  ```

### DELETE `/plans/{id}`

Delete a saved plan from history.

- **Response**: `200 OK`
- **Errors**: `422` cannot delete the current week's only plan

---

## 8. Nutrient Dashboard

### GET `/plans/{id}/nutrients`

Get comprehensive nutrient analysis for a plan (saved plan by ID or draft plan by draft_token).

- **Response**: `200 OK`
  ```json
  {
    "data": {
      "coverage": {
        "calories": { "target": 14000, "actual": 13720, "pct": 98.0, "status": "OK" },
        "protein": { ... },
        ...
      },
      "per_meal_breakdown": {
        "calories": [
          { "day": "Monday", "slot": "Lunch", "dish_name": "...", "value": 650 },
          ...
        ]
      },
      "gap_report": { ... },
      "supplement_schedule": { ... }
    }
  }
  ```

---

## 9. Export

### GET `/plans/{id}/export/pdf`

Export plan as PDF.

- **Response**: `200 OK`, `Content-Type: application/pdf`, `Content-Disposition: attachment; filename="marieta-week-2026-W16.pdf"`

### GET `/plans/{id}/export/ods`

Export plan as ODS spreadsheet.

- **Response**: `200 OK`, `Content-Type: application/vnd.oasis.opendocument.spreadsheet`, `Content-Disposition: attachment; filename="marieta-week-2026-W16.ods"`

---

## 10. Data Pipeline (Admin)

### POST `/admin/etl/run`

Trigger ETL import for a data source.

- **Request Body**:
  ```json
  { "source": "Ciqual | USDA_FDC | NEVO | All" }
  ```
- **Response**: `202 Accepted`
  ```json
  { "data": { "job_id": "uuid", "status": "running" } }
  ```

### GET `/admin/etl/status/{job_id}`

Check ETL job status.

- **Response**: `200 OK`
  ```json
  {
    "data": {
      "job_id": "uuid",
      "source": "USDA_FDC",
      "status": "completed | running | failed",
      "imported": 8700,
      "duplicates_resolved": 120,
      "low_confidence_fields": 450,
      "errors": [],
      "started_at": "...",
      "completed_at": "..."
    }
  }
  ```

---

## 11. Ingredient Tags

### GET `/ingredient-tags`

List all unique tags in use.

- **Response**: `200 OK` — `["dairy", "gluten", "meat", "shellfish", "pork", ...]`

### PUT `/ingredients/{id}/tags`

Set tags for an ingredient.

- **Request Body**:
  ```json
  { "tags": ["meat", "poultry"] }
  ```
- **Response**: `200 OK`

---

## 12. Recipe Import

### POST `/recipes/import-from-url`

Extract, normalize, and import a recipe from a website URL. Performs raw extraction (Schema.org / HTML) followed by LLM normalization (Gemma 4).

- **Request Body**:
  ```json
  {
    "url": "https://example.com/recipe/pasta-carbonara"
  }
  ```
- **Response**: `200 OK`
  ```json
  {
    "import_id": "uuid",
    "recipe_name": "Pasta Carbonara",
    "source_url": "https://example.com/recipe/pasta-carbonara",
    "source_language": "it",
    "extraction_method": "SchemaOrg",
    "llm_normalization_status": "Success",
    "cooking_method": "Sautéed",
    "dish_role_hint": "Main",
    "ingredients": [
      {
        "original_text": "100 g di spaghetti",
        "name": "spaghetti",
        "quantity": 100,
        "unit": "g",
        "preparation": null,
        "component_hint": "component",
        "match_type": "exact",
        "matched_ingredient_id": "uuid",
        "confidence": 1.0
      },
      {
        "original_text": "50 g di guanciale tagliato a listarelle",
        "name": "guanciale",
        "quantity": 50,
        "unit": "g",
        "preparation": "cut into strips",
        "component_hint": "direct_ingredient",
        "match_type": "fuzzy",
        "matched_ingredient_id": "uuid",
        "confidence": 0.85,
        "suggestion": "pancetta"
      },
      {
        "original_text": "2 tuorli d'uovo",
        "name": "egg yolk",
        "quantity": 36,
        "unit": "g",
        "preparation": null,
        "component_hint": "direct_ingredient",
        "match_type": "exact",
        "matched_ingredient_id": "uuid",
        "confidence": 1.0
      },
      {
        "original_text": "30 g di pecorino romano grattugiato",
        "name": "pecorino romano",
        "quantity": 30,
        "unit": "g",
        "preparation": "grated",
        "component_hint": "direct_ingredient",
        "match_type": "fuzzy",
        "matched_ingredient_id": "uuid",
        "confidence": 0.82,
        "suggestion": "parmesan cheese"
      },
      {
        "original_text": "pepe nero q.b.",
        "name": "black pepper",
        "quantity": 2,
        "unit": "g",
        "preparation": null,
        "component_hint": "direct_ingredient",
        "match_type": "exact",
        "matched_ingredient_id": "uuid",
        "confidence": 1.0
      }
    ],
    "match_status": "Partial",
    "preparation_graph": {
      "steps": [
        { "id": "s1", "action": "Boil salted water", "inputs": ["water", "salt"], "output": "boiling water", "duration_min": 10, "is_active": false },
        { "id": "s2", "action": "Cook spaghetti", "inputs": ["spaghetti", "boiling water"], "output": "cooked spaghetti", "duration_min": 9, "is_active": false },
        { "id": "s3", "action": "Cut guanciale into strips", "inputs": ["guanciale"], "output": "guanciale strips", "duration_min": 3, "is_active": true },
        { "id": "s4", "action": "Render guanciale until crispy", "inputs": ["guanciale strips"], "output": "crispy guanciale", "duration_min": 7, "is_active": true },
        { "id": "s5", "action": "Whisk egg yolks with pecorino and pepper", "inputs": ["egg yolk", "pecorino romano", "black pepper"], "output": "egg-cheese mixture", "duration_min": 2, "is_active": true },
        { "id": "s6", "action": "Toss spaghetti with guanciale, fold in egg mixture off heat", "inputs": ["cooked spaghetti", "crispy guanciale", "egg-cheese mixture"], "output": "pasta carbonara", "duration_min": 3, "is_active": true }
      ],
      "edges": [
        { "from": "s1", "to": "s2" },
        { "from": "s3", "to": "s4" },
        { "from": "s2", "to": "s6" },
        { "from": "s4", "to": "s6" },
        { "from": "s5", "to": "s6" }
      ]
    }
  }
  ```
- **Errors**: `422` extraction failed (page lacks recognizable recipe data); `206` LLM normalization failed (raw extraction returned for manual review)
### GET `/recipes/imports`

List pending and completed recipe imports.

- **Query Parameters**:
  | Param | Type | Default | Description |
  |---|---|---|---|
  | `status` | string | — | Filter: `Pending`, `Partial`, `Complete`, `Failed` |
  | `page` | int | 1 | |
  | `page_size` | int | 20 | |
- **Response**: `200 OK` — Paginated list of RecipeImport objects

### PUT `/recipes/imports/{id}/resolve`

Resolve unmatched or fuzzy-matched ingredients for a recipe import.

- **Request Body**:
  ```json
  {
    "resolutions": [
      { "ingredient_name": "guanciale", "resolved_ingredient_id": "uuid" },
      { "ingredient_name": "pecorino romano", "resolved_ingredient_id": "uuid" }
    ]
  }
  ```
- **Response**: `200 OK` — Updated match status

### POST `/recipes/imports/{id}/finalize`

Create the dish from a fully-resolved recipe import.

- **Request Body**:
  ```json
  { "name": "Pasta Carbonara", "dish_role": "Main", "meal_type": "Both" }
  ```
- **Response**: `201 Created` — Dish object
- **Errors**: `400` if unmatched ingredients remain; `409` if dish name conflicts

---

## 13. Retention Factors (Admin)

### GET `/admin/retention-factors`

List all retention factors.

- **Query Parameters**:
  | Param | Type | Default | Description |
  |---|---|---|---|
  | `cooking_method` | string | — | Filter by method |
  | `nutrient_key` | string | — | Filter by nutrient |
- **Response**: `200 OK` — List of RetentionFactor objects

### PUT `/admin/retention-factors/{id}`

Update a retention factor value.

- **Request Body**:
  ```json
  { "retention_factor": 0.75 }
  ```
- **Response**: `200 OK`
- **Side Effect**: All components using this cooking method are flagged for nutrient recalculation
