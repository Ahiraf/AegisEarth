# aegis_ranker package v2 (ranker_AB_v3)
    import aegis_ranker.features as AF, aegis_ranker.candidates as AC
    model = AF.load_model('ranker_AB_v3.json')
    cands = AC.find_candidates([dict(ra=..., dec=..., mjd=...), ...])           # known objects (SkyBoT), one query per frame
    res = AF.rank(frames, model, v_mag=cand['v_mag'], version='l2b-v27')        # frames: dicts with path, ra, dec, mjd
Keys: score (null when not scored), uncertainty, score_kind, model_version_id, classification_hint, explanation_codes, warnings,
evidence, n_frames_used, frames_used, displacement_arcsec, span_hours, meets_5pct_threshold, meets_10pct_threshold.
When score is null, store the candidate with classification 'uncertain', score NULL and the warnings in evidence.
See MODEL_CARD.md. Check: python golden/check_golden.py ranker_AB_v3.json
