# Contract Draft: Personalized Product Fit Analysis

> Working artifact before `/10x-plan`.
> Purpose: define the domain contract for per-user product interpretation
> before implementation planning starts.

## Goal

This slice should not start from "how to prompt the model".

It should start from one shared contract:

- product details screen reads it,
- future `ai-routine-draft-and-review` consumes it,
- later warning/guidance slices extend it,
- product intake does **not** get blocked by AI latency.

## Core Decision

The main artifact is **not** "an AI answer".

The main artifact is a persisted **per `(user, product)` interpretation record**
that sits between:

- shared product metadata in `products`,
- ownership in `user_shelf_items`,
- and future routine-level AI or warning flows.

## Domain Boundary

### Keep on shared product (`products`)

These fields describe the product itself and should remain global:

- identity: `name`, `brand`, `category`, `barcode`
- composition: `inci_list`
- provenance: `inci_source`, `inci_confidence`, `inci_updated_at`
- deterministic metadata added later or alongside this slice:
  - `ingredient_groups`
  - `concern_tags`
  - `routine_roles`

These must **not** become per-user:

- `good_for_sensitive_skin`
- `good_for_oily_skin`
- `recommended_for_acne`
- any static product verdict tied to one skin profile

### Keep on per-user interpretation

These fields describe whether this product fits **this user**:

- overall recommendation status
- short justification
- benefits for this user
- cautions for this user
- warnings severity
- generation state and freshness

## Recommendation: Naming

Avoid naming this table `user_products`, because the codebase already has
`user_shelf_items` as the ownership concept and the names will blur together.

Preferred direction:

- table: `user_product_interpretations`
- domain type: `UserProductInterpretation`

Semantic key:

- unique `(user_id, product_id)`

Why not `user_shelf_item_id` as the main key:

- the interpretation is semantically about the `(user, product)` pair,
- it should survive remove-and-readd of the same product,
- the PRD already frames this cache as per user-product pair.

## Recommendation: Replace Vague `compatibility`

The older notes use `compatibility`, but that label is too vague for product and
UI work.

Recommended replacement:

- `fit_status` as the main verdict
- `fit_score` only as a secondary helper

Suggested enum:

- `recommended`
- `mixed`
- `not_recommended`
- `insufficient_data`

Why:

- UI can explain these states clearly
- later routine AI can reason over categories more reliably than over one fuzzy word
- a numeric score alone is too lossy

## Proposed Persisted Contract

Suggested table shape:

```txt
user_product_interpretations
  id uuid pk
  user_id uuid not null
  product_id uuid not null
  status text not null
  fit_status text null
  fit_score smallint null
  confidence text null
  summary_short text null
  reasoning_short text null
  recommended_for jsonb not null default '[]'
  caution_for jsonb not null default '[]'
  warnings jsonb not null default '[]'
  profile_basis jsonb not null default '{}'
  product_basis jsonb not null default '{}'
  model_version text null
  prompt_version text null
  generated_at timestamptz null
  stale_at timestamptz null
  stale_reason text null
  last_error text null
  created_at timestamptz not null
  updated_at timestamptz not null
```

Unique constraint:

```txt
unique (user_id, product_id)
```

### Status

Separate generation state from skincare verdict.

Suggested `status`:

- `pending`
- `ready`
- `failed`
- `stale`

Why this matters:

- `fit_status` answers "is this good for the user?"
- `status` answers "do we have a usable analysis right now?"

## Structured Fields

### `fit_status`

Main user-facing verdict.

```txt
recommended | mixed | not_recommended | insufficient_data
```

### `fit_score`

Optional secondary number for sorting and ranking.

Suggested range:

```txt
0-100
```

Important:

- never use this as the only explanation in UI
- later AI routine should consume it as a hint, not as the sole truth

### `confidence`

How confident the system is in the interpretation itself.

Suggested enum:

```txt
high | medium | low
```

This is separate from `inci_confidence`.

- `inci_confidence` = confidence in ingredient source
- `confidence` = confidence in personalized interpretation

### `summary_short`

One short paragraph for card/details UI.

Constraint:

- short
- user-facing
- no medical language
- no chain-of-thought

### `reasoning_short`

Slightly more specific explanation for why the verdict exists.

Constraint:

- still short
- can mention ingredients or product type
- should stay explainable to a normal user

## Arrays Worth Persisting

These should be structured arrays, not only prose.

### `recommended_for`

Use for "what this product may help with for this user".

Suggested item shape:

```json
[
  {
    "code": "hydration",
    "label": "Nawilżenie",
    "reason": "Wspiera utrzymanie komfortu i bariery."
  }
]
```

Suggested code family for MVP:

- `hydration`
- `barrier_support`
- `breakouts`
- `pigmentation`
- `texture`
- `firmness`
- `soothing`
- `protection`

### `caution_for`

Use for "what this product may worsen or where caution is needed".

Suggested item shape:

```json
[
  {
    "code": "sensitivity",
    "label": "Wrażliwość",
    "reason": "Może być zbyt intensywny przy wysokiej reaktywności skóry."
  }
]
```

Suggested code family for MVP:

- `sensitivity`
- `dryness`
- `barrier_damage`
- `breakout_risk`
- `pigmentation_irritation`
- `sun_sensitivity`

### `warnings`

Warnings should be stricter and more operational than `caution_for`.

Suggested item shape:

```json
[
  {
    "code": "irritation_risk",
    "severity": "medium",
    "message": "Przy wysokiej wrażliwości zacznij ostrożnie i obserwuj reakcję."
  }
]
```

Suggested severity enum:

- `low`
- `medium`
- `high`

Important distinction:

- `caution_for` = concern-oriented caveat
- `warnings` = actionable risk signal

## Basis Fields for Invalidation

Do not guess freshness from `updated_at` alone.

Persist what the interpretation was based on.

### `profile_basis`

Recommended MVP shape:

```json
{
  "skin_type": "dry",
  "skin_aspects": {
    "sensitivity": "high",
    "pigmentation": "medium",
    "firmness": "low",
    "breakouts": "none",
    "texture": "medium"
  },
  "concerns": ["hydration", "pigmentation"],
  "goals": ["barrier", "glow"]
}
```

Recommendation:

- use structured profile fields
- do **not** use free-form `notes` in MVP input unless we are ready to accept frequent invalidation and noisier prompts

### `product_basis`

Recommended MVP shape:

```json
{
  "category": "serum",
  "inci_updated_at": "2026-07-12T10:00:00Z",
  "inci_confidence": "high"
}
```

Later this can grow into a stronger product fingerprint if needed.

## Proposed AI Output Contract

The model should return strict JSON, not free prose.

Suggested response shape:

```json
{
  "fit_status": "mixed",
  "fit_score": 62,
  "confidence": "medium",
  "summary_short": "Moze wspierac nawilzenie i komfort, ale wymaga ostroznosci przy wysokiej wrazliwosci.",
  "reasoning_short": "Formulacja wspiera bariere, ale czesc uzytkownikow wrazliwych moze reagowac na komponenty zapachowe lub aktywne.",
  "recommended_for": [
    {
      "code": "hydration",
      "label": "Nawilzenie",
      "reason": "Moze pomagac ograniczac uczucie sciagania."
    }
  ],
  "caution_for": [
    {
      "code": "sensitivity",
      "label": "Wrazliwosc",
      "reason": "Przy wysokiej reaktywnosci skory warto obserwowac tolerancje."
    }
  ],
  "warnings": [
    {
      "code": "irritation_risk",
      "severity": "medium",
      "message": "Jesli skora latwo sie czerwieni, zaczynaj ostroznie."
    }
  ]
}
```

Important:

- no AM/PM decision here
- no frequency recommendation here
- no routine order here
- no diagnosis
- no long internal reasoning

Those belong to later routine-level slices.

## Lifecycle Contract

### Creation

The product save flow should **not** wait for this analysis to finish.

Recommended rule:

1. product is added to shelf immediately
2. interpretation row is created or upserted as `pending`
3. generation starts after save or on first product-details access

This keeps intake responsive and still allows precomputation.

### Reading

Product details screen should support all four states:

- `pending` -> show "analysis in progress"
- `ready` -> show interpretation
- `failed` -> show retry affordance
- `stale` -> show last analysis with "requires refresh" banner or trigger refresh

### Invalidation

Interpretation should become `stale` when:

- user changes structured profile fields used by the prompt
- product INCI changes
- product category meaningfully changes
- interpretation schema / prompt version changes in a breaking way

Interpretation should **not** become stale just because:

- the user opened the page again
- routine changed
- unrelated UI state changed

### Regeneration

Recommended MVP:

- automatic refresh when stale and the user opens product details
- manual retry button if failed
- no periodic background reprocessing

## Use by Future `ai-routine-draft-and-review`

This contract should become the main product-level input into future routine AI.

Recommended rule:

- routine AI consumes shared product metadata **plus**
  `ready`, non-stale per-user interpretations

It should primarily use:

- `fit_status`
- `recommended_for`
- `caution_for`
- `warnings`

It may use `fit_score` only as a secondary sorting hint.

### Important boundary

Future routine AI should **not** re-analyze every product from raw INCI if a
valid interpretation already exists.

Otherwise this slice loses its value.

If some interpretations are missing:

- routine AI can wait for them,
- or proceed with a degraded mode explicitly marked as lower confidence,
- but that should be a conscious product decision, not an accidental fallback.

## What This Slice Should Not Try To Solve

- no medical advice
- no dermatologist-style diagnosis
- no AM/PM scheduling logic
- no frequency or interval logic
- no product-vs-product conflict engine yet
- no routine-level warnings yet
- no full recommendation engine
- no giant raw AI essays stored as canonical data

## MVP Recommendation Summary

If we want the smallest useful contract, the minimum good version is:

- one table: `user_product_interpretations`
- one unique row per `(user_id, product_id)`
- one generation state: `pending | ready | failed | stale`
- one verdict: `fit_status`
- one optional number: `fit_score`
- three structured arrays: `recommended_for`, `caution_for`, `warnings`
- two short texts: `summary_short`, `reasoning_short`
- two basis snapshots: `profile_basis`, `product_basis`
- one freshness trail: `generated_at`, `stale_reason`

That is enough to support:

- product details UI
- explicit refresh rules
- future routine AI inputs
- later warning slices

without turning this into an oversized interpretation platform.
