# AegisEarth candidate ranker v2: evidence builder + scorer. Needs only numpy and astropy.
import json, re, warnings
import numpy as np
from astropy.io import fits
from astropy.wcs import WCS
from astropy.coordinates import SkyCoord

R_AP, R_IN, R_OUT, W = 2.0, 5.0, 9.0, 11            # aperture, background annulus (pixels), window half-size
MIN_FRAMES, MAX_FRAMES = 4, 6
PIX_ARCSEC, LOW_MOTION_PX = 6.15, 4.0
INFO = {'MP_SOURCE', 'MP_FULLSAMPLE'}                 # informational flags: never rejected
GROUPS = {'cr': ['TRANSIENT', 'OVERFLOW'], 'outlier': ['OUTLIER'], 'persist': ['PERSIST'],
          'dichroic': ['DICHROIC'],
          'badpix': ['NONFUNC', 'MISSING_DATA', 'HOT', 'COLD', 'PHANMISS', 'NONLINEAR']}
SIGNED_LOG = ['track_snr', 'snr_wo_top', 'med_snr']
CUTOUT_META = ['bad_frac', 'noise_mad', 'persist_frac', 'cr_frac', 'outlier_frac', 'badpix_frac']


def flagdefs(header):
    d = {k: int(header[k]) for k in header if k.startswith('MP_')}
    for k in header:
        if re.fullmatch(r'MSKN\d{4}', k):
            d['MP_' + str(header[k])] = int(header['MSKM' + k[4:]]).bit_length() - 1
    return d


def masks(fl, header):
    d = flagdefs(header); fl = fl.astype(np.uint64)
    bad = (fl & np.uint64(sum(1 << b for k, b in d.items() if k not in INFO))) != 0
    src = ((fl >> np.uint64(d['MP_SOURCE'])) & np.uint64(1)).astype(bool)
    core = (fl & np.uint64(sum(1 << b for k, b in d.items() if k not in INFO and k != 'MP_OUTLIER'))) != 0
    if 'MP_OUTLIER' in d:
        outl = ((fl >> np.uint64(d['MP_OUTLIER'])) & np.uint64(1)).astype(bool)
    else:
        outl = np.zeros(fl.shape, bool)
    grp = {}
    for g, names in GROUPS.items():
        m = sum(1 << d['MP_' + n] for n in names if 'MP_' + n in d)
        grp[g + '_frac'] = float(((fl & np.uint64(m)) != 0).mean()) if m else 0.0
    return bad, core, outl, src, grp


def _meas(im, var, bcore, bfull, outl, src, x, y):
    x0, y0 = int(round(x)), int(round(y)); ny, nx = im.shape
    xa, xb, ya, yb = x0 - W, x0 + W + 1, y0 - W, y0 + W + 1
    if xa < 0 or ya < 0 or xb > nx or yb > ny:
        return None
    I, V, BC, BF, O, S = (a[ya:yb, xa:xb] for a in (im, var, bcore, bfull, outl, src))
    yy, xx = np.mgrid[ya:yb, xa:xb]; d2 = (xx - x) ** 2 + (yy - y) ** 2
    ap = d2 <= R_AP ** 2
    an = (d2 >= R_IN ** 2) & (d2 <= R_OUT ** 2) & ~BF & np.isfinite(I)      # background excludes every flagged pixel
    ok = ap & ~BC & np.isfinite(I) & np.isfinite(V) & (V > 0)                # aperture tolerates OUTLIER pixels
    if an.sum() < 30 or ok.sum() < 0.6 * ap.sum():
        return None
    bkg = np.median(I[an]); sky = 1.4826 * np.median(np.abs(I[an] - bkg)); k = ap.sum() / ok.sum()
    flux = (I[ok] - bkg).sum() * k
    noise = np.hypot(np.sqrt(V[ok].sum() * k), sky * np.sqrt(ap.sum()))
    return float(flux), float(noise), bool(S[ap].any()), float(O[ap].mean())


def analyze_frame(path, ra, dec, shift=(0.0, 0.0)):
    # shift (pixels) is only used to build displaced control tracks for testing; production uses (0, 0)
    with fits.open(path, memmap=False) as h:
        im = h['IMAGE'].data.astype(float); var = h['VARIANCE'].data.astype(float)
        fl = h['FLAGS'].data; fh = h['FLAGS'].header
        hd = h['IMAGE'].header; wcs = WCS(hd)
    bad, core, outl, src, grp = masks(fl, fh)
    ny, nx = im.shape
    out = dict(path=path, dqa=hd.get('L2DQAFLG'), finast=hd.get('FINAST'),
               coverage=float(np.isfinite(im).mean()), bad_frac=float(bad.mean()), src_frac=float(src.mean()))
    ok = ~bad & ~src & np.isfinite(im) & np.isfinite(var) & (var > 0)
    if ok.sum() > 100:
        r = im[ok]; med = np.median(r); out['noise_mad'] = float(1.4826 * np.median(np.abs(r - med)))
    else:
        out['noise_mad'] = float('nan')
    out.update(grp)
    out['qc_pass'] = bool(out['dqa'] == 'Pass' and out['finast'] == 0 and out['bad_frac'] <= 0.25
                          and out['src_frac'] <= 0.90 and out['coverage'] >= 0.90)
    x, y = wcs.world_to_pixel(SkyCoord(ra, dec, unit='deg'))
    out['inside'] = bool(np.isfinite(x) and np.isfinite(y) and 12 <= x <= nx - 13 and 12 <= y <= ny - 13)
    out['meas'] = _meas(im, var, core, bad, outl, src, x + shift[0], y + shift[1]) if out['inside'] else None
    return out


def track_features(frames):
    flux = np.array([f['meas'][0] for f in frames]); noise = np.array([f['meas'][1] for f in frames])
    s = flux / noise; top = int(np.argmax(s)); rest = np.delete(np.arange(len(s)), top)
    pos = np.clip(s, 0, None); outap = np.array([f['meas'][3] for f in frames])
    feat = dict(n=len(frames), track_snr=float(flux.sum() / np.sqrt((noise ** 2).sum())),
                snr_wo_top=float(flux[rest].sum() / np.sqrt((noise[rest] ** 2).sum())),
                med_snr=float(np.median(s)), frac_gt3=float((s > 3).mean()),
                top_share=float(pos.max() / (pos.sum() + 1e-9)),
                outlier_ap=float(outap.mean()), outlier_frames=float((outap > 0).mean()))
    with warnings.catch_warnings():
        warnings.simplefilter('ignore')
        for c in CUTOUT_META:
            feat['m_' + c] = float(np.nanmean([f[c] for f in frames]))
    feat['src_frac_ap'] = float(np.mean([f['meas'][2] for f in frames]))      # warning only, not a model feature
    for c in SIGNED_LOG:
        feat[c + '_l'] = float(np.sign(feat[c]) * np.log1p(abs(feat[c])))
    return feat


def load_model(path):
    return json.load(open(path))


def score(feat, model):
    x = []
    for k in model['features']:
        v = feat.get(k)
        x.append(model['fill'][k] if v is None or not np.isfinite(v) else v)
    z = (np.array(x, float) - np.array(model['mean'])) / np.array(model['scale'])
    p = 1 / (1 + np.exp(-(np.array(model['coefs']) @ z + np.array(model['intercepts']))))
    return float(p.mean()), float(p.std())


def spread(items, k=MAX_FRAMES):
    if len(items) <= k:
        return list(items)
    ix = np.unique(np.linspace(0, len(items) - 1, k).round().astype(int))
    return [items[i] for i in ix]


def rank(frames, model, shift=(0.0, 0.0), select=True, v_mag=None, version=None):
    # frames: list of dicts with path, ra, dec (degrees) and mjd, ideally 6-12 frames spread across ONE visit.
    # select=True keeps up to 6 usable frames spread evenly across the visit (the rule used in training);
    # select=False uses the frames as given (first 6). v_mag (predicted V) and version (e.g. 'l2b-v27') are optional.
    warns, used = [], []
    for f in sorted(frames, key=lambda d: d.get('mjd') or 0.0):
        a = analyze_frame(f['path'], f['ra'], f['dec'], shift)
        if not a['qc_pass']:
            warns.append('FRAME_FAILED_QC')
        elif not a['inside']:
            warns.append('POSITION_NEAR_EDGE_OR_OUTSIDE')
        elif a['meas'] is None:
            warns.append('APERTURE_UNMEASURABLE')
        else:
            used.append(dict(frame=f, a=a))
    res = dict(score=None, uncertainty=None, score_kind='candidate_score',
               model_version_id=model.get('version', 'unknown'), classification_hint='uncertain',
               explanation_codes=[], warnings=[], evidence=None, n_frames_used=len(used), frames_used=[],
               displacement_arcsec=None, span_hours=None, meets_5pct_threshold=False, meets_10pct_threshold=False)
    if len(used) < MIN_FRAMES:
        res['warnings'] = sorted(set(warns + ['TOO_FEW_USABLE_FRAMES']))
        return res
    if select:
        sel = spread(used)
    else:
        sel = used[:MAX_FRAMES]
        if len(used) > MAX_FRAMES:
            warns.append('EXTRA_FRAMES_IGNORED')
    feat = track_features([x['a'] for x in sel])
    s, u = score(feat, model)
    f0, f1 = sel[0]['frame'], sel[-1]['frame']
    disp = float(SkyCoord(f0['ra'], f0['dec'], unit='deg').separation(SkyCoord(f1['ra'], f1['dec'], unit='deg')).arcsec)
    mj = [x['frame'].get('mjd') for x in sel]
    span_h = float((max(mj) - min(mj)) * 24) if all(m is not None for m in mj) else None
    codes = []
    if feat['snr_wo_top'] >= 3: codes.append('CONSISTENT_ACROSS_FRAMES')
    elif feat['track_snr'] >= 3: codes.append('SINGLE_FRAME_DOMINATES')
    else: codes.append('LOW_TRACK_SNR')
    if feat['outlier_frames'] >= 0.5: codes.append('PIPELINE_OUTLIER_FLAG_AT_POSITION')
    if feat['src_frac_ap'] >= 0.99: warns.append('APERTURE_ON_CATALOG_SOURCE')       # every frame overlaps a catalogued source
    if disp / PIX_ARCSEC < LOW_MOTION_PX: warns.append('LOW_MOTION')
    t5, t10 = model.get('threshold_5pct'), model.get('threshold_10pct')
    hint = 'possible_motion' if (t5 is not None and s >= t5) else 'uncertain'
    vr = model.get('v_range')
    if v_mag is not None and vr:
        if v_mag > vr[1]:
            warns.append('PREDICTED_FAINTER_THAN_TRAINING_RANGE'); hint = 'uncertain'
        elif v_mag < vr[0]:
            warns.append('PREDICTED_BRIGHTER_THAN_TRAINING_RANGE')
    if version and version in model.get('limited_versions', []):
        warns.append('LIMITED_VALIDATION_FOR_PROCESSING_VERSION')
    res.update(score=s, uncertainty=u, classification_hint=hint, explanation_codes=codes,
               warnings=sorted(set(warns)), evidence=feat, frames_used=[x['frame']['path'] for x in sel],
               displacement_arcsec=disp, span_hours=span_h,
               meets_5pct_threshold=bool(t5 is not None and s >= t5),
               meets_10pct_threshold=bool(t10 is not None and s >= t10))
    return res
