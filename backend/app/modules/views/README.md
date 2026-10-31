# Views: implemented input acquisition

view-v1 accepts coordinate/FOV/date/band criteria without IDs, ranker or model. Transactional admission,
scoped idempotency/cancellation and an isolated native worker acquire inputs. Success is inputs_ready.
[View contract](../../../../docs/views.md). Registered frames/manifests remain steps 4-5.
