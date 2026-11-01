import numpy as np
from astropy.io import fits


def output_fits(path, frame, grid, ids, kind, unit="MJy/sr"):
    header = fits.Header.fromstring(grid["header"], sep="\n")
    header["BUNIT"] = unit
    header["METHOD"] = kind
    hdus = [
        fits.PrimaryHDU(),
        fits.ImageHDU(frame["science"].astype(np.float32), header, name="SCIENCE"),
    ]
    for key in (
        "variance",
        "valid",
        "count",
        "coverage",
        "wavelength",
        "bandwidth",
        "wavelength_min",
        "wavelength_max",
        "weights",
        "exposure",
    ):
        if key not in frame:
            continue
        a = np.asarray(frame[key])
        h = header.copy()
        h["BUNIT"] = (
            "(MJy/sr)^2"
            if key == "variance"
            else "um"
            if key in ("wavelength", "bandwidth", "wavelength_min", "wavelength_max")
            else "s"
            if key == "exposure"
            else ""
        )
        if a.ndim != 2:
            h = fits.Header(
                {
                    "BUNIT": "",
                    "COMMENT": "Axis 3 follows CONTRIBUTOR input ordering; spatial WCS is in SCIENCE",
                }
            )
        hdus.append(
            fits.ImageHDU(a.astype(np.uint8 if key == "valid" else np.float32), h, name=key.upper())
        )
    hdus.append(
        fits.BinTableHDU.from_columns(
            [fits.Column(name="PRODUCT_ID", format="64A", array=ids)], name="CONTRIBUTORS"
        )
    )
    fits.HDUList(hdus).writeto(path, checksum=True)
