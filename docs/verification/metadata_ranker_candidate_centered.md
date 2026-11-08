# Candidate-centred ranker acceptance

Real IRSA/SkyBoT run recorded 2026-11-08T17:17:00.635442+00:00; no fixture fallback.

RA 179.88°, Dec -0.64°, 21-23 December 2025, QR2, 12 physical exposure epochs.
Visit span: 27.821 hours.

Total wall time: **115.500 s**; worker: **113.594 s**.
Native cutouts: **8**, **9 HTTP attempts** including retries; cache hits: **0**.

All **38 faint objects** are unscored with no product IDs/downloads. They include all **23** faint objects from the old capped result.
The new run retains every SkyBoT candidate, so additional faint objects are no longer removed by the old total-candidate cap.

## Bright candidates and every frame

### Massalia

Predicted V=10.870; rank **0.9999999563144074**; ensemble spread **1.0703322865878004e-07**.
Classification is the package hint: **possible_motion**.
Package `n_frames_used`: **8** QC-usable frames; **6** selected for score by its unchanged spread rule.
The rank is not a probability or discovery confirmation.

| UTC mid-MJD | Detector | Candidate-centred RA / Dec (deg) | Used for score | Reason if not used |
| --- | --- | --- | --- | --- |
| 61030.2476280 | D1 | 179.74782917 / -0.57865861 | yes | — |
| 61030.2506125 | D1 | 179.74867917 / -0.57903111 | yes | — |
| 61030.2521045 | D1 | 179.74910417 / -0.57921722 | no | USABLE_NOT_SELECTED_BY_RANKER |
| 61030.3138020 | D1 | 179.76666875 / -0.58691222 | yes | — |
| 61030.5828345 | not downloaded | 179.84306583 / -0.62038194 | no | NOT_REQUESTED_ENOUGH_USABLE_FRAMES |
| 61030.7228045 | D2 | 179.88268750 / -0.63774083 | yes | — |
| 61030.7257890 | D2 | 179.88353125 / -0.63811056 | no | USABLE_NOT_SELECTED_BY_RANKER |
| 61030.7272810 | D2 | 179.88395333 / -0.63829528 | yes | — |
| 61031.0608355 | D1 | 179.97801875 / -0.67950750 | yes | — |

All downloaded frames passed the package's QC, inside-image and aperture checks. No edge/QC/unmeasurable-aperture exclusions occurred for Massalia.

## Files and verification

- [Full backend result JSON](metadata_ranker_candidate_centered_live_result.json)
- [Live worker/database report](metadata_ranker_candidate_centered_live.json)
- [Acceptance audit and full per-frame metadata](metadata_ranker_candidate_centered_acceptance.json)
- Backend regression: **194 passed**; 13 supplied golden cases printed OK; **58 package SHA-256s unchanged**.
- Frontend: production build passed; 16 viewer/ranker browser checks passed before the final legacy-result notice, followed by a focused ranker rerun.

The transient discovery outage and pre-correction immutable-metadata rejection are retained in the adjacent initial/fenced/immutable-conflict reports. The latter was a backend ledger comparison between compact snapshot entries and full stored source records, fixed without changing the package or scientific selection/QC policy.
This is local integration acceptance. No deployment or production database migration was performed.
