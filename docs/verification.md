# Replacement scaffold verification

Baseline: 26 October 2026. Verification here covers the Cosmic Motion AI backend foundation,
not the future scientific/ML pipeline.

Checks performed so far:

- 16 backend tests passed: API identity/capabilities, honest unavailable discovery/execution, request bounds,
  duplicate IDs, time-window validation, calibration-label guard, pipeline stage ownership/order and
  sanitized database-readiness failure.
- Migration upgrade, metadata drift check and downgrade passed against a temporary local SQLite database.
- Docker Compose configuration validated. PostgreSQL migration testing is configured in CI against a
  disposable service database; local SQLite success is not evidence that CI/PostgreSQL has run.
- Ruff lint and formatting checks passed; `pip check` reported no broken requirements.
- The renamed `cosmic-motion-api` editable package installed successfully with the CLI entry point.
- PostgreSQL offline migration SQL generation passed for all seven tables.
- OpenAPI snapshot generation passed; machine-readable request examples validate against current schemas.

Windows sandbox event-loop socket setup blocked TestClient startup; the successful test run executed
outside that sandbox. Existing upstream Starlette transport deprecation warning does not fail the suite.

Not yet verified: full Docker image builds/runtime, live PostgreSQL roundtrip, real IRSA discovery or
FITS pair, science stage outputs, job worker, trained model accuracy/calibration, object storage,
frontend integration, Space deployment or full challenge compliance. Docker Desktop's Linux engine
was unavailable, so container builds/runtime and live local PostgreSQL checks could not be completed.

No scientific source samples/weights are bundled. No fabricated detections are returned. No previous
database/volume was reset. Repository history, authentication configuration and the local Python
environment were retained; no commit or push is performed by this change.
