<!-- PLAN-REVIEW-REPORT -->
# Plan Review: User domain persistence contract Implementation Plan

- **Plan**: `context/changes/user-domain-persistence-contract/plan.md`
- **Mode**: Deep
- **Date**: 2026-05-30
- **Verdict**: SOUND
- **Findings**: 1 critical, 2 warnings

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| End-State Alignment | PASS |
| Lean Execution | WARNING |
| Architectural Fitness | PASS |
| Blind Spots | PASS |
| Plan Completeness | PASS |

## Grounding
5/5 existing referenced paths ✓, 4/4 symbols ✓, brief↔plan ✓

## Findings

### F1 — Routine schedule depends on an undefined shelf-item identity

- **Severity**: ❌ CRITICAL
- **Impact**: 🔬 HIGH — architectural stakes; think carefully before deciding
- **Dimension**: Plan Completeness
- **Location**: Critical Implementation Details + Phase 1 core migration (`plan.md:53`, `plan.md:69`)
- **Detail**: The plan said `user_routine_configs.schedule` stores references to owned shelf items, but it did not define a stable shelf-item identifier, JSON shape, or delete behavior. That left the shelf-to-routine contract underspecified.
- **Fix A ⭐ Recommended**: Add a stable `user_shelf_items.id` contract and define `schedule` in terms of `shelf_item_id` references, plus one rule for what happens when a shelf item is removed.
  - Strength: Preserves the plan's goal of a reusable foundation for later routine slices without a breaking migration.
  - Tradeoff: Slightly more schema and helper design in F-01.
  - Confidence: HIGH — this is the cleanest way to make the stated "owned shelf item reference" contract real.
  - Blind spot: The exact JSON example still needed to be written into the plan.
- **Decision**: FIXED via Fix A

### F2 — Shared `products` access rules are unspecified

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Blind Spots
- **Location**: Critical Implementation Details + Phase 1 core migration (`plan.md:51`, `plan.md:69`)
- **Detail**: `public.products` was positioned as a shared global anchor, but the plan did not say who may read it or whether ordinary app runtime may write to it in F-01.
- **Fix**: Add an explicit Phase 1 access contract for `products`: readable by authenticated users as needed for reference resolution, no app-level `insert/update/delete` in F-01, and any temporary local data through migration, seed, or trusted SQL flow.
- **Decision**: FIXED

### F3 — Dashboard work is split across two phases without a clean seam

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Lean Execution
- **Location**: Phase 2 dashboard integration + Phase 3 visibility polish (`plan.md:118-124`, `plan.md:158-164`)
- **Detail**: Phase 2 already makes `dashboard.astro` load profile data and render a minimal form or status, while Phase 3 reopens the same file for visibility polish and success/error messaging. That overlap keeps the phase boundary fuzzy and can invite scope creep.
- **Fix**: Move all dashboard code into Phase 2, or constrain Phase 3 to a very small message/query-param pass only.
- **Decision**: ACCEPTED
