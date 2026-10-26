from app.pipeline.contracts import StageSpec

PIPELINE_VERSION = "0.1.0-spec"
STAGES = (
    StageSpec("validate_compatibility", "comparisons", "compatibility_report"),
    StageSpec("acquire_cutouts", "cutouts", "raw_fits_and_checksums"),
    StageSpec("inspect_and_mask", "preprocessing", "science_variance_mask_wavelength"),
    StageSpec("register", "registration", "aligned_images_common_wcs"),
    StageSpec("match_background_psf", "preprocessing", "matched_images_and_variance"),
    StageSpec("difference", "differencing", "difference_significance_coverage"),
    StageSpec("detect", "detection", "per_epoch_sources_and_residuals"),
    StageSpec("associate", "association", "motion_brightness_artifact_candidates"),
    StageSpec("rank", "ranking", "versioned_candidate_scores"),
    StageSpec("build_evidence", "artifacts", "previews_cutouts_overlays_metadata"),
    StageSpec("publish", "analyses", "atomic_result_manifest"),
)


def describe_pipeline():
    return {
        "version": PIPELINE_VERSION,
        "execution_available": all(s.implemented for s in STAGES),
        "stages": [
            {"name": s.name, "owner": s.owner, "output": s.output, "implemented": s.implemented}
            for s in STAGES
        ],
    }
