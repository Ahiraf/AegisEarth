# Comparisons

Revised target: separate native display, comparable movie, coadd/difference and photometry eligibility.
The historical QR2 preflight is not a universal viewer gate. Strict operation failure must preserve
inspectable originals with warnings; production policies require release/response/PSF validation.


## Production feature (planned)

Own footprint, epoch/time-scale, local wavelength/bandwidth, calibration release, masks and PSF
compatibility policies. Build a versioned machine-readable decision before submitting expensive work.

## Milestone-one implementation

`feasibility.py` applies `engineering-preflight-v1` to curated offline inputs and measured
geometry. It returns explicit gate evidence and blockers. See `docs/research/compatibility_policy_v1.md`
for thresholds and limitations. It does not establish scientific compatibility, motion or production
API availability; empirical registration, newer ePSF and researcher review remain later work.

Step 4 adds operation-specific display/band/coverage eligibility and complete-link grouping in eligibility.py.
[Frame policy](../../../../docs/frame_preparation.md); quantitative operations remain blocked with reasons.
