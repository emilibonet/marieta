# Non-Functional Requirements

---

## 1. Performance

| Metric | Target | Context |
|---|---|---|
| MILP solver time | ≤ 5 seconds typical, ≤ 10 seconds hard limit | Weekly plan generation with ≤1,000 eligible dishes, 14 slots, 17 nutrient constraints |
| Ingredient search | < 500ms | Fuzzy search across ~15,000 ingredients in PostgreSQL |
| Page load (initial) | < 2 seconds | Angular app with lazy-loaded modules, gzipped assets |
| Page load (subsequent) | < 500ms | Cached static assets, API calls only for data |
| API response (CRUD) | < 200ms | Standard create/read/update/delete operations |
| API response (plan generation) | ≤ 10 seconds | Includes solver + post-processing (gap report, shopping list, batch plan) |
| PDF export | < 5 seconds | Weekly plan with all pages |
| ODS export | < 3 seconds | Multi-sheet export |
| ETL import (CIQUAL) | < 2 minutes | ~3,500 entries |
| ETL import (USDA FDC) | < 10 minutes | Full SR Legacy + Foundation Foods (~10,800 entries) |
| ETL import (NEVO) | < 3 minutes | ~2,100 entries |
| Database query (ingredient by ID) | < 10ms | Indexed UUID lookup |
| Redis cache hit | < 5ms | FDC API result cache |
| Recipe extraction (Stage 1) | < 5 seconds | Fetch URL + Schema.org/HTML parsing |
| LLM normalization (Stage 2) | < 30 seconds typical, < 60 seconds hard limit | Gemma 4 inference for a recipe with ≤ 25 ingredient lines; locally hosted via Ollama |
| Recipe import (full pipeline) | < 45 seconds typical | Stages 1+2+3 (extraction → LLM → ingredient matching); excludes user review time |

### Performance Monitoring

- Backend: Log slow queries (> 500ms) and slow solver runs (> 5s)
- Backend: Log LLM normalization latency and failure rate per import
- Frontend: No client-side performance monitoring required (local deployment)

---

## 2. Security

### Authentication & Session

| Requirement | Implementation |
|---|---|
| Password storage | bcrypt (cost factor ≥ 12) |
| Session management | HTTP-only, SameSite=Strict cookie |
| Session expiry | Configurable, default 7 days |
| CSRF protection | Token-based (double-submit cookie or synchronizer token) |
| Login rate limiting | Max 10 failed attempts per minute; lockout for 5 minutes after |
| Password requirements | Minimum 8 characters |
| Password reset | CLI-only command (no email/recovery — local deployment) |

### API Security

| Requirement | Implementation |
|---|---|
| Input validation | Pydantic models on all endpoints; reject unexpected fields |
| SQL injection | Prevented by SQLAlchemy parameterized queries (always) |
| XSS | Angular's built-in output encoding; no `innerHTML` with user data |
| Path traversal | File paths for ETL import validated against allowed directories |
| CORS | Restricted to frontend origin only (configured via env var) |
| Secrets management | All secrets (DB password, API keys, session secret) in environment variables or `.env` file; never in source code |

### Data Security

| Requirement | Implementation |
|---|---|
| Database access | PostgreSQL credentials via environment variable; no default passwords |
| Redis access | Password-protected if exposed on network; localhost-only by default |
| Backups | User's responsibility (Docker volume mounts); no built-in backup automation |
| External API keys | USDA FDC API key stored in env var; never logged or exposed in API responses |

---

## 3. Scalability

This is a single-user, locally-deployed application. Scalability concerns are about **data volume**, not concurrent users.

| Dimension | Expected Scale | Design Approach |
|---|---|---|
| Ingredient library | Up to ~25,000 entries (CIQUAL + USDA + NEVO combined) | PostgreSQL GIN indexes on name/aliases; pagination on all list endpoints |
| Component library | Up to ~500 entries | No special indexing needed |
| Dish library | Up to ~5,000 entries | Indexed by meal_type, active status; pagination |
| Weekly plans (history) | Up to ~200 plans (~4 years) | Indexed by week_start; prunable |
| Solver variable count | ~10,000 binary variables (14 Main slots × 500 Main dishes + 14 optional Side slots + 14 optional Dessert slots) | OR-Tools CP-SAT handles this in < 2s; scales to ~1,000 Main dishes within 10s budget |
| USDA + CIQUAL + NEVO data | ~400 MB raw → ~70 MB in PostgreSQL | One-time import; indexed |
| Redis cache | < 100 MB | 30-day TTL on FDC API cache entries |

### Growth Path

- If dish count exceeds 2,000: pre-filter eligible dishes before solver (by available components, meal type, restrictions) to keep solver variable count manageable
- If plan history exceeds 500: archive old plans to cold storage (export to ODS, delete from DB)

---

## 4. Reliability & Availability

| Requirement | Target |
|---|---|
| Uptime | Best-effort (local deployment; no SLA) |
| Data durability | PostgreSQL WAL + Docker volume mount to host filesystem |
| Crash recovery | PostgreSQL handles transaction recovery; no in-memory-only state |
| Backup strategy | User mounts PostgreSQL data directory to host; manual or cron-based `pg_dump` |
| Graceful degradation | If Redis is unavailable: app functions without caching (slower FDC lookups) |
| If USDA API is unavailable | App functions fully offline; live search returns empty results with notification |

---

## 5. Maintainability

| Requirement | Implementation |
|---|---|
| Code structure | Modular: backend as Python package with separate modules per domain (ingredients, components, dishes, planning, export) |
| Frontend structure | Angular standalone components; feature-based module organization |
| Database migrations | Alembic (auto-generated from SQLAlchemy models); version-controlled |
| Configuration | 12-factor app: all config via environment variables |
| Logging | Structured JSON logging (Python `structlog`); log levels: DEBUG, INFO, WARNING, ERROR |
| Testing | Backend: pytest with async support; unit tests for solver, integration tests for API; Frontend: Jasmine/Karma unit tests |
| Code style | Backend: Black + Ruff; Frontend: ESLint + Prettier; enforced via pre-commit hooks |
| Documentation | API docs auto-generated by FastAPI (Swagger UI at `/docs`) |

---

## 6. Accessibility

| Requirement | Standard |
|---|---|
| WCAG level | WCAG 2.1 AA (best-effort for local single-user app, not a hard target) |
| Keyboard navigation | All interactive elements reachable via keyboard (Angular Material provides this by default) |
| Color contrast | Nutrient status color coding (green/yellow/orange/red) must have sufficient contrast ratios; supplemented with text labels/icons |
| Screen reader | Semantic HTML; ARIA labels on interactive elements and data tables |
| Text sizing | Responsive to browser zoom up to 200% |

---

## 7. Compatibility

### Browser Support

| Browser | Minimum Version |
|---|---|
| Firefox | Latest ESR (currently 128+) |
| Chromium-based (Chrome, Brave, Edge) | Latest stable |
| Safari | Not required (local deployment likely Linux) |

### OS Support (Deployment Host)

| OS | Support Level |
|---|---|
| Linux (Debian/Ubuntu/Fedora) | Primary target |
| macOS | Supported (Docker Desktop) |
| Windows | Supported (Docker Desktop / WSL2) |

### Screen Resolution

| Minimum | Recommended |
|---|---|
| 1280 × 720 | 1920 × 1080 |

The weekly calendar grid requires at least ~1200px horizontal space. Below that, a horizontal scroll or responsive layout is acceptable.

---

## 8. Deployment & Operations

| Requirement | Implementation |
|---|---|
| Deployment method | Docker Compose (single `docker compose up`) |
| Containers | 5: `frontend` (nginx), `backend` (uvicorn), `postgres`, `redis`, `ollama` (Gemma 4 LLM) |
| First-run setup | `docker compose up` → auto-run DB migrations → user accesses web UI → set password → trigger ETL |
| Configuration | `.env` file with: DB credentials, Redis URL, session secret, USDA API key, CORS origin, Ollama URL |
| Persistent storage | Docker volumes for PostgreSQL data and Redis data |
| Log access | `docker compose logs -f backend` |
| Update process | `git pull && docker compose build && docker compose up -d` |
| Health check | `GET /health` endpoint on backend (checks DB + Redis connectivity) |

### Docker Compose Services

```yaml
services:
  frontend:
    build: ./frontend
    ports: ["8080:80"]
    depends_on: [backend]

  backend:
    build: ./backend
    ports: ["8000:8000"]
    depends_on: [postgres, redis]
    env_file: .env

  postgres:
    image: postgres:16-alpine
    volumes: [pgdata:/var/lib/postgresql/data]
    env_file: .env

  redis:
    image: redis:7-alpine
    volumes: [redisdata:/data]

  ollama:
    image: ollama/ollama:latest
    ports: ["11434:11434"]
    volumes: [ollama_models:/root/.ollama]
    deploy:
      resources:
        reservations:
          devices:
            - driver: nvidia
              count: 1
              capabilities: [gpu]
    # CPU-only fallback: remove `deploy.resources` block; expect ~2–4× slower inference

volumes:
  pgdata:
  redisdata:
  ollama_models:
```

---

## 9. Internationalization

| Requirement | Implementation |
|---|---|
| UI Language | English only (initial release) |
| Units | Metric only (g, mg, µg, L/mL, kcal) |
| Date format | ISO 8601 (YYYY-MM-DD) in API; localized display in UI |
| Character encoding | UTF-8 throughout |
| Ingredient names | UTF-8; support for accented characters (French Ciqual names, etc.) |

---

## 10. Data Quality & Integrity

| Requirement | Implementation |
|---|---|
| Referential integrity | PostgreSQL foreign keys with ON DELETE RESTRICT (soft deletes prevent orphans) |
| Data versioning | Ingredient `version` field incremented on every update; ETL re-imports do not overwrite user edits |
| Nutrient confidence tracking | Per-field confidence scores (0–1) on every ingredient |
| Missing data handling | Null nutrients excluded from calculations; flagged in gap reports |
| Audit trail | `created_at` and `updated_at` timestamps on all entities |
| Idempotent ETL | Re-running import produces same result; deduplication by source ID |
| Constraint validation | All business rules enforced at API layer (Pydantic validation) and DB layer (constraints + triggers where appropriate) |

---

## 11. LLM Infrastructure (Gemma 4)

### Model & Runtime

| Parameter | Value |
|---|---|
| Model | Google Gemma 4 (instruction-tuned) |
| Serving runtime | Ollama (`ollama/ollama:latest`) |
| API compatibility | OpenAI-compatible `/v1/chat/completions` endpoint exposed by Ollama |
| Deployment | Docker container alongside application services; model weights downloaded on first run (`ollama pull gemma4`) |
| Structured output | JSON mode with Pydantic schema enforcement on the backend; system prompt specifies output schema |

### Hardware Requirements

| Tier | GPU | VRAM | Expected Inference Time (≤25 ingredients) |
|---|---|---|---|
| Recommended | NVIDIA GPU (RTX 3060 or better) | ≥ 8 GB | < 15 seconds |
| Minimum (GPU) | NVIDIA GPU (GTX 1650+) | ≥ 4 GB | < 30 seconds |
| CPU-only fallback | None | N/A (uses system RAM, ≥ 16 GB recommended) | < 60 seconds |

### Prompt Design

- Single system prompt per import: includes the full raw ingredient list and instructions extracted in Stage 1.
- Output schema is embedded in the system prompt as a JSON example with field descriptions.
- Temperature: `0.0` (deterministic output for repeatable results).
- The prompt instructs the model to:
  1. Auto-detect the source language and translate all ingredient names to English
  2. Parse quantities, convert units to metric (g/mL/L/kg), and estimate amounts for vague expressions ("a pinch", "to taste")
  3. Extract preparation methods (diced, minced, grated, etc.)
  4. Infer the primary cooking method from the instructions
  5. Classify each ingredient as likely batch-cookable component vs. direct ingredient
  6. Suggest a dish role (Main/Side/Dessert)

### Resilience

| Scenario | Behavior |
|---|---|
| Ollama container unavailable | Import returns `503`; user informed that LLM normalization is temporarily unavailable and can retry later |
| LLM output fails Pydantic validation | Retry once with corrective prompt appending the validation error; if retry fails, fall back to raw extraction with `llm_normalization_status = 'Failed'` |
| LLM inference timeout (> 60s) | Abort; return raw extraction with warning |
| Model not yet pulled | First-run setup triggers `ollama pull gemma4`; backend health check reports `degraded` until model is available |

### Privacy & Security

| Requirement | Implementation |
|---|---|
| Data locality | All inference runs locally — no recipe data sent to external APIs |
| Prompt injection | Raw recipe text is placed in the `user` message only; system prompt is fixed and not influenced by extracted content. Output is validated against a strict schema, rejecting unexpected fields. |
| Resource isolation | Ollama container has memory/CPU limits defined in Docker Compose to prevent resource starvation of other services |
