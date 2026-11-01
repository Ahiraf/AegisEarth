"""Bounded captioned GIF from verified common-grid arrays; JSON sidecar retains source evidence."""

import json

from PIL import Image, ImageDraw

from app.modules.preprocessing.display import preview, stretch_limits


def export_movie(frames, sources, query, root, artifact):
    order = sorted(range(len(frames)), key=lambda i: sources[i]["metadata"]["mid_mjd"])
    limits = stretch_limits(
        [frames[i]["science"] for i in order], [frames[i]["valid"] for i in order]
    )
    images = []
    for index in order:
        f = frames[index]
        meta = sources[index]["metadata"]
        path = root / f"export_{index}.png"
        preview(path, f["science"], f["valid"], limits)
        with Image.open(path) as img:
            img = img.convert("RGBA")
            factor = max(1, min(8, 320 // max(img.size)))
            if factor > 1:
                img = img.resize(
                    (img.width * factor, img.height * factor), Image.Resampling.NEAREST
                )
            canvas = Image.new("RGB", (max(440, img.width), img.height + 65), "#101624")
            canvas.paste(img, ((canvas.width - img.width) // 2, 0), img)
        draw = ImageDraw.Draw(canvas)
        from astropy.time import Time

        date = Time(meta["mid_mjd"], format="mjd", scale="utc").isot + "Z"
        draw.text(
            (6, canvas.height - 60),
            f"AegisEarth | {date} | {meta['detector']} | MJy/sr",
            fill="white",
        )
        draw.text(
            (6, canvas.height - 43),
            "Quality-limited browsing; not a confirmed detection",
            fill="white",
        )
        draw.text(
            (6, canvas.height - 26), "NASA/IPAC IRSA / SPHEREx | shared asinh stretch", fill="white"
        )
        images.append(canvas)
        path.unlink()
    gif = root / "movie.gif"
    kwargs = {"loop": 0} if query["loop"] else {}
    images[0].save(
        gif,
        save_all=True,
        append_images=images[1:],
        duration=query["frame_duration_ms"],
        disposal=2,
        **kwargs,
    )
    ids = [s["metadata"]["product_id"] for s in sources]
    sidecar = {
        "format": "gif-v1",
        "display_resampling": "integer nearest-neighbor preview enlargement up to 8x; original grids retained in provenance",
        "display_frame_duration_ms": query["frame_duration_ms"],
        "physical_timing": "Actual UTC labels are retained; display duration is not physical elapsed time",
        "frames": [
            {
                "ref": sources[i]["ref"],
                "metadata": sources[i]["metadata"],
                "raw_sha256": sources[i]["raw"]["sha256"],
                "grid_sha256": sources[i]["planes"]["sha256"],
            }
            for i in order
        ],
        "stretch_limits_mjy_sr": limits,
        "credits": "NASA/IPAC IRSA / SPHEREx; QR3 doi:10.26131/IRSA662; QR2 doi:10.26131/IRSA652",
        "warnings": [
            "Display export only; no validated motion/variability measurement",
            "GIF quantizes colors; numeric science FITS are separate artifacts",
        ],
    }
    path = root / "export_provenance.json"
    path.write_text(json.dumps(sidecar, allow_nan=False), encoding="utf-8")
    return {
        "outcome": "ready",
        "frame_count": len(images),
        "animation": len(images) > 1,
        "gif_artifact_index": artifact(gif, "movie_gif", ids),
        "provenance_artifact_index": artifact(path, "export_provenance", ids),
        "warnings": sidecar["warnings"],
    }
