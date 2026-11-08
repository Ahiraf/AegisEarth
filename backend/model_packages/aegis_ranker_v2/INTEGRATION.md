# Integration sheet: aegis_ranker package v2

Optional hint for the AegisEarth viewer. The viewer must keep working when this module fails or is switched off.

## What is in the package
- aegis_ranker/features.py: reads native IRSA cutouts and scores a candidate track. Needs numpy and astropy.
- aegis_ranker/candidates.py: finds known objects with IMCCE SkyBoT. Needs astroquery and network access to IMCCE.
- ranker_AB_v3.json: the model (50 small logistic models, scores are averaged). MANIFEST.json holds a SHA-256 for every file.
- golden/: 13 test cases with FITS files and expected outputs. MODEL_CARD.md: evidence and limits. example_output.json: one result.

## Per-job flow
1. Pick the visit: exposures of the same sky position, split where the gap between exposures exceeds 12 hours. Use 6-12 exposures spread across the visit (not the first few).
2. Download one NATIVE cutout of 15 arcmin per exposure (the same IRSA cutout URL pattern as cutouts_manifest.json, with size=15arcmin, centred on the search centre). Not the prepared/resampled product. Download in parallel and cache.
3. frames = [dict(ra=centre_ra, dec=centre_dec, mjd=mid_mjd), ...] with mid_mjd = (t_min + t_max) / 2.
   cands = candidates.find_candidates(frames, radius_deg=0.18)   # about 3 s per frame, one SkyBoT query each
4. For each candidate c, build its frames: for every exposure whose mjd appears in c['frames'], dict(path=cutout_file, ra=<that frame's ra>, dec=<that frame's dec>, mjd=<mjd>).
5. res = features.rank(cand_frames, model, v_mag=c['v_mag'], version='l2b-v27')   # version = processing version from the file path, optional
6. Store the result as below. Run steps 3-6 inside the async job, never in the request.

## Output fields and the candidates table
- score (0-1, or None): candidate_score, uncalibrated, NOT a probability. None means it could not score. -> candidates.score (NULL allowed), score_kind = 'candidate_score'.
- classification_hint: 'possible_motion' or 'uncertain' -> candidates.classification. The model never says 'artifact' or 'brightness_change'.
- displacement_arcsec -> candidates.displacement_arcsec. Use the candidate's position in the middle frame for ra/dec.
- uncertainty: spread of the score over 50 models, not a confidence interval -> needs a new optional field score_uncertainty.
- warnings, explanation_codes, span_hours, frames_used, evidence, n_frames_used -> candidates.evidence (JSON). model_version_id -> candidates.model_version_id.
- meets_10pct_threshold is informational only. Do not use it for labels.

## What the viewer should show
Score as a rank (not a percentage), the uncertainty, per-frame positions and timestamps and wavelengths from the backend's own frame metadata, and the warnings in plain words:
- TOO_FEW_USABLE_FRAMES: Not enough usable frames to score this candidate.
- FRAME_FAILED_QC: Some frames were excluded for data-quality reasons.
- POSITION_NEAR_EDGE_OR_OUTSIDE: The predicted position is at or beyond the edge of some frames.
- APERTURE_UNMEASURABLE: Too many masked pixels at the predicted position in some frames.
- LOW_MOTION: Little motion across these frames; a fixed source would look the same.
- APERTURE_ON_CATALOG_SOURCE: A catalogued source overlaps the position in every frame; flux may be contaminated.
- PREDICTED_FAINTER_THAN_TRAINING_RANGE: Predicted brightness is outside the range this ranker was tested on.
- PREDICTED_BRIGHTER_THAN_TRAINING_RANGE: Same, on the bright side.
- LIMITED_VALIDATION_FOR_PROCESSING_VERSION: Few validation examples exist for this data-processing version.
- EXTRA_FRAMES_IGNORED: More than six frames were supplied and only the first six were used.
For a 'possible_motion' candidate that also carries APERTURE_ON_CATALOG_SOURCE add: "In crowded areas this label is wrong more often (about 1 in 8 random paths in our most crowded test field)."

## Rules
- Do NOT run it on the five preset targets. Do not call the score a probability. Do not substitute snr_proxy or the prepared FITS.
- The only validated threshold is the 5% one (0.2951). classification_hint already uses it.
- Trained V range is 10.1-18.1. A predicted V above 18.1 is capped at 'uncertain' by the module (pass v_mag).
- The module drops frames that fail QC or sit near the edge. Fewer than 4 usable frames gives score None with warnings only.
- Candidates must move on the sky (SkyBoT objects or user-drawn paths).
- Processing versions with few validation examples: l2b-v27.

## Time and resources
Cutout download 14-43 s each (from your manifest); SkyBoT about 3 s per frame; scoring about 1 s per candidate on 2 CPU cores (reading the FITS dominates). Several candidates per field is normal (7-8 in our test).

## Your acceptance checks
1. pip install -r requirements.txt (plus astroquery for candidates.py).
2. python golden/check_golden.py ranker_AB_v3.json -> all 13 cases OK, also in your Docker image.
3. Verify the SHA-256 of every file against MANIFEST.json.
4. Run one real visit end to end and send me the result JSON.
5. A failure of this module must never disable playback, spectra or survey context.
