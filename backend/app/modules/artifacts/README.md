# Artifacts
Persist metadata/checksums/provenance; image bytes belong in a storage adapter, not PostgreSQL rows.
Future storage adapters: local disk for development, durable object storage for hosted work.
Serve published IDs or short-lived URLs, not arbitrary filesystem paths or secrets.
