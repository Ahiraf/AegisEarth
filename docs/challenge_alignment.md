# Challenge coverage and scope decisions

Baseline: 29 October 2026. Input: complete challenge text supplied by the user in this conversation.
The direct website still returned 502 during reference checking; that does not invalidate the supplied
brief. Objective/considerations are now understood. Submission rules/deadline/eligibility remain separate.

## Required objective and tests

| Brief item | Project requirement | Backend / React handoff | Plan / acceptance |
| --- | --- | --- | --- |
| Public-facing SPHEREx sky web tool | SKY-001/002, JOB-001 | Anonymous bounded coordinate requests, real data/artifacts; React public UI | 2–5, 11; enter fresh valid coordinates without private credentials |
| RA/Dec input | SKY-001 | Unit-aware normalization, explicit errors and canonical state | 2; decimal/sexagesimal, wrap/poles and malformed input |
| Sequence like a little video | VIEW-001–005 | Ordered frame manifest, actual dates/gaps, previews; React play/loop/speed/scrub/blink | 4–5; ≥2 real epochs, fixed sky grid and responsive player |
| Spot moving objects | CMP-002/003, SKY-004 | Preserve apparent displacement and quality/uncertainty; human inspection first | 4, 6; alignment does not track away target motion |
| Named test objects | SKY-003 | Presets + query/frame/coverage/quality receipts | 1, 6; all rows of [target matrix](target_validation.md) actually run |
| Variable-star context | VIEW-004, SPC-003/004 | Shared brightness stretch, comparable epochs/bands and flux evidence | 6, 8; RW Aurigae/R Draconis changes not forced into motion |

## Every potential consideration adopted for the expanded release

| ID / consideration | Requirements | Ownership / public behavior | Completion evidence / plan |
| --- | --- | --- | --- |
| PC-01 Latest releases | REL-001, OBS-004 | Backend source registry/refresh/cache/dedup; React last-checked/latest controls | New product appears on refresh, old frozen view unchanged; 2, 10 |
| PC-02 Explore 102 bands | BAND-001, CMP-002 | Actual channel coverage/response metadata; React detector/channel selector | Available bands shown, missing coverage explicit; 4–5 |
| PC-03 Sum six detectors separately | BAND-002, ADD-001 | D1–D6 per-epoch response-aware composites, count/error/coverage maps | All six detector choices tested on available data, stable weighting over epochs; 7 |
| PC-04 On-demand spectra | SPC-001–004 | Async coordinate/aperture extraction, units/errors/flags/epoch grouping; React graph/download | Reference-checked real samples, no fake full coverage; 8 |
| PC-05 Add/subtract epochs | ADD-001, DIF-001/002 | Coadd and signed difference artifacts/eligibility; React operation controls | Controls show expected signed residuals, masks, variance and temporal-smearing warnings; 7 |
| PC-06 User-selected FOV | SKY-002, resource limits | Bounded cutouts/full-footprint discovery and estimates; React FOV control | Small/large requests tested, larger fields expose transfer cost, no silent cropping; 2–5, 11 |
| PC-07 Gaia and WISE context | OVL-001–003 | Gaia markers and WISE image/catalog layers with epoch/band info; React overlay toggles | Both sources usable, epoch/motion errors labeled, failures isolated; 9 |
| PC-08 Coordinates in URL | URL-001 | Canonical normalized coordinate state and frozen manifest; React URL restore | Fresh browser restores RA/Dec/FOV/dates/band/mode; 10 |
| PC-09 Embedding | URL-002 | Public artifact/CORS and explicit embed/framing contract; React embed route | Real iframe in second site works with labels/accessibility; 10–11 |
| PC-10 Metadata/contamination | META-001, IMG-002 | Decode flags, coverage/calibration/epoch context in JSON/text; React inspector | SOURCE not universally masked; contamination visible per frame/pixel where provided; 4–5 |
| PC-11 Astronomy/display tools | TOOL-001 | Astropy/unit-aware science; React Aladin Lite v3 spike, WCS/FITS/catalog/CORS | Roundtrip orientation/sky-pixel and actual browser loading test; 4–5, 9 |

The original brief makes these suggestions optional. The user requested coverage of all of them, so
none are silently dropped from the expanded release. They are sequenced after the first usable movie;
unsupported data states must be truthful, not accepted as evidence of a working positive measurement.
Optional GIF/MP4 exports are a convenience; chronological browser playback is the required experience.

## Scope reduction from the previous plan

| Previous emphasis | Revised decision |
| --- | --- |
| Two-image automatic detection/ranking as the first complete product | Coordinate-driven multi-epoch viewer first; image arithmetic and spectra build on its frames |
| Mandatory classical ranker before model integration | Deferred; not a challenge requirement or release prerequisite |
| Mandatory CNN/Siamese results to show change | Optional researcher package after core/expanded viewer; never gate movie availability |
| Automatic multi-observation track fitting | Deferred; humans can inspect many epochs without automated association |
| Protected processing only through a frontend BFF | Bounded anonymous viewer jobs; admin operations remain protected; React needs no embedded service secret |
| Selected observation IDs limited to two-to-six images | New viewer request starts with sky region; frames/pagination/time bins have explicit limits |
| M101 and optional comet as demonstration coverage | Retained engineering controls; five named challenge tests take priority |

Keep useful modules/schema/research. This planning revision does not delete history, reset DBs, enable
unimplemented endpoints or alter the frontend. [SRS](../SRS.md) defines the revised requirements and
[todo plan](../todo_plan.md) assigns implementation order and exit checks.

5 November implementation follow-up: the user requested the production React integration. The
[frontend now exposes the completed backend workflows](frontend_integration.md) while preserving
the designer's theme. Local controlled browser/container verification is distinct from public-host,
fresh real-pixel/Aladin and scientific acceptance; the coverage matrix's release gates still apply.
