# Views: acquisition, preparation and movie delivery

view-v1 preserves bounded native input acquisition. view-v2 adds exact-grid prepared frames and
movie-v1 manifests/pages with separate data readiness, chronology and quality/provenance metadata.
Anonymous jobs use transactional quotas/idempotency and scoped cancellation; science stays in the
isolated native worker. Optional ML never gates delivery. Both repository transports preserve source-
bound immutable publication and expiry. [Movie contract](../../../../docs/movie_delivery.md).
