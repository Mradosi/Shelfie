---
project: "Shelfie"
version: 1
status: draft
created: 2026-05-22
context_type: greenfield
product_type: web-app
target_scale:
  users: small
  qps: low
  data_volume: small
timeline_budget:
  mvp_weeks: 6
  hard_deadline: null
  after_hours_only: true
---

## Vision & Problem Statement

People who are interested in skincare and own multiple cosmetic products often feel overwhelmed by trying to manage routines, active ingredients, product combinations, and temporary skin situations like irritation or cosmetic procedures.

Today they rely on scattered notes, memory, social media advice, and trial-and-error, which leads to confusing routines, wasted products, skin irritation, and decision fatigue. The product insight is that guidance becomes more useful when it operates on the user's actual products and supports temporary routine overlays instead of static plans.

## User & Persona

Primary persona: a skincare-engaged individual managing their own products and routines.

They reach for the product when they need to decide what to use, combine, pause, or adjust because of irritation, cosmetic procedures, or everyday routine changes.

## Success Criteria

### Primary

* A signed-in user can provide basic skin context, add owned skincare products, and receive either a simple personalized routine using those products or guidance on each product's role plus missing routine categories.
* The user experiences the first value moment as the app understanding their actual products and helping organize or improve their routine instead of giving generic advice.

### Secondary

* The user sees basic warnings or suggestions about conflicts, overuse, or missing routine elements.
* Optional enhancement: the app can generate a temporary short-term routine for situations such as irritation or cosmetic procedures without making it part of the core MVP proof.

### Guardrails

* AI-assisted product adding must not save or modify product data without user confirmation.
* The MVP must preserve a clear fallback path for manual product entry when image-based adding is incomplete or unavailable.

## User Stories

### US-01: User adds owned products and gets personalized skincare guidance

* **Given** a signed-in user who has provided their basic skin context such as skin type, sensitivity, skin concerns, and skincare goals
* **When** they add cosmetic products to their shelf using product search, barcode lookup, manual entry, or image-based AI adding from uploaded or camera photos, confirm the recognized product information, and request skincare guidance
* **Then** the app generates a structured personalized skincare routine based on the user's owned products and skin context, explains the role of the products in the routine, and warns about potentially problematic ingredient combinations, overuse, or missing routine elements.

# TODO: acceptance criteria for US-01 — see Open Questions

## Functional Requirements

* FR-001: User can create an authenticated personal account and log in. Priority: must-have

  > Socrates: Counter-argument considered: none. Resolution: kept as written because authenticated personal accounts are part of the MVP boundary.

* FR-002: User can provide basic skin context including skin type, sensitivity, skin concerns, and skincare goals. Priority: must-have

  > Socrates: Counter-argument considered: none. Resolution: kept as written because skin context is required for personalized skincare guidance.

* FR-003: User can add cosmetic products to their shelf. Priority: must-have

  > Socrates: Counter-argument considered: none. Resolution: kept as written because owned-product inventory is core to the product's guidance model.

* FR-004: User can add products by product search, barcode lookup, manual entry, or AI-assisted image/photo extraction, with fallback correction flows when product data is incomplete. Priority: must-have

  > Socrates: Counter-argument considered: supporting multiple product-input methods broadens scope. Resolution: kept because product discovery and reduced manual entry are now part of the core UX value.

* FR-005: User can confirm or correct AI-recognized product information before saving. Priority: must-have

  > Socrates: Counter-argument considered: none. Resolution: kept as written because AI-assisted adding must remain user-confirmed before save.

* FR-006: User can view and manage their cosmetic shelf or inventory. Priority: must-have

  > Socrates: Counter-argument considered: none. Resolution: kept as written because persistent inventory management is part of the core product value.

* FR-007: User can store lightweight personal product information such as notes and reactions, with opened-date tracking simplified or deferred in the MVP. Priority: must-have

  > Socrates: Counter-argument considered: full personal product history adds too much detail to the first release. Resolution: kept lightweight notes and reactions in MVP because they improve guidance; opened-date tracking may be simplified or deferred.

* FR-008: User can generate a skincare routine based on owned products and skin context. Priority: must-have

  > Socrates: Counter-argument considered: none. Resolution: kept as written because routine generation is central to the MVP's first value moment.

* FR-009: User can view dynamically generated morning/evening and weekly skincare routines based on configured product schedules. Priority: must-have

  > Socrates: Counter-argument considered: none. Resolution: clarified the requirement because the product vision assumes product-based scheduling with generated daily and weekly routine views.

* FR-010: User can receive AI explanations about product roles, missing routine elements, or possible conflicts. Priority: must-have

  > Socrates: Counter-argument considered: none. Resolution: kept as written because explanation is part of how the product avoids feeling like generic advice.

* FR-011: User can receive lightweight warnings about potentially problematic ingredient combinations or overuse, especially when manually changing routines or combining owned products, using a hybrid approach combining deterministic ingredient-group rules with AI-generated explanations. Priority: must-have

  > Socrates: Counter-argument considered: a strict conflict-validation engine may be too heavy for the MVP. Resolution: kept the warning system in MVP, but narrowed it to soft guidance rather than blockers; baseline AI-generated routines should avoid obvious conflicts, and conflict detection uses deterministic ingredient-group triggers with AI focused on contextual explanation.

* FR-012: User can provide lightweight skin feedback or check-ins such as irritation, dryness, breakouts, or discomfort, using quick selectable inputs with optional extra context. Priority: must-have

  > Socrates: Counter-argument considered: ongoing feedback could turn into a heavy tracking system too early. Resolution: kept lightweight check-ins in MVP because adaptive guidance needs them, but limited the shape to simple selectable feedback with optional text rather than analytics-heavy tracking.

* FR-013: User can generate a temporary short-term routine for situations like cosmetic procedures or skin irritation. Priority: nice-to-have

  > Socrates: Counter-argument considered: temporary routines risk adding too much state and timing complexity. Resolution: demoted from MVP-required to optional; if included, the scope stays limited to a short-term routine with a defined active period and return to the base routine instead of complex overlay logic.

* FR-014: User can review the temporary routine before applying it for a defined period. Priority: nice-to-have

  > Socrates: Counter-argument considered: temporary guidance could be informational only without an apply step. Resolution: kept as an optional companion to FR-013 rather than a core MVP requirement.

* FR-015: User can use the app comfortably on mobile devices or as a PWA. Priority: must-have

  > Socrates: Counter-argument considered: none. Resolution: kept as written because mobile-first daily use is part of the MVP boundary.

* FR-016: User can search for skincare products from shared product sources before adding them to their personal shelf. Priority: must-have

  > Socrates: Counter-argument considered: product search may require external integrations and shared storage complexity. Resolution: kept because reducing manual product entry is central to the user experience and product architecture.

* FR-017: The system can reuse previously confirmed products from a shared product database to reduce repetitive product entry. Priority: must-have

  > Socrates: Counter-argument considered: shared product storage adds normalization and consistency concerns. Resolution: kept because canonical shared products significantly reduce repeated AI extraction and improve scalability of the product experience.

## Non-Functional Requirements

* Users receive visible loading or progress feedback during longer AI-driven operations so guidance feels responsive rather than stalled.
* Personal skincare data, uploaded photos, and routines remain private to the authenticated account owner.
* Users can review and edit AI-generated product information and routines before saving changes.
* The app remains usable on modern mobile and desktop browsers, with a mobile-first experience that also works as a PWA.
* The interface remains understandable for users without skincare expertise, using lightweight educational guidance rather than overly technical or medical language.
* AI-generated guidance and warnings are presented as supportive recommendations, not medical advice or guaranteed outcomes.
* The MVP gracefully handles incomplete or uncertain AI recognition by allowing manual correction and fallback flows.
* User product shelves, routines, and feedback persist reliably between sessions.
* Basic accessibility standards are respected for forms, navigation, readable contrast, and mobile interaction.

## Business Logic

Shelfie analyzes the user's skin context, owned products, routine structure, and feedback to generate and adapt personalized skincare guidance while helping avoid potentially problematic product combinations or overuse.

The system combines structured product metadata and deterministic ingredient-group classification with AI-generated personalized interpretation.

The system generates routines from products available on the user's shelf while allowing users to manage owned products independently from routine configuration.

The rule consumes user-facing inputs including skin type, sensitivity, skincare goals, owned products, ingredient groups, routine structure, and optional feedback such as irritation or dryness.

The user receives a personalized weekly skincare routine, product-role explanations, lightweight conflict warnings, and suggested routine adjustments.

The user encounters these outputs during onboarding, routine generation, routine editing, product review screens, and ongoing routine feedback flows.

## Access Control

Authenticated accounts with email login.

Flat user model: each signed-in user only sees and manages their own data.

## Non-Goals

* No dermatological diagnosis or medical claims, because the MVP stays in skincare assistance rather than medical advice.
* No social or community features, because the MVP focuses on personal skincare management for one user.
* No marketplace, shopping, or purchase integrations, because buying workflows are outside the first product value.
* No custom-built computer vision or enterprise-grade OCR infrastructure, because the MVP relies on lightweight AI-assisted extraction and external product sources.
* No facial analysis or progress-photo analysis, because the MVP does not evaluate skin visually.
* No heavy tracking or analytics system, because feedback should stay lightweight and directly tied to routine adaptation.
* No complex overlay or merge routine engine, because temporary situations are handled as separate short-term routines instead.

## Open Questions

1. **How should conflict detection be split between deterministic rules and AI explanations?** - TBD during later design. Block: no.
2. **What are the acceptance criteria for US-01?** — TBD by user. Block: no.

## Post-MVP Considerations

The following feature directions are out of scope for the MVP but worth revisiting once the core product is stable.

### Near-term extensions

* **Expiry tracking.** Track opened date alongside estimated period-after-opening (PAO) and surface a reminder when a product is likely expired.
* **Quick-check mode.** Let the user ask a one-off question ("I just had a chemical peel — what should I skip tonight?") without triggering a full routine regeneration.
* **Shelf audit.** AI reviews the full shelf and surfaces redundancies, known conflicts, and missing routine categories as a one-time or on-demand summary.

### Higher-value additions

* **Temporary routine overlay.** Generate a short-term routine with a defined active period and automatic return to the base routine. Useful for aesthetic procedures, retinol onboarding, active breakouts, or travel. Partially scoped in the MVP PRD as a nice-to-have (FR-013, FR-014).
* **Ingredient watchlist.** User marks ingredients to avoid (e.g. after an allergic reaction); app flags matching products at add time and in the routine view.
* **Gradual introduction mode.** For potent actives (retinol, AHAs, vitamin C), AI generates a ramp-up schedule with frequency guidance and things to watch for.
* **Starter routine generation.** If the user has no owned products yet, Shelfie may suggest a beginner-friendly skincare routine and recommend products matching the user's skin profile.

### Monetization-relevant directions

* **Procedure recovery protocol.** User selects a recent aesthetic procedure (laser, filler, chemical peel, botox) and receives a day-by-day post-care routine tailored to their existing shelf. High perceived value, underserved by existing apps.
* **Pre-purchase fit check.** User inputs a product they are considering buying; app assesses whether it fits their routine, conflicts with existing products, or duplicates something already on the shelf.
* **Routine export.** Generate a clean shareable summary (PDF or image) of the current routine, useful for consultations with a dermatologist or aesthetician.

### Long-term platform direction

* **Personal skin reaction log.** Over time, Shelfie accumulates a record of how the user's skin responds to specific products and ingredients — not just what they own, but what works for them. This creates meaningful lock-in and a data layer that generic skincare advice cannot replicate.
