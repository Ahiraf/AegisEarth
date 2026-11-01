"""Build a human-readable receipt from executed target cases without inventing approvals."""

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "docs/verification/targets"


def main():
    summary = json.loads((OUTPUT / "summary.json").read_text(encoding="utf-8"))
    lines = [
        "# AegisEarth — step 6 target validation",
        "",
        f"Run `{summary['run_id']}`; UTC execution receipt: {summary['verified_at_utc']}.",
        "",
        "Backend engineering validation and source diagnostics are executed. Scientific reviewer: **not supplied**.",
        "Frontend handoff acceptance in the production UI is user-confirmed (1 November 2026); the browser receipt here tests the local reference player.",
        "",
        "## Executed outcomes",
        "",
        "| Target | Live case outcomes | Max baseline: live / pinned | Max expected shift: live / pinned | Scientific finding |",
        "| --- | --- | --- | --- | --- |",
    ]
    reports = []
    for row in summary["targets"]:
        report = json.loads((ROOT / row["receipt"]).read_text(encoding="utf-8"))
        reports.append(report)
        comparisons = [p for c in report["cases"] for p in c.get("comparisons", [])]
        baseline = max((p["baseline_days"] for p in comparisons), default=0.0)
        shift = max(
            (
                p["expected_tangent_motion_arcsec"]
                for p in comparisons
                if p["expected_tangent_motion_arcsec"] is not None
            ),
            default=None,
        )
        findings = {
            "barnards-star": "Bright-source flags prevent a target-aperture motion measurement",
            "epsilon-indi-b": "System B identity retained; Ba/Bb resolution unclaimed",
            "wise-0855": "Long-wave aperture signal is diagnostic; association/detection and motion unvalidated",
            "rw-aurigae": "Shared stretch retained; flagged pixels/response prevent calibrated variability inference",
            "r-draconis": "Bright-source masking/response differences prevent calibrated variability inference",
        }
        outcomes = "; ".join(
            c["case"] + ": " + c.get("movie_outcome", c["status"]) for c in report["cases"]
        )
        shift_text = f"{shift:.6f} arcsec" if shift is not None else "not available"
        prior = report.get("pinned_native_comparisons", [])
        prior_days = max((p["baseline_days"] for p in prior), default=0.0)
        prior_shift = max(
            (
                p["expected_tangent_motion_arcsec"]
                for p in prior
                if p["expected_tangent_motion_arcsec"] is not None
            ),
            default=None,
        )
        prior_shift_text = (
            f"{prior_shift:.6f} arcsec" if prior_shift is not None else "not available"
        )
        lines.append(
            f"| [{report['identity']['name']}]({report['target']}.json) | {outcomes} | {baseline:.6f} / {prior_days:.6f} days | {shift_text} / {prior_shift_text} | {findings[report['target']]} |"
        )
    lines += [
        "",
        "An empty bounded/overflowing search is not proof of no archive coverage. Single-epoch cases do not loop.",
        "Whole-image BAND follow-ups reduce unrelated detector rows under the 40-row SIA cap; they do not guarantee local response equivalence.",
        "All initial and follow-up outcomes are retained. The 27 earlier pinned cutouts add longer-baseline, alternate-epoch evidence without being relabeled as fresh padded API jobs.",
        "",
        "## Target-specific evidence",
        "",
    ]
    for report in reports:
        lines += [
            f"### {report['identity']['name']}",
            "",
            f"[Full receipt]({report['target']}.json); [{len(report['pinned_native_diagnostics'])} prior native inputs](../../research/target_feasibility/cutouts_manifest.json).",
            "",
        ]
        if (OUTPUT / (report["target"] + ".png")).exists():
            lines += [
                f"![Real shared-stretch previews: {report['identity']['name']}]({report['target']}.png)",
                "",
            ]
        if report.get("identity_context"):
            ctx = report["identity_context"]
            lines += [
                f"Catalog system identity `{ctx['selected_system']}` is separated from `{ctx['primary_id']}` by {ctx['catalog_separation_from_primary_arcsec']:.2f} arcsec at the catalog positions. This does not resolve Ba and Bb.",
                "",
            ]
        for case in report["cases"]:
            lines += [
                f"**{case['case']}** — {case['status']}; view `{case.get('view_id', 'not accepted')}`; outcome `{case.get('movie_outcome', 'not available')}`.",
                "",
            ]
            for frame in case.get("frames", []):
                d = frame["diagnostic"]
                a = d["aperture"]
                wave = d["target_local_wavelength_um"]
                snr = a.get("contrast_snr_proxy")
                flag = (
                    "; ".join(
                        f"{k}={v}" for k, v in d["saturation_or_bright_artifact_flags"].items() if v
                    )
                    or "none of the listed bright-artifact flags"
                )
                wave_text = f"{wave:.4f} µm" if wave is not None else "unavailable"
                snr_text = f"{snr:.3f}" if snr is not None else "unavailable (mask/coverage)"
                lines.append(
                    f"- {d['observed_at_utc']}: target wavelength proxy {wave_text}; aperture usable {a.get('usable_fraction', 0):.1%}; contrast SNR proxy {snr_text}; {flag}."
                )
            lines += [""]
        if report["target"] == "wise-0855":
            lines += [
                "The challenge seed retains its unknown epoch. Both seed and catalog-prediction fields are executed; neither position is silently assigned an observing epoch. The 4-5 µm aperture values are not a validated identification or a calibrated detection limit. No formal nondetection is asserted.",
                "",
            ]
    lines += [
        "## Interpretation and limits",
        "",
        "Expected shifts use the catalog pmRA*cos(dec), pmDec and actual FITS observing times. The scalar proper-motion error proxy lacks the catalog covariance, parallax/perspective and observer ephemeris; it is not a complete astrometric error budget.",
        "Each pair records expected displacement/native pixel size, header PSF FWHM (explicitly unvalidated), reference-registration residual availability and target-exclusion checks. Sampling near 6 arcsec is not an angular-resolution or detection threshold. Missing measured motion remains null.",
        "Aperture contrast uses a full strict-mask 1.5-pixel aperture and median 4-10-pixel annulus. It preserves intensity scaling, uses diagonal-variance proxies only, and omits covariance, PSF/aperture/response corrections and source-association validation. A high proxy value is not discovery evidence.",
        "Signed differences, calibrated spectra/photometry, Gaia/WISE context, refresh/share/embed and optional ML remain later plan slices. These unsupported operations are not scored as successful tests. The viewer remains independent of them.",
        "",
        "## Reproduction and sources",
        "",
        "```powershell",
        ".\\backend\\.venv\\Scripts\\python scripts/validate_challenge_targets.py",
        ".\\backend\\.venv\\Scripts\\python scripts/render_target_validation.py",
        ".\\backend\\.venv\\Scripts\\python scripts/report_target_validation.py",
        "cd handoff/player",
        "npm run verify:targets",
        "```",
        "",
        "Start the isolated foundation and reference player first. Re-runs create a new receipt generation; input checksums, catalog/config hashes, library versions and unexpired artifact IDs are recorded. Large FITS and browser screenshots stay under ignored var/.",
        "",
        "[Aggregate run receipt](summary.json), [browser evidence](browser.json), [five-target protocol](../../target_validation.md).",
        "Primary scientific references: [SPHEREx instrument/sampling](https://spherex.caltech.edu/page/instrument), [IRSA products and PSF caveats](https://caltech-ipac.github.io/spherex-archive-documentation/spherex-data-products/), [IRSA photometry caveats](https://irsa.ipac.caltech.edu/onlinehelp/spherex/spherex/sp.html), [Astropy position/velocity assumptions](https://docs.astropy.org/en/stable/coordinates/velocities.html).",
        "",
        "No model training, scientific reviewer approval, public deployment or confirmed motion/variability is asserted.",
        "",
    ]
    (OUTPUT / "README.md").write_text("\n".join(lines), encoding="utf-8")


if __name__ == "__main__":
    main()
