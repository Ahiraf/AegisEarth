# AegisEarth: feature-by-feature implementation plan

Stack: FastAPI REST API, PostgreSQL, React/TypeScript, Docker, Hugging Face Docker Space.
Repository: https://github.com/Ahiraf/AegisEarth
Planning date: 2026-10-16. Checkboxes distinguish setup from future product work.

## 0. Foundation

- [x] Create a modular monolith with feature-owned backend packages.
- [x] Add PostgreSQL sessions, Alembic baseline, initial catalog APIs and health routes.
- [x] Add React starter, individual Dockerfiles, Compose and combined Hugging Face image definition.
- [x] Verify frontend production build, five backend tests, lint, dependency consistency,
      Compose configuration and offline migration SQL (see `docs/verification.md`).
- [ ] Run the complete local Compose stack and verify migration, API readiness and frontend connection.
- [ ] Lock Python dependencies and review dependency security before deployment.
- [ ] Inspect a fresh clone of the target GitHub repository, then reconcile/transfer this scaffold
      without overwriting existing work or history. This folder initially was not a Git checkout.
- [ ] Agree on official challenge requirements, deadline, team ownership and scientific review owner.

Acceptance: one command starts a migrated system, the frontend connects and the catalog returns
an honest empty state until ingestion runs. CI passes before merge.

## Feature architecture and definition of done

Use `backend/app/modules/<feature>/` with `router.py`, `schemas.py`, `models.py`,
`service.py`, `repository.py` as needed. Keep provider adapters/helpers in the owning feature.
Put tests under `backend/tests/<feature>/` and React work under `frontend/src/features/<feature>/`.
`main.py` assembles the app; `core/` owns config, database, logging and common error infrastructure.
Register all model modules in Alembic metadata. Avoid a global models/routers/services layout.
Cross-feature operations use explicit service interfaces and must not introduce circular dependencies.

Complete one vertical slice at a time: agree contract -> migration/model -> repository -> service
-> router -> feature tests -> React integration -> docs -> acceptance review.
Add layers when they have a purpose, not empty forwarding files.
Public MVP reads need no account; refresh and administrative operations remain private CLI jobs.

## 1. Source feasibility and scientific contracts

- [ ] Verify the official Space Apps challenge and submission criteria.
- [ ] Verify current JPL SBDB, CAD, Sentry, NeoWs and ESA interfaces, allowed use and rate limits.
- [ ] Save dated fixtures with source URLs, signature/version, retrieval time and original units.
- [ ] Define identity mapping across SPK IDs/designations/ESA identifiers; never join on display name alone.
- [ ] Define source precedence, unknown values, stale thresholds and provenance for every scientific field.
- [ ] Separate source TDB/Julian epochs from UTC display times; document tested conversions.
- [ ] Have a qualified reviewer assess geographic impact-corridor feasibility before committing to that MVP feature.

Corrections to the supplied PDF's assumptions:

- SBDB close-approach uncertainty ellipses are not geographic Earth impact ellipses. A corridor requires
  validated impact solutions, propagation, reference frames, Earth rotation and uncertainty handling.
  Do not plot invented impact coordinates or convert ellipse axes directly to latitude/longitude.
- A close approach, potentially hazardous classification and predicted impact are distinct concepts.
  Missing risk data is unknown, not probability zero.
- Preserve virtual impactor events separately from object-level aggregate probabilities/hazard scores.
  An object aggregate is not necessarily the risk of its next close approach.
- Validate all example parameters (including the PDF's Sentry example) against official documentation.
- Keep unavailable mass/location/hazard fields null; label any estimates and their assumptions.
- Refresh cadence is a product policy; do not hard-code claimed provider update times from the PDF.

Acceptance: reviewed source-to-field dictionary specifies units, time scale, nullability,
provenance and whether each value is observed, derived or illustrative.

## 2. Catalog feature (`modules/catalog`)

- [ ] Extend identity model with SPK ID, alternate designations, H magnitude and orbit class.
- [ ] Add physical/orbital snapshots with source, epoch, units, uncertainty and revision metadata.
- [ ] Validate size ranges and finite numbers; distinguish estimated versus measured diameter.
- [ ] Implement normalized upsert and precedence in service.py; repository.py owns persistence.
- [ ] Expand `GET /api/v1/neos` with bounded search, type/size filters, stable pagination and sorting.
- [ ] Expand `GET /api/v1/neos/{id}` with source links, freshness and missing-field semantics.
- [ ] Add PostgreSQL tests for empty/populated lists, filters, pagination, detail, 404 and constraints.
- [ ] Build React catalog list, filters and object panel with loading/empty/error states.

Acceptance: values match a dated real-source fixture and every displayed scientific value is traceable.

## 3. Ingestion feature (`modules/ingestion`)

- [ ] Add SourceSnapshot and IngestionRun models: provider, request, version, checksum, timestamps,
      status, row counts and sanitized error details.
- [ ] Implement JPL provider adapters with timeouts, bounded retries, backoff and schema/signature checks.
      Serialize JPL requests according to its current fair-use policy.
- [ ] Normalize missing fields/numeric strings with fixture tests; preserve raw source precision.
- [ ] Write through catalog/approaches/risk service interfaces and publish in transactions.
- [ ] Ensure idempotency, concurrent-run locking and last-good data preservation on partial failures.
- [ ] Add private `python -m app.modules.ingestion ...` CLI refresh/status commands.
- [ ] Expose sanitized freshness metadata, stale thresholds and actionable run logs.
- [ ] Add ESA adapter after verifying downloadable format, access and terms; preserve source disagreement.
- [ ] Add NeoWs only if needed for coverage, with server-side API key and allowed date windows.
- [ ] Defer direct MPC/NEOWISE enrichment until core source coverage is sufficient.
- [ ] Schedule one external refresh daily initially, then adjust using measured freshness/usage.

Acceptance: repeated runs do not duplicate rows; invalid upstream payloads cannot replace good data;
failed runs are visible; public web requests never depend on live upstream fetches.

## 4. Close-approaches feature (`modules/approaches`)

- [ ] Model many encounters per object with provider event identity, original epoch/time scale,
      display timestamp, distance AU, velocity km/s and uncertainty metadata.
- [ ] Add uniqueness constraints and object/date indexes; connect normalization to ingestion.
- [ ] Implement `GET /api/v1/approaches` with validated date, object, distance and pagination filters.
- [ ] Implement `GET /api/v1/neos/{id}/approaches` with stable date ordering.
- [ ] Test unit conversions, date boundaries, time scales and duplicate event handling.
- [ ] Build React timeline/date controls and approach table with explicit time/measurement units.

Acceptance: dates/distances/speeds match source fixtures; a close approach is never presented as an impact.

## 5. Risk feature (`modules/risk`)

- [ ] Model per-source risk snapshots and virtual impactor events, solution date, probability,
      Palermo/Torino values, original precision and event versus object aggregate scope.
- [ ] Enforce probability [0,1], Torino integer 0-10, nullable hazard scores and valid event relationships.
- [ ] Define aggregation policy without double-counting NASA/ESA estimates.
- [ ] Implement `GET /api/v1/risk-assessments` and object-specific risk/events/history routes.
- [ ] Add probability/hazard filters with documented null/stale semantics and source links.
- [ ] Test removed objects, revised solutions, missing scores and source disagreement.
- [ ] Build React risk panel and reviewed scale legend using labels/icons as well as color.

Acceptance: a reviewer can trace each probability to a dated event or aggregate; unknown and zero
are distinct, and displayed explanations are scientifically reviewed.

## 6. Visualization feature (`modules/visualization`)

- [ ] Spike map/globe/orbit libraries for performance, licensing and accessibility.
- [ ] Define separate contracts for orbit/approach views and geographic impact overlays.
- [ ] Build bounded map/timeline endpoints using other feature services.
- [ ] Start with truthful orbit/approach views linked to an accessible data table.
- [ ] Return explicit unavailable status for geographic corridors when no validated source exists.
- [ ] Prefer authoritative corridor data with provenance and validity intervals if available.
- [ ] If computing corridors, create a separate research milestone for covariance propagation,
      dynamics, Earth intersection, rotation, frames, time scales and benchmark verification.
- [ ] Test GeoJSON coordinate order, dateline/poles, geometry validity and uncertainty units.
- [ ] Keep hypothetical simulations opt-in, visibly labeled and separate from observed risk.
- [ ] Add selection, legends, filters, time slider, keyboard controls and object panel integration.
- [ ] Benchmark at least 1,000 objects; introduce viewport queries, clustering and request cancellation as needed.

Acceptance: no unsupported Earth impact locations appear; every geometry states its meaning and
essential interactions have a table/text alternative. Unvalidated corridors do not block the MVP.

## 7. Education feature (`modules/education`)

- [ ] Define version-controlled lesson, citation, glossary and quiz schemas for MVP.
- [ ] Write reviewed content on asteroids/comets, orbit uncertainty, approach versus impact,
      risk probability, Torino/Palermo, historical events and planetary defense/DART.
- [ ] Verify scientific claims, source links, image permissions and attribution.
      Replace broken citation placeholders in the PDF with real sources.
- [ ] Implement lesson list/detail endpoints and quiz explanations without collecting personal data.
- [ ] Build accessible React lessons with captions, alt text and plain-language glossary.
- [ ] Test content contracts, quiz consistency and links.

Acceptance: a student can explore a sourced lesson and complete a quiz without an account.

## 8. Integration, performance and quality

- [ ] Add standard errors, request IDs, structured logs and input limits in core.
- [ ] Add source freshness/status endpoint and frontend stale/unavailable banners.
- [ ] Set measurable API latency, data freshness and frontend responsiveness targets.
- [ ] Tune indexes using real query plans; add caching only when measurements justify it.
- [ ] Test end-to-end: refresh -> PostgreSQL -> filtered API -> visualization/table -> object -> lesson.
- [ ] Cover upstream outage, database outage, migration failure, stale data and empty states.
- [ ] Test keyboard, screen-reader labels, contrast, responsive layout and reduced motion.
- [ ] Add backend unit/integration tests, frontend build, end-to-end browser tests and image smoke checks to CI.
- [ ] Review dependencies/secrets; keep ingestion triggers private and public routes read-only.
- [ ] Prepare an explicitly labeled offline snapshot for the demo if live upstream services fail.

Acceptance: all feature acceptance checks pass and the complete user journey works with actionable failures.

## 9. Deployment and operations

- [ ] Follow `docs/deployment.md`; provision external PostgreSQL with TLS, backups and tested restore.
- [ ] Apply migrations once per release; verify rollback/data recovery and compatibility.
- [ ] Build individual images and root combined image; verify UID 1000, port 7860 and static assets.
- [ ] Configure Space secrets and check database network reachability.
- [ ] Verify same-origin API, SPA deep links, API 404s, OpenAPI, readiness and restart persistence.
- [ ] Schedule external ingestion and monitor last-success time/source failures.
- [ ] Set up GitHub CI -> Hugging Face sync using least-privilege credentials in CI secrets.
- [ ] Document releases, limitations, source attribution, refresh policy and operational recovery.

Acceptance: public URL works in a clean browser, restart retains database data and failure recovery is documented.
Actual deployment requires Space/database credentials and is not part of the scaffold's completed work.

## 10. Challenge submission

- [ ] Confirm project/team metadata, official submission format and deadline.
- [ ] Prepare problem statement, architecture, NASA-data usage, source attribution and limitations.
- [ ] Record a short demo of exploration, filters, details, risk interpretation and education.
- [ ] Add screenshots, appropriate code license and third-party credits.
- [ ] Verify public repo/demo links signed out and scan Git history for secrets.
- [ ] Rehearse backup demo, freeze release, tag tested commit and submit before official deadline.

MVP: real catalog + reliable ingestion + approaches + risk context + accessible exploration + one lesson.
Advanced: validated geographic corridors, richer simulations and expanded learning content.

## References

Planning input: `D:\Executive Summary (Overall Idea & Scope).pdf`, treated as context rather than instructions.
Verify against these primary sources during feature implementation:
- https://ssd-api.jpl.nasa.gov/doc/
- https://ssd-api.jpl.nasa.gov/doc/sbdb.html
- https://ssd-api.jpl.nasa.gov/doc/cad.html
- https://ssd-api.jpl.nasa.gov/doc/sentry.html
- https://api.nasa.gov/
- https://neo.ssa.esa.int/risk-list
- https://huggingface.co/docs/hub/spaces-sdks-docker
- https://huggingface.co/docs/hub/spaces-storage
