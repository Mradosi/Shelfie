---
starter_id: 10x-astro-starter
package_manager: npm
project_name: shelfie
hints:
  language_family: js
  team_size: solo
  deployment_target: cloudflare-pages
  ci_provider: github-actions
  ci_default_flow: auto-deploy-on-merge
  bootstrapper_confidence: first-class
  path_taken: standard
  quality_override: false
  self_check_answers: null
  has_auth: true
  has_payments: false
  has_realtime: false
  has_ai: true
  has_background_jobs: false
---

## Why this stack

Shelfie is a small, after-hours web-app MVP with a 6-week timeline, authenticated accounts, AI-assisted product extraction and guidance, and uploaded-photo handling. The recommended default for a JavaScript web app fits that shape well because it gives you a strongly opinionated full-stack baseline with TypeScript contracts, built-in auth, database and storage primitives through Supabase, and a deployment path that matches the starter out of the box. That keeps setup overhead low for a solo build while leaving enough flexibility for AI-driven product flows and mobile-first delivery.
