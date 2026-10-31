"""Sky-fixed north-up TAN sampling. Variance uses squared interpolation coefficients."""

import numpy as np
from astropy.wcs import WCS


def make_grid(region, pixel_scale_arcsec=6.15):
    nx = int(np.ceil(region["width_arcmin"] * 60 / pixel_scale_arcsec))
    ny = int(np.ceil(region["height_arcmin"] * 60 / pixel_scale_arcsec))
    if not (1 <= nx <= 512 and 1 <= ny <= 512):
        raise ValueError("Output grid exceeds bounds")
    wcs = WCS(naxis=2)
    wcs.wcs.crval = [region["ra_deg"], region["dec_deg"]]
    wcs.wcs.crpix = [(nx + 1) / 2, (ny + 1) / 2]
    scales = 2 * np.rad2deg(
        np.tan(np.deg2rad([region["width_arcmin"], region["height_arcmin"]]) / 120)
    )
    wcs.wcs.cdelt = [-scales[0] / nx, scales[1] / ny]
    wcs.wcs.ctype = ["RA---TAN", "DEC--TAN"]
    wcs.wcs.radesys = "ICRS"
    return wcs, (ny, nx)


def sample_bilinear(science, variance, valid, x, y, extras=()):
    ny, nx = science.shape
    finite = np.isfinite(x) & np.isfinite(y)
    xx = np.where(finite, x, 0)
    yy = np.where(finite, y, 0)
    ix = np.floor(xx).astype(int)
    iy = np.floor(yy).astype(int)
    fx = xx - ix
    fy = yy - iy
    result = np.zeros(x.shape)
    noise = np.zeros(x.shape)
    support = finite.copy()
    other = [np.zeros(x.shape) for _ in extras]
    for dx, dy, weight in (
        (0, 0, (1 - fx) * (1 - fy)),
        (1, 0, fx * (1 - fy)),
        (0, 1, (1 - fx) * fy),
        (1, 1, fx * fy),
    ):
        needed = weight > 1e-10
        inside = (ix + dx >= 0) & (ix + dx < nx) & (iy + dy >= 0) & (iy + dy < ny)
        sx = (ix + dx).clip(0, nx - 1)
        sy = (iy + dy).clip(0, ny - 1)
        good = inside & valid[sy, sx]
        support &= (~needed) | good
        result += weight * np.where(good, science[sy, sx], 0)
        noise += weight**2 * np.where(good, variance[sy, sx], 0)
        for target, source in zip(other, extras, strict=True):
            target += weight * np.where(good, source[sy, sx], 0)
    support &= np.isfinite(result) & np.isfinite(noise) & (noise > 0)
    return [np.where(support, a, np.nan) for a in (result, noise, *other)], support


def reproject(native, target_wcs, shape, offset=(0, 0)):
    yy, xx = np.indices(shape)
    ra, dec = target_wcs.pixel_to_world_values(xx + offset[0], yy + offset[1])
    x, y = native.wcs.world_to_pixel_values(ra, dec)
    arrays, valid = sample_bilinear(
        native.science, native.variance, native.valid, x, y, (native.wavelength, native.bandwidth)
    )
    return {
        "science": arrays[0],
        "variance": arrays[1],
        "wavelength": arrays[2],
        "bandwidth": arrays[3],
        "valid": valid,
    }
