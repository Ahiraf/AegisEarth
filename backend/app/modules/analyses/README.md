# Analysis jobs

Revised plan: reuse/version job infrastructure for coordinate-driven views and optional derivative
jobs. The current pair/sequence AnalysisRequest schema is a legacy scaffold, not a viewer contract;
plan new view schemas/migrations rather than requiring every movie to select a ranker.

Models and request schema exist. Submission currently returns 503: no worker or image pipeline is implemented.
Additive processing_jobs and restricted gateway RPCs now implement transactional persistence/lease
primitives; local verification covers idempotency/concurrent claims/fencing/restart. These do not enable
HTTP processing submission or scientific execution. See docs/foundation.md.
Future service owns idempotency, PostgreSQL job leases, retries, cancellation, stage runs and atomic publishing.
CPU-heavy processing must execute outside FastAPI request handlers.
