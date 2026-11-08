import json, sys, os
here = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(here, '..'))
import aegis_ranker.features as AF
model = AF.load_model(sys.argv[1])
cases = json.load(open(os.path.join(here, 'cases.json'))); tol = cases['tolerance']['abs']; ok_all = True
for c in cases['cases']:
    frames = [dict(path=os.path.join(here, f['file']), ra=f['ra'], dec=f['dec'], mjd=f.get('mjd')) for f in c['frames']]
    kw = c['kwargs']
    got = AF.rank(frames, model, shift=tuple(kw['shift']), select=kw['select'], v_mag=kw['v_mag'], version=kw['version'])
    exp = c['expected']; errs = []
    if (got['score'] is None) != (exp['score'] is None): errs.append('scored/unscored mismatch')
    elif got['score'] is not None:
        for k in ('score', 'uncertainty', 'displacement_arcsec'):
            if abs(got[k] - exp[k]) > tol: errs.append(k + ' differs')
        for k, v in exp['evidence'].items():
            if v is not None and abs(got['evidence'][k] - v) > tol: errs.append('evidence ' + k + ' differs')
        if [os.path.basename(p) for p in got['frames_used']] != exp['frames_used']: errs.append('frames_used differ')
    for k in ('warnings', 'explanation_codes'):
        if sorted(got[k]) != sorted(exp[k]): errs.append(k + ' differ')
    if got['classification_hint'] != exp['classification_hint']: errs.append('classification_hint differs')
    print(c['name'], 'OK' if not errs else 'FAILED: ' + '; '.join(errs)); ok_all = ok_all and not errs
sys.exit(0 if ok_all else 1)
