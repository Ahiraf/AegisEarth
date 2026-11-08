# Known-object candidate finder using IMCCE SkyBoT. Needs astroquery and network access to IMCCE.
import numpy as np
import astropy.units as u
from astropy.coordinates import SkyCoord
from astropy.time import Time


def _cone(ra, dec, mjd, radius_deg, location):
    from astroquery.imcce import Skybot
    try:
        t = Skybot.cone_search(SkyCoord(ra, dec, unit='deg'), radius_deg * u.deg,
                               Time(mjd, format='mjd'), location=location)
        return t.to_pandas()
    except Exception as e:
        if 'No solar system object' in str(e):
            return None
        raise


def _num(x):
    try:
        v = float(x)
        return int(v) if np.isfinite(v) and v > 0 else None
    except Exception:
        return None


def find_candidates(frames, radius_deg=0.18, location='500', min_frames=4):
    # frames: dicts with ra, dec (search centre, degrees; 0.18 deg covers a 15 arcmin cutout) and mjd (mid-exposure).
    # One SkyBoT query per frame (about 3 s each). Returns known objects seen in at least min_frames frames,
    # sorted by predicted magnitude, each with per-frame ra, dec (degrees), v_mag.
    seen = {}
    for f in sorted(frames, key=lambda d: d['mjd']):
        t = _cone(f['ra'], f['dec'], f['mjd'], radius_deg, location)
        if t is None or len(t) == 0:
            continue
        for _, r in t.iterrows():
            name = str(r['Name'])
            c = seen.setdefault(name, dict(name=name, number=_num(r['Number']) if 'Number' in t.columns else None,
                                           frames=[]))
            c['frames'].append(dict(mjd=float(f['mjd']), ra=float(r['RA']), dec=float(r['DEC']),
                                    v_mag=float(r['V'])))
    out = []
    for c in seen.values():
        if len(c['frames']) >= min_frames:
            c['v_mag'] = float(np.nanmedian([x['v_mag'] for x in c['frames']]))
            out.append(c)
    return sorted(out, key=lambda c: c['v_mag'])
