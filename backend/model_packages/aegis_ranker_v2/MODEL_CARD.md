# AegisEarth candidate ranker (ranker_AB_v3, package v2)

Optional hint for the AegisEarth viewer; the viewer works without it. The score is an UNCALIBRATED candidate score (it ranks candidates), not a probability.

## What it does
Given native SPHEREx L2 cutouts of ONE visit and, for a candidate moving object, one ICRS position per frame, it scores whether a moving source is consistently present across 4-6 frames spread over the visit. Output: score in [0,1] or null; uncertainty (spread over 50 bootstrap models); classification_hint ('possible_motion' when the score reaches the 5% false-alert threshold 0.2951, otherwise 'uncertain'); explanation_codes; warnings; displacement_arcsec; span_hours; the evidence features; the frames used.
It does not find candidates. candidates.py proposes known objects from IMCCE SkyBoT; user-drawn paths can be scored too. Candidates must move on the sky.

## Input boundary
- Native IRSA cutout FITS (IMAGE, VARIANCE, FLAGS, WCS), not the prepared product. Flag bit definitions are read from the FLAGS header (QR2 MP_* and QR3 MSKN/MSKM are both handled).
- Cutout of 15 arcmin (0.25 deg, about 146 px) or similar, so that every candidate position is at least 12 px from the edge. A 3 arcmin cutout is too small for tracks that last hours.
- Send 6-12 frames spread across one visit (exposures separated by less than 12 h) with mjd; the module drops frames that fail QC and keeps up to 6 usable frames spread evenly in time, the rule used in training. Fewer than 4 usable frames gives score = null.
- Per-frame QC gate: L2DQAFLG == Pass, FINAST == 0, bad-pixel fraction <= 0.25, SOURCE fraction <= 0.90, non-NaN coverage >= 0.90.
- Optional: v_mag (predicted V from SkyBoT) and version (for example l2b-v27).

## Processing (identical in training and serving: aegis_ranker/features.py)
Aperture 2 px, background annulus 5-9 px, native pixels, IMAGE used directly (no ZODI subtraction). Rejected pixels: every flag defined in the header except MP_SOURCE and MP_FULLSAMPLE. In the aperture only, MP_OUTLIER pixels are tolerated (a static-sky pipeline flags moving objects as outliers); the background excludes them.

## Model
Logistic-regression ensemble (50 bootstrap models, class-balanced, C = 0.5) on 14 features: track_snr_l, snr_wo_top_l, med_snr_l, frac_gt3, top_share, n, m_bad_frac, m_noise_mad, m_persist_frac, m_cr_frac, m_outlier_frac, m_badpix_frac, outlier_ap, outlier_frames. Signed-log transform for S/N features. Wavelength/time and source-overlap features were tested and not used. Inference needs only numpy and astropy.

## Training data
114 real-mover tracks and 570 displaced-control tracks from 25 known asteroids (JPL Horizons positions; trained V range 10.1-18.1), SPHEREx QR2/QR3 cutouts, processing versions l2b-v20 to v27, 6 frames spread over each visit. Movers by magnitude bin: V 8-11.5: 18, 11.5-14.5: 6, 14.5-16: 42, 16-17: 37, 17-18.5: 11. Controls are the same frames with the path displaced by 15-40 px (5 per visit). No synthetic data.

## Evaluation (pooled sets, leave-one-asteroid-out, production ensemble, 95% intervals from resampling asteroids)
| method | AUC | recall at 5% false alerts | false alerts at 90% recall |
|---|---|---|---|
| rule: S/N without top frame | 0.980 | 0.85 [0.70-1.00] | 0.056 [0.018-0.098] |
| image-only ranker | 0.975 | 0.87 [0.72-0.99] | 0.058 [0.013-0.119] |
| final model | 0.991 | 0.96 [0.91-1.00] | 0.016 [0.003-0.048] |

Paired, final minus image-only: recall +0.08 [+0.00, +0.21]; false alerts at 90% recall -0.037 [-0.083, -0.006]. Final minus rule: recall +0.09 [-0.02, +0.23]; false alerts -0.035 [-0.060, -0.011]. The false-alert reduction is supported; the recall gain is only suggestive.

Operating points (thresholds from out-of-fold control scores): 5% target: threshold 0.2951, recall 0.96; 10% target: threshold 0.1159, recall 0.98.
Recall at the 5% threshold by magnitude: V 8-11.5 1.00 (n=18); 11.5-14.5 1.00 (n=6); 14.5-16 1.00 (n=42); 16-17 0.95 (n=37); 17-18.5 0.82 (n=11). By processing version: l2b-v20 0.97 (n=36); v24 0.93 (n=30); v27 0.90 (n=10); other versions 1.00 (n=38).
Control false-alert rate at the 5% threshold: v20 0.061, v24 0.053, v27 0.100, other 0.026; set A 0.058, set B 0.049.
Threshold chosen on the other asteroids (held out): 5% target gives recall 0.96 with false alerts 0.054; 10% target gives recall 0.98 with false alerts 0.105.
Motion: tracks with under 4 px of motion between the first and last frame (49 of 114 real movers): recall 0.98, control false alerts 0.029; tracks with 4 px or more: recall 0.954, false alerts 0.068.

## Limitations
- Trained on 10.1-18.1 mag known asteroids only. V 11.5-14.5 has 6 and V 17-18.5 has 11 real tracks, so those rows are qualitative. Fainter objects, comets and other fields are untested; a predicted V above 18.1 cannot be labeled possible_motion (conservative design rule, not a measured one).
- The remaining false alerts are mostly bright catalogued stars on the path with no OUTLIER flag in the frames. A warning for this was tested and rejected by a pre-set rule (it fired on 13% of real movers). A fixed star tracked at constant RA/Dec would also score high: callers must supply moving candidates.
- Processing version(s) l2b-v27 have fewer than 15 real movers in training; their false-alert estimates are noisy and v27 showed twice the target rate. A warning is attached.
- Negatives are displaced paths through real frames, not output of a candidate generator.
- The feature set and thresholds were chosen on the same data used for the reported figures (leave-one-asteroid-out reduces but does not remove this optimism). An earlier check on the bright set with closely spaced frames and the first model gave 15.3% control false alerts; spread frames, pooled training and a re-derived threshold brought it to 5.8% and the individual contributions were not separated.
- Part of the performance comes from the pipeline's own OUTLIER flag at the candidate position; the ranker is not an independent detector.
- Frames in crowded fields often fail the QC gate; then the module returns warnings and no score.
- Not for the preset targets (Barnard's Star, Epsilon Indi B, WISE 0855, RW Aurigae, R Draconis): their motion between frames is far below one pixel or they are variable stars.
- Scores are not calibrated probabilities.

## Resources
One 6-frame track: 0.22 s on x86_64, 2 CPU cores, Python 3.13.18 (dominated by reading the FITS files). Environment: numpy 2.4.6, astropy 7.2.3; scikit-learn was used for training only. candidates.py needs astroquery and network access to IMCCE (about 3 s per frame).

## Golden cases
golden/cases.json with FITS files and expected outputs (absolute tolerance 1e-6). Run: python golden/check_golden.py ranker_AB_v3.json


## Crowded-field false-alert test (original three fields, nothing injected)
Random moving paths (rates 5-60 arcsec/hour, random directions, 15 per visit) were drawn through the real frames of 24 visits in three crowded ecliptic fields and scored with the production module. All 360 tracks could be scored. False-alert rate at the 5% threshold (0.2951): 7.5% pooled [4.7-10.6] (intervals resample visits); elon030 4.2% [1.7-5.8], elon150 4.8% [1.9-8.6], and the most crowded field elon240 12.6% [6.7-17.8]. At the 10% threshold (0.1159) the pooled rate was 14.2% [10.0-18.9] and 25.2% in elon240, so the 10% threshold is not reliable in crowded fields and must not be used for labels. Of the 27 alerts at the 5% threshold, 63% had every frame on a catalogued source and the median share of frames with the OUTLIER flag was 0.17. A pre-set criterion (pooled rate <= 0.10 with upper end <= 0.15) was met, but one field exceeded the 5% target. Random paths approximate user-drawn paths, not SkyBoT candidates; recall cannot be measured in these fields.
