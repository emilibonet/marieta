# Marieta — UI design implementation guide

## Design philosophy

Marieta is a calm, purposeful planning tool. The interface follows three principles:

- **one thing at a time** — each screen answers a single question. The plan screen answers: *what am I eating this week?* Nutrients, shopping, and batch cooking live on their own screens, visited intentionally.
- **progressive disclosure** — information exists at every level of detail, but none of it demands attention until the user asks for it. Complexity is accessible, never imposed.
- **effortless access** — revealed information should feel like it was just beneath the surface, not retrieved from somewhere else. A single tap, no navigation away, no loss of context.

---

## Color palette

All colors are hardcoded. This is a dark-only interface — do not adapt to light mode.

### Background

```css
background-color: #060D09;
background-image: radial-gradient(ellipse 90% 65% at 15% 90%, #102A1A 0%, #060D09 58%);
```

The gradient originates off-center at the bottom-left. The shift from `#102A1A` to `#060D09` is intentionally subtle — approximately 2–3% lighter at the origin. It provides depth without drawing attention to itself.

### Text

| Role | Value | Usage |
|---|---|---|
| Primary | `#FFFFFF` | Key numbers, meal names, active states |
| Secondary | `rgba(255,255,255,0.68)` | Active nav, open day content |
| Tertiary | `rgba(255,255,255,0.38–0.52)` | Meal names at rest, bar labels |
| Muted | `rgba(255,255,255,0.20–0.28)` | Day names, section labels, nav items |
| Faint | `rgba(255,255,255,0.14–0.18)` | Unplanned slots, placeholder text |

Use opacity rather than separate color values. This keeps the palette coherent as the background gradient shifts beneath.

### Semantic colors

These appear sparingly — only where they carry meaning.

| Role | Value | Usage |
|---|---|---|
| Sage / success | `rgba(93,202,165,0.65–0.85)` | Today indicator, targets met, active nav border |
| Amber / warning | `rgba(176,122,58,0.80–0.90)` | Nutrient gaps, unplanned days, warning text |
| Gold / dinner | `rgba(201,168,76,0.70–0.85)` | Dinner meal names, dinner pills |

Never use these colors decoratively. Each appearance carries a specific meaning.

### Surfaces

Cards and panels are defined by opacity lift only — no borders, no shadows.

| Role | Value |
|---|---|
| Default card | `background: rgba(255,255,255,0.03)` |
| Hovered / active card | `background: rgba(255,255,255,0.04–0.055)` |
| Meal pill | `background: rgba(255,255,255,0.04)` |
| Dinner pill | `background: rgba(201,168,76,0.07)` |

The distinction between a card and the background is intentionally very low. Contrast comes from text, not from surface color.

---

## Typography

### Logotype

```css
font-family: serif; /* system serif or a custom elegant serif */
font-size: 20px;
font-weight: 400;
color: #EEF4F0;
letter-spacing: 0.04em;
```

The logo is the only element that uses a serif. This contrast — serif among sans-serif — gives it quiet authority without ornamentation.

### UI text

Everything else uses the system sans-serif.

| Element | Size | Weight | Opacity |
|---|---|---|---|
| Meal names | 12px | 400 | 0.52 (resting), 0.82 (expanded) |
| Expanded dish title | 15px | 500 | 0.82 |
| Nav items | 9px | 400 | 0.18 (inactive), 0.68 (active) |
| Section labels | 8–9px | 400 | 0.25 |
| Day names | 8px | 400 | 0.20 |
| Metric values | 30px | 500 | 1.0 |
| Metric labels | 8px | 400 | 0.28 |
| Nutrient values | 13px | 500 | 0.60 |
| Status line | 10px | 400 | 0.20 |

Use letter-spacing of `0.10–0.16em` on the smallest labels (section headings, day names, nav). It adds refinement and improves legibility at small sizes.

---

## Layout and spacing

### Container

```css
border-radius: 16px;
overflow: hidden;
```

### Padding scale

| Zone | Value |
|---|---|
| Top bar | `32px 36px 0` |
| Nav | `22px 36px 0` |
| Content area | `32px 36px 40px` |
| Day row (collapsed) | `14px 18px` |
| Day row (expanded detail) | `0 18px 18px` |
| Card / panel | `20px 22px` |
| Metric card | `18px 20px` |

The outer horizontal padding (36px) is generous relative to the content width. This breathing room is intentional — whitespace is structural, not wasted.

### Gap rhythm

```css
.content { gap: 26px; }       /* between major sections */
.day-rows { gap: 6px; }       /* between day rows */
.detail-meals { gap: 14px; }  /* between lunch and dinner inside expanded row */
.nutrients { gap: 18px; }     /* between nutrient columns */
.bars { gap: 13px; }          /* between bar rows */
```

---

## Navigation

```css
.nav-item {
  font-size: 9px;
  letter-spacing: 0.10em;
  color: rgba(255,255,255,0.18);
  padding-bottom: 8px;
  border-bottom: 0.5px solid transparent;
}

.nav-item.active {
  color: rgba(255,255,255,0.68);
  border-bottom-color: rgba(93,202,165,0.40);
}
```

Nav items use lowercase. The active state is communicated by two simultaneous signals: slightly brighter text and a barely-visible sage underline. Neither alone would be enough.

---

## The plan view — week schedule

### Day row (collapsed)

Each day renders as a single horizontal line:

```
WED    Chickpea stew  ·  Stir fry
```

- Day name: 36px fixed width, muted opacity
- Meal names separated by a centered dot at very low opacity
- Lunch in tertiary white, dinner in muted gold
- Row has `cursor: pointer` and a subtle hover background lift

### Unplanned slots

```css
color: rgba(255,255,255,0.18); /* "— unplanned —" */
```

A small amber dot (`width: 4px; height: 4px; border-radius: 50%; background: rgba(176,122,58,0.5)`) appears at the far right of the row. This is the only ambient signal for gaps — visible if you're scanning, invisible if you're not.

### Today

```css
.day-row.today .day-name {
  color: rgba(93,202,165,0.85);
}
.day-row.today .day-header {
  background: rgba(255,255,255,0.04);
}
```

Today is pre-expanded on load. No other decorative treatment — the green day name and the open state are sufficient.

---

## Expand in place — interaction pattern

Only one day can be open at a time. Opening a new day closes the current one.

```javascript
function toggle(row) {
  const isOpen = row.classList.contains('open');
  document.querySelectorAll('.day-row.open')
    .forEach(r => r.classList.remove('open'));
  if (!isOpen) row.classList.add('open');
}
```

When open, the row reveals:

1. **Lunch section** — meal type label (faint, uppercase, tracked), dish name (large, white), component pills
2. **Divider** — `height: 0.5px; background: rgba(255,255,255,0.05)` — barely present
3. **Dinner section** — same structure, dish name in gold
4. **Nutrient row** — 4 values inline: protein, omega-3, iron, fibre. Warning values use amber.

### Component pills

```css
.component-pill {
  font-size: 9px;
  color: rgba(255,255,255,0.32);
  background: rgba(255,255,255,0.04);
  border-radius: 20px;
  padding: 3px 10px;
}
```

Pills name the ingredients or components that compose the meal. They're secondary — informative if read, ignorable if not.

---

## Nutrient bars panel

Used on the nutrients screen. Contained in a borderless card surface.

```css
.bar-track {
  height: 3px;
  background: rgba(255,255,255,0.06);
  border-radius: 2px;
}

.bar-fill.ok   { background: rgba(93,202,165,0.65); }
.bar-fill.warn { background: rgba(176,122,58,0.80); }
.bar-fill      { background: rgba(255,255,255,0.16); } /* neutral / no target */
```

Bar labels are 9px at 0.38 opacity. Percentage values align right at 30px fixed width. A percentage marked `.ok` inherits the sage color; `.warn` inherits amber.

---

## Status line

A single line of ambient status text at the bottom of the plan view:

```
iron below target this week  ·  friday lunch unplanned
```

```css
.status-line {
  font-size: 10px;
  color: rgba(255,255,255,0.20);
  letter-spacing: 0.04em;
  line-height: 1.6;
  padding: 22px 36px 28px;
}
```

Warning items within the line use `rgba(176,122,58,0.70)`. The line is deliberately faint — it rewards attention without demanding it. If the week is clean, it can be empty or hidden entirely.

---

## What lives where

| Screen | Purpose | Primary content |
|---|---|---|
| Plan | What am I eating this week? | Day rows, expand-in-place detail |
| Library | What dishes and components exist? | Searchable list of dishes, components, ingredients |
| Nutrients | How does the week score? | Coverage bars, gap analysis, suggestions |
| Shopping | What do I need to buy? | Consolidated ingredient list by category |

Each screen answers exactly one question. Cross-screen navigation is via the top nav. No information is duplicated across screens — the status line on the plan view is the only exception, surfacing the single most important nutrient signal.

---

## Guiding constraints

- No hard borders anywhere. Separation happens through spacing and opacity.
- No color used decoratively. Every non-white color carries a semantic meaning.
- No information displayed without a reason to display it at that moment.
- High-contrast text (`#FFFFFF`, `#EEF4F0`) is reserved for numbers and primary dish names only. Everything else recedes.
- The gradient is the only decorative element in the entire interface.