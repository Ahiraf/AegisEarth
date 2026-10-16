# Ingestion (planned)
Own provider adapters, raw snapshots, validation, normalization, refresh runs and CLI jobs.
Use catalog/approaches/risk service interfaces for writes; do not call providers from web requests.
Run scheduled work outside API workers to avoid duplicate refreshes.
