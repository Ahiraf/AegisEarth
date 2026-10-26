# Analysis jobs
Models and request schema exist. Submission currently returns 503: no worker or image pipeline is implemented.
Future service owns idempotency, PostgreSQL job leases, retries, cancellation, stage runs and atomic publishing.
CPU-heavy processing must execute outside FastAPI request handlers.
