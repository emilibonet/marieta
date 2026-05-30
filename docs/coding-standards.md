# Marieta — Coding Standards

---

## Backend

- **Python**: latest stable (3.12+; re-evaluate library compatibility in Phase 0)
- **Framework**: FastAPI with dependency injection
- **ORM**: async SQLAlchemy 2.0; no raw SQL without approval
- **Repository layer**: all DB access through repositories, never in route handlers
- **Validation**: Pydantic v2 (`model_validate`, `model_dump`)
- **Logging**: structlog (`logger.info("event", key=val)`)
- **Type hints**: full type hints on all function signatures

---

## Frontend

- **Framework**: Angular (latest stable), standalone components
- **Component state**: `OnPush` change detection; signals for local state, RxJS for async
- **Global state**: NgRx Signal Store (in-memory only; re-fetch from API on reload)
- **UI library**: Angular Material
- **Styling**: no inline styles; follow `docs/08-style.md` exactly — opacity-based contrast, dark-only theme, hardcoded CSS variables
- **Accessibility**: ARIA labels and roles; keyboard navigation on all interactive elements; semantic HTML landmarks

---

## Functional Invariants

- Nutrient vector = 17-field Pydantic model serialized as JSONB
- Nutrient values normalized to per-100g before storage
- Nutrient retention factors applied at derivation time (component creation/update), never stored as a per-row attribute
- Soft delete: `deleted_at` timestamp column; dependency check before allowing deletion
- Units: metric only (g, mg, µg, ml, L)
- Language: English UI; multilingual ingredient import supported

---

## Testing Standards

- **Backend**: pytest + pytest-asyncio
  - Unit tests for all business logic (nutrient arithmetic, retention factor lookup, solver constraints, ETL normalization, DAG validation)
  - Integration tests for all API endpoints, auth flow, plan generate/save/swap cycle
  - Target: ≥80% coverage on backend business logic
- **Frontend**: Jasmine/Karma or Jest
  - Component tests for rendering, form validation, calendar grid, nutrient bars
  - Service tests for API client methods and Signal Store transitions
  - Target: ≥60% coverage on critical paths
- **Every AC must have an automated test** before the phase is marked complete
- **Every implementation must include tests**: no code lands without corresponding test coverage

---

## Error Handling (always implement, even if spec is silent)

| State | Backend | Frontend |
|---|---|---|
| Loading | — | Spinner/skeleton |
| Empty | `[]` / `null`, not 404 | "No [x] yet — [action]" |
| Not found | 404 + structured error | Redirect to list + toast |
| Validation error | 422 + field-level errors | Inline errors + toast |
| Blocked delete | 422 listing dependents | Modal listing dependents |
| Network error | — | Toast + retry |
| Server error | 500 + trace ID logged | "Something went wrong — try again" |
| Session expired | 401 | Redirect to login |

When a spec is silent on error handling, backend validation, or UI state, implement a sensible default based on this table and state the choice in the verification output.

---

## Commit & Verification

- Commit after each logical sub-task within the Implementation stage
- Run the relevant test suite (`pytest` for backend, `ng test` for frontend) after each commit
- Run linters before committing where available
- Fix regressions immediately; do not defer to a later stage
