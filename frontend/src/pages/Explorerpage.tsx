import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Badge } from '../components/Badge';
import { Notice } from '../components/Notice';
import { StateMessage } from '../components/StateMessage';
import { Value } from '../components/Value';
import { observationProvider } from '../services/apiClients';
import type { Observation, ObservationSearch } from '../types/observations';

const INITIAL_SEARCH: ObservationSearch = {
  rightAscensionDeg: 83.2, declinationDeg: -5.4, startDate: '2025-02-01', endDate: '2025-04-01',
};

function SyntheticPreview({ record, zoom }: { record: Observation; zoom: number }) {
  return (
    <div className={`preview-art preview-${record.previewVariant}`} role="img" aria-label={`Synthetic preview for ${record.id}; not scientific data`}>
      <svg viewBox="0 0 600 320" aria-hidden="true" style={{ transform: `scale(${zoom})` }}>
        <defs>
          <radialGradient id={`glow-${record.previewVariant}`}><stop stopColor="currentColor" stopOpacity=".8" /><stop offset="1" stopColor="currentColor" stopOpacity="0" /></radialGradient>
        </defs>
        <circle cx="175" cy="142" r="92" fill={`url(#glow-${record.previewVariant})`} opacity=".5" />
        <circle cx="410" cy="188" r="112" fill={`url(#glow-${record.previewVariant})`} opacity=".35" />
        {[[88, 75], [122, 238], [218, 89], [275, 220], [330, 80], [488, 89], [530, 252], [380, 268], [68, 170], [315, 150], [445, 140]].map(([cx, cy], index) => (
          <circle key={index} cx={cx} cy={cy} r={index % 3 === 0 ? 2.3 : 1.3} fill="currentColor" opacity={index % 2 ? '.55' : '.85'} />
        ))}
      </svg>
      <span className="preview-watermark">Synthetic preview · not scientific data</span>
    </div>
  );
}

function formatDate(value: string | null, illustrative = false) {
  if (!value) return 'Not available';
  return `${value.replace('T', ' ').replace('Z', ' UTC')}${illustrative ? ' (illustrative)' : ''}`;
}

export function ExplorerPage() {
  const [form, setForm] = useState(INITIAL_SEARCH);
  const [records, setRecords] = useState<Observation[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [aId, setAId] = useState('');
  const [bId, setBId] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [zoomA, setZoomA] = useState(1);
  const [zoomB, setZoomB] = useState(1);
  const [validation, setValidation] = useState('');

  const load = async (search: ObservationSearch) => {
    setLoading(true); setError(''); setValidation('');
    try {
      const found = await observationProvider.searchObservations(search);
      setRecords(found);
      setSelectedIds(found.slice(0, 2).map((record) => record.id));
      setAId(found[0]?.id ?? ''); setBId(found[1]?.id ?? '');
    } catch (cause) {
      setRecords([]); setSelectedIds([]); setAId(''); setBId('');
      setError(cause instanceof Error ? cause.message : 'Observations could not be loaded.');
    } finally { setLoading(false); }
  };

  useEffect(() => { void load(INITIAL_SEARCH); }, []);

  const recordA = useMemo(() => records.find((record) => record.id === aId), [records, aId]);
  const recordB = useMemo(() => records.find((record) => record.id === bId), [records, bId]);
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!Number.isFinite(form.rightAscensionDeg) || form.rightAscensionDeg < 0 || form.rightAscensionDeg >= 360) {
      setValidation('Right ascension must be from 0° up to (but not including) 360°.'); return;
    }
    if (!Number.isFinite(form.declinationDeg) || form.declinationDeg < -90 || form.declinationDeg > 90) {
      setValidation('Declination must be between −90° and +90°.'); return;
    }
    if (form.startDate && form.endDate && form.startDate > form.endDate) {
      setValidation('The start date must be on or before the end date.'); return;
    }
    void load(form);
  };
  const toggleRecord = (id: string) => {
    setSelectedIds((current) => current.includes(id) ? current.filter((item) => item !== id) : current.length < 2 ? [...current, id] : [current[1], id]);
  };
  const useSelected = () => { setAId(selectedIds[0] ?? ''); setBId(selectedIds[1] ?? ''); };

  return (
    <div className="page-flow explorer-page">
      <section className="explorer-hero" aria-labelledby="explorer-title">
        <div>
          <p className="eyebrow">A SKY OBSERVATION WORKSPACE</p>
          <h1 id="explorer-title">Explore the same patch of sky over time.</h1>
          <p className="lead">Explore available observations of a selected sky region, compare image previews, and inspect the context behind each record.</p>
          <a className="button button-primary" href="#search">Find observations <span aria-hidden="true">↓</span></a>
        </div>
        <div className="hero-orbit" aria-hidden="true"><span /><span /><span /></div>
      </section>

      <section id="search" className="card section-card" aria-labelledby="search-title">
        <div className="section-heading"><div><p className="eyebrow">01 / SELECT A REGION</p><h2 id="search-title">Search sky coordinates</h2></div><Badge variant={observationProvider.mode === 'demo' ? 'demo' : 'status'}>{observationProvider.mode === 'demo' ? 'Synthetic demo search' : `${observationProvider.mode.toUpperCase()} source`}</Badge></div>
        <form className="search-form" onSubmit={submit}>
          <label>Right ascension <span>(degrees)</span><input type="number" step="any" min="0" max="359.999999" value={form.rightAscensionDeg} onChange={(e) => setForm({ ...form, rightAscensionDeg: e.target.value === '' ? NaN : Number(e.target.value) })} /></label>
          <label>Declination <span>(degrees)</span><input type="number" step="any" min="-90" max="90" value={Number.isNaN(form.declinationDeg) ? '' : form.declinationDeg} onChange={(e) => setForm({ ...form, declinationDeg: e.target.value === '' ? NaN : Number(e.target.value) })} /></label>
          <label>Start date<input type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} /></label>
          <label>End date<input type="date" value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} /></label>
          <button className="button button-primary search-submit" type="submit">Find observations</button>
        </form>
        <p className="form-help">{observationProvider.mode === 'demo' ? 'Coordinates and dates filter local synthetic fixtures. No backend request is made.' : 'The selected provider controls this search. No real-data provider is configured in this prototype.'}</p>
        {validation && <p className="form-error" role="alert">{validation}</p>}
      </section>

      <section className="section-block" aria-labelledby="results-title">
        <div className="section-heading"><div><p className="eyebrow">02 / AVAILABLE RECORDS</p><h2 id="results-title">Observation results</h2></div><span className="muted">{loading ? 'Loading…' : `${records.length} records`}</span></div>
        {loading ? <StateMessage kind="loading" title="Loading observation records">Checking the selected data source.</StateMessage>
          : error ? <StateMessage kind="error" title="Observation search unavailable">{error}</StateMessage>
            : records.length === 0 ? <StateMessage kind="empty" title="No records match this search">Try a different date range or coordinates. An empty result does not mean there are no astronomical objects in this region.</StateMessage>
              : <div className="results-layout">
                <div className="table-wrap"><table><thead><tr><th scope="col">Compare</th><th scope="col">Record / time</th><th scope="col">Band</th><th scope="col">Source status</th></tr></thead><tbody>{records.map((record) => <tr key={record.id}>
                  <td><input aria-label={`Select ${record.id} for comparison`} type="checkbox" checked={selectedIds.includes(record.id)} onChange={() => toggleRecord(record.id)} /></td>
                  <td><strong className="mono">{record.id}</strong><span className="table-sub">{formatDate(record.observedAt, record.synthetic)}</span></td>
                  <td>{record.band ?? 'Not available'}</td><td><Badge variant={record.synthetic ? 'demo' : 'source'}>{record.synthetic ? 'Synthetic demo' : record.sourceName}</Badge></td>
                </tr>)}</tbody></table></div>
                <div className="selection-aside"><p className="eyebrow">COMPARE TWO</p><p>Select up to two records using the checkboxes.</p><button className="button button-secondary" type="button" disabled={selectedIds.length !== 2} onClick={useSelected}>Use selected records</button><p className="tiny-note">Synthetic fixtures only. These are not retrieved observations.</p></div>
              </div>}
      </section>

      <section className="section-block" aria-labelledby="comparison-title">
        <div className="section-heading"><div><p className="eyebrow">03 / SIDE-BY-SIDE</p><h2 id="comparison-title">Image comparison</h2></div><Badge variant="demo">Demo comparison</Badge></div>
        <div className="compare-toolbar">
          <label>Observation A<select value={aId} onChange={(e) => setAId(e.target.value)}><option value="">Choose a record</option>{records.map((r) => <option key={r.id} value={r.id}>{r.id}</option>)}</select></label>
          <button className="button button-secondary" type="button" disabled={!recordA || !recordB} onClick={() => { setAId(bId); setBId(aId); }}>Swap A and B</button>
          <label>Observation B<select value={bId} onChange={(e) => setBId(e.target.value)}><option value="">Choose a record</option>{records.map((r) => <option key={r.id} value={r.id}>{r.id}</option>)}</select></label>
        </div>
        <div className="comparison-grid">
          {[{ label: 'Observation A', record: recordA, zoom: zoomA, setZoom: setZoomA }, { label: 'Observation B', record: recordB, zoom: zoomB, setZoom: setZoomB }].map((panel) => <article className="compare-panel" key={panel.label}>
            <div className="compare-panel-head"><div><p className="eyebrow">{panel.label}</p><h3>{panel.record?.id ?? 'No record selected'}</h3></div><Badge variant="demo">Synthetic</Badge></div>
            {panel.record?.synthetic ? <SyntheticPreview record={panel.record} zoom={panel.zoom} /> : panel.record?.imageUrl ? <div className="preview-art"><img className="real-preview" src={panel.record.imageUrl} alt={`Image for observation ${panel.record.id}`} style={{ transform: `scale(${panel.zoom})` }} /></div> : <div className="preview-empty">{panel.record ? 'Image preview not available for this record.' : 'Select an observation to view its preview.'}</div>}
            <div className="viewer-controls"><span>Preview scale</span><button type="button" aria-label={`Zoom out ${panel.label}`} disabled={!panel.record || panel.zoom <= 1} onClick={() => panel.setZoom(Math.max(1, panel.zoom - .2))}>−</button><button type="button" aria-label={`Fit ${panel.label} to panel`} disabled={!panel.record} onClick={() => panel.setZoom(1)}>Fit</button><button type="button" aria-label={`Zoom in ${panel.label}`} disabled={!panel.record || panel.zoom >= 1.6} onClick={() => panel.setZoom(Math.min(1.6, panel.zoom + .2))}>+</button></div>
          <dl className="value-list compact-values"><Value label="Observed" value={formatDate(panel.record?.observedAt ?? null, panel.record?.synthetic)} /><Value label="Band" value={panel.record?.band} /><Value label="Source" value={panel.record?.sourceName} /></dl>
          </article>)}
        </div>
        <Notice tone="warning" title="Interpret differences with care"><p>A visible difference between observations does not by itself prove motion. Wavelength, calibration, processing, noise, and other observational effects may contribute.</p></Notice>
      </section>

      <section className="section-block" aria-labelledby="details-title"><div className="section-heading"><div><p className="eyebrow">04 / TRACEABILITY</p><h2 id="details-title">Observation details</h2></div></div>
        <div className="details-grid">{[recordA, recordB].map((record, index) => <article className="card details-card" key={index}><p className="eyebrow">{index === 0 ? 'OBSERVATION A' : 'OBSERVATION B'}</p><h3>{record?.id ?? 'No record selected'}</h3><dl className="value-list">
          <Value label="Product / observation ID" value={record?.id} /><Value label="Observation time" value={record ? formatDate(record.observedAt, record.synthetic) : null} /><Value label="Time basis" value={record?.timeBasis} /><Value label="Wavelength / band" value={record?.wavelength ?? record?.band} /><Value label="Dataset version" value={record?.datasetVersion} /><Value label="Processing release" value={record?.processingRelease} /><Value label="Original source record" value={record?.sourceRecordUrl} /><Value label="Retrieval time" value={record?.retrievedAt} /><Value label="Rendering settings" value={record ? `${record.synthetic ? 'Synthetic illustration' : 'Image preview'} · scale ${index === 0 ? zoomA.toFixed(1) : zoomB.toFixed(1)}×` : null} />
        </dl></article>)}</div>
      </section>

      <section className="ml-status" aria-labelledby="ml-title"><div><p className="eyebrow">OPTIONAL FUTURE INTEGRATION</p><h2 id="ml-title">Model analysis</h2><p>ML analysis is not connected in this prototype. Any future model output will be shown separately from observation search and comparison.</p></div><span className="status-pill">Not connected</span></section>

      <nav className="page-next" aria-label="Explore more"><a href="#/learn">Learn how to read observations <span aria-hidden="true">→</span></a><a href="#/about">About &amp; Sources <span aria-hidden="true">→</span></a></nav>
    </div>
  );
}
