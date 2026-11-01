# Releases — registry and bounded metadata refresh

Curated QR3/QR2 adapters remain explicit. Configurable discovery TTL, immutable snapshots, PostgreSQL
refresh lease/cooldown/status, protected admin API and bounded external-scheduler CLI are implemented.
Explicit view refresh rebuilds against new metadata without changing the saved source view. New release
schemas/PSF/calibration still require adapter review. No external scheduler is provisioned locally.
See [contract and operation](../../../../docs/context_sharing.md).
