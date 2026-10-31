"""Pure frozen movie representation. Browse readiness never claims scientific comparison."""

import hashlib
import json
from uuid import NAMESPACE_URL, UUID, uuid5

from astropy.time import Time

from app.modules.views.movie_schemas import MovieArtifact, MovieFrame, MovieManifest, MovieTimeline

VERSION = "movie-v1"


def fingerprint(value):
    return hashlib.sha256(
        json.dumps(value, sort_keys=True, separators=(",", ":"), allow_nan=False).encode()
    ).hexdigest()


def utc(mjd):
    time = Time(float(mjd), format="mjd", scale="utc", precision=6)
    return time.isot + "Z"


def seconds(a, b):
    return float(
        (Time(float(a), format="mjd", scale="utc") - Time(float(b), format="mjd", scale="utc")).sec
    )


def build_movie(view, report):
    view_id = str(UUID(view["id"]))
    artifacts = report["artifacts"]
    source_frames = {f["index"]: f for f in report["frames"]}
    if len(source_frames) > 12:
        raise ValueError("Movie input bound exceeded")
    raw_metadata = {a["id"]: a for a in view.get("artifacts", [])}

    def link(index, expected):
        if not isinstance(index, int) or not 0 <= index < len(artifacts):
            raise ValueError("Missing prepared artifact")
        artifact = artifacts[index]
        if artifact["content_type"] != expected:
            raise ValueError("Prepared artifact has wrong media type")
        identifier = str(UUID(artifact["id"]))
        return MovieArtifact(
            id=identifier,
            url=f"/api/v1/artifacts/{identifier}/content",
            sha256=artifact["sha256"],
            content_type=expected,
            size_bytes=artifact["size_bytes"],
        ).model_dump()

    def make_frame(indices, artifact_indices, mode, start=None, end=None, bin_=None):
        members = [source_frames[i] for i in indices]
        first = members[0]
        start = min(f["start_mjd"] for f in members) if start is None else start
        end = max(f["end_mjd"] for f in members) if end is None else end
        mid = (start + end) / 2 if bin_ else first["mid_mjd"]
        preview_index = artifact_indices["preview"] if bin_ else artifact_indices[f"{mode}_preview"]
        image = link(preview_index, "image/png")
        planes = (
            link(artifact_indices["planes"], "application/fits")
            if "planes" in artifact_indices
            else None
        )
        inputs = []
        for member in members:
            identifier = str(UUID(member["raw_artifact_id"]))
            record = raw_metadata.get(identifier, {})
            inputs.append(
                {
                    "artifact_id": identifier,
                    "url": f"/api/v1/artifacts/{identifier}/content",
                    "sha256": record.get("sha256"),
                    "source_url": record.get("source_url"),
                    "product_id": member["product_id"],
                    "collection": member["collection"],
                    "release": member["release"],
                    "calibration_version": member["calibration_version"],
                    "detector": member["detector"],
                    "start_mjd_utc": str(member["start_mjd"]),
                    "mid_mjd_utc": str(member["mid_mjd"]),
                    "end_mjd_utc": str(member["end_mjd"]),
                    "doi": "10.26131/IRSA662" if member["release"] == "qr3" else "10.26131/IRSA652",
                }
            )
        warnings = []
        if not report["sequence_eligible"]:
            warnings.append(
                "Browsing is available; scientific comparison/registration support is not established"
            )
        stretch = (
            bin_.get(
                "stretch",
                {
                    "mode": "shared_asinh",
                    "limits_mjy_sr": None,
                    "asinh_softening": 10,
                    "reason": "legacy_bin_shared_limits_not_recorded",
                },
            )
            if bin_
            else first["stretch"]
        )
        if stretch["mode"] != "shared_asinh":
            warnings.append("Per-frame stretch changes visual brightness scaling")
        if mode == "native":
            warnings.append(
                "Native orientation/FOV differs between exposures; this is inspection, not registered comparison"
            )
        if (
            first["display_eligibility"].get("native_preview_policy") == "inspect_flagged"
            and mode == "native"
        ):
            warnings.append("Flagged native values are visible by explicit request")
        if bin_:
            warnings.append("Explicit temporal mean; all contributor intervals are retained")
            if stretch.get("limits_mjy_sr") is None:
                warnings.append(
                    "Legacy bin PNG has shared scaling but its numeric limits were not recorded"
                )
        return MovieFrame(
            id=str(uuid5(NAMESPACE_URL, view_id + ":" + mode + ":" + image["id"])),
            ordinal=0,
            kind="temporal_bin" if bin_ else "observation",
            time={
                "start_utc": utc(start),
                "end_utc": utc(end),
                "label_utc": utc(mid),
                "label_kind": "bin_interval_midpoint" if bin_ else "observation_midpoint",
                "scale": "UTC",
                "start_mjd_utc": str(start),
                "end_mjd_utc": str(end),
                "mid_mjd_utc": str(mid),
            },
            preview=image,
            science=planes,
            science_image_url=f"/api/v1/artifacts/{planes['id']}/science.fits"
            if mode == "common" and planes
            else None,
            original_inputs=inputs,
            spatial={
                "mode": "sky_fixed" if mode == "common" else "native",
                "shape": report["grid"]["shape"] if mode == "common" else first["native_shape"],
                "wcs_header": report["grid"]["header"] if mode == "common" else first["native_wcs"],
                "png_origin": "upper_left",
                "fits_origin": "lower_left",
                "png_flip_y": True,
            },
            spectral={
                "detectors": sorted({f["detector"] for f in members}),
                "contributors": [{"product_id": f["product_id"], **f["spectral"]} for f in members],
                "unit": "MJy/sr",
                "variance_unit": "(MJy/sr)^2",
                "quantitative_calibration": False,
            },
            stretch=stretch,
            quality={
                "contributors": [
                    {
                        "product_id": f["product_id"],
                        "mask": f["quality"],
                        "registration": f["registration"],
                        "psf": f["psf"],
                        "common_grid_usable_fraction": f["common_grid_usable_fraction"],
                    }
                    for f in members
                ],
                "comparison_supported": bool(report["sequence_eligible"] and mode == "common"),
                "subtraction_eligible": False,
                "photometry_eligible": False,
            },
            warnings=warnings,
        ).model_dump()

    usable = [
        i
        for i, f in source_frames.items()
        if f["display_eligibility"]["masked_common_grid"] and f["common_grid_usable_fraction"] > 0
    ]
    selected = [i for i in report["selected_indices"] if i in usable]
    common = []
    if report["sequence_eligible"] and report["options"]["temporal_bin_seconds"]:
        for bin_ in report["temporal_bins"]:
            if "artifact_indices" in bin_:
                common.append(
                    make_frame(
                        bin_["contributors"],
                        bin_["artifact_indices"],
                        "common",
                        bin_["start_mjd"],
                        bin_["end_mjd"],
                        bin_,
                    )
                )
            else:
                common.extend(
                    make_frame([i], source_frames[i]["artifact_indices"], "common")
                    for i in bin_["contributors"]
                    if i in selected
                )
    else:
        common = [
            make_frame([i], source_frames[i]["artifact_indices"], "common")
            for i in (selected if report["sequence_eligible"] else usable)
        ]
    native = []
    for i, f in source_frames.items():
        quality = f["quality"]
        fraction = (
            quality.get("finite_fraction", 0)
            if f["display_eligibility"].get("native_preview_policy") == "inspect_flagged"
            else quality["usable_fraction"]
        )
        if fraction > 0:
            native.append(
                make_frame(
                    [i], {"native_preview": f["artifact_indices"]["native_preview"]}, "native"
                )
            )
    timelines = {}
    frames = {}
    for mode, items in (("common", common), ("native", native)):
        items.sort(
            key=lambda f: (
                float(f["time"]["mid_mjd_utc"]),
                float(f["time"]["start_mjd_utc"]),
                f["id"],
            )
        )
        previous = None
        for ordinal, frame in enumerate(items):
            frame["ordinal"] = ordinal
            delta = (
                seconds(frame["time"]["start_mjd_utc"], previous["time"]["end_mjd_utc"])
                if previous
                else 0
            )
            frame["time"].update(
                {
                    "elapsed_seconds": seconds(
                        frame["time"]["mid_mjd_utc"], items[0]["time"]["mid_mjd_utc"]
                    ),
                    "gap_seconds": max(0, delta),
                    "overlap_seconds": max(0, -delta),
                }
            )
            previous = frame
        epochs = len({f["time"]["mid_mjd_utc"] for f in items})
        outcome = (
            "no_data" if not items else "single_epoch" if epochs < 2 else "ready_for_animation"
        )
        warnings = (
            []
            if report["sequence_eligible"] and mode == "common"
            else [
                "Image browsing readiness does not establish motion, variability or quantitative comparability"
            ]
        )
        timelines[mode] = MovieTimeline(
            mode=mode,
            outcome=outcome,
            frame_count=len(items),
            distinct_epoch_count=epochs,
            comparison_supported=bool(report["sequence_eligible"] and mode == "common"),
            frames_url=f"/api/v1/views/{view_id}/frames?mode={mode}",
            first_frame=items[0] if items else None,
            preload=[f["preview"]["url"] for f in items[1:3]],
            warnings=warnings,
        ).model_dump()
        frames[mode] = items
    payload = {
        "manifest_version": VERSION,
        "view_id": view_id,
        "source_snapshot_id": view["snapshot_id"],
        "source_registry_version": view["canonical_request"].get("registry_version", "unknown"),
        "processing_version": report["version"],
        "job_created_at_utc": view["created_at_utc"],
        "request": view["canonical_request"],
        "default_timeline": "common",
        "outcome": timelines["common"]["outcome"],
        "timelines": timelines,
        "playback": {
            "automatic_start": False,
            "default_frame_duration_ms": 700,
            "speed_is": "display_only_not_physical_time",
            "reduced_motion": "manual_step_by_default",
            "loop_allowed": timelines["common"]["distinct_epoch_count"] >= 2,
        },
        "warnings": list(
            dict.fromkeys(
                [
                    *report["warnings"],
                    *view["canonical_request"].get("selection", {}).get("discovery_warnings", []),
                    "A ready animation is a browsing capability, not a scientific detection",
                ]
            )
        ),
        "provenance": {
            "provider": "NASA/IPAC IRSA / SPHEREx",
            "preparation_url": f"/api/v1/views/{view_id}/preparation",
            "spectral_calibration_version": report["spectral_calibration_version"],
            "source_report_sha256": fingerprint(report),
        },
        "frames": frames,
    }
    MovieManifest.model_validate(
        {k: v for k, v in payload.items() if k != "frames"}
        | {"manifest_sha256": fingerprint(payload)}
    )
    return payload
