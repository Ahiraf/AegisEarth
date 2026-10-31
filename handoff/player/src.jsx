import React, {useEffect, useRef, useState} from 'react';
import {createRoot} from 'react-dom/client';
import './style.css';

function Player() {
  const params = new URLSearchParams(location.search);
  const [api, setApi] = useState(params.get('api') || 'http://127.0.0.1:18000');
  const [viewId, setViewId] = useState(params.get('view') || '');
  const [manifest, setManifest] = useState(null), [frames, setFrames] = useState([]);
  const [index, setIndex] = useState(0), [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1), [loop, setLoop] = useState(false);
  const [layout, setLayout] = useState('sequence'), [mode, setMode] = useState('common');
  const [message, setMessage] = useState('Enter coordinates or load a prepared view.'), [error, setError] = useState('');
  const [widget, setWidget] = useState('Not loaded. The image player works independently.');
  const [previewLoaded, setPreviewLoaded] = useState(false);
  const [reload, setReload] = useState(0);
  const [reduced, setReduced] = useState(matchMedia('(prefers-reduced-motion: reduce)').matches);
  const widgetRef = useRef(null), generation = useRef(0);
  const absolute = path => new URL(path, api).href;
  const fetchJSON = async (path, signal) => {
    const r = await fetch(absolute(path), {credentials: 'include', signal});
    if (!r.ok) {
      const body=await r.json().catch(()=>({})); const detail=body.detail||{};
      throw new Error(`API ${r.status}: ${detail.code||'request_failed'}${detail.status?' ('+detail.status+')':''}`);
    }
    return {response: r, data: await r.json()};
  };
  useEffect(() => {
    const mq = matchMedia('(prefers-reduced-motion: reduce)');
    const change = () => {setReduced(mq.matches); setPlaying(false);};
    const hidden = () => {if (document.hidden) setPlaying(false);};
    mq.addEventListener('change', change); document.addEventListener('visibilitychange', hidden);
    return () => {mq.removeEventListener('change', change); document.removeEventListener('visibilitychange', hidden);};
  }, []);
  useEffect(() => {
    if (!viewId) return;
    const abort = new AbortController();
    const current = ++generation.current;
    setFrames([]); setManifest(null); setIndex(0); setPlaying(false); setError(''); setWidget('Not loaded.'); setPreviewLoaded(false); setMessage('Loading view…');
    let timer;
    async function load() {
      try {
        const {response, data} = await fetchJSON(`/api/v1/views/${viewId}/manifest`, abort.signal);
        if (current !== generation.current) return;
        if (response.status === 202) {setMessage('Preparing images…'); timer = setTimeout(load, 2000); return;}
        setManifest(data); setMessage(data.timelines[mode].outcome);
        const first = data.timelines[mode].first_frame;
        if (first) setFrames([first]); // show the small cached preview before loading all metadata
        let next = data.timelines[mode].frames_url + '&limit=4';
        let loaded = [];
        while (next && !abort.signal.aborted) {
          const {data: page} = await fetchJSON(next, abort.signal);
          if (page.manifest_sha256 !== data.manifest_sha256) throw new Error('Manifest changed; reload the view.');
          loaded = loaded.concat(page.items); setFrames([...loaded]); next = page.next_page;
        }
      } catch (e) {if (!abort.signal.aborted) {setError(e.message); setMessage('View loading failed. Retry or submit a new search.');}}
    }
    load();
    return () => {abort.abort(); clearTimeout(timer);};
  }, [viewId, api, mode, reload]);
  const frame = frames[index];
  useEffect(() => {
    if (!previewLoaded) return;
    let canceled = false; let image;
    async function preload() {
      for (const f of frames.slice(index+1,index+3)) {
        if (canceled) return;
        image = new Image(); image.crossOrigin = 'anonymous'; image.src = absolute(f.preview.url);
        try {await image.decode();} catch { /* preloads are best effort; visible images retry */ }
      }
    }
    preload(); return () => {canceled = true; if(image) image.src='';};
  }, [previewLoaded, index, frames.length, viewId, mode, api]);
  const ready = manifest?.timelines[mode].outcome === 'ready_for_animation' && frames.length === manifest.timelines[mode].frame_count;
  useEffect(() => {
    if (!playing || !ready) return;
    const timer = setInterval(() => setIndex(i => {
      if (layout === 'blink') return i === 0 ? 1 : 0;
      if (i + 1 < frames.length) return i + 1;
      if (loop) return 0;
      setPlaying(false); return i;
    }), 700 / speed);
    return () => clearInterval(timer);
  }, [playing, ready, speed, loop, frames.length, layout]);
  function step(delta) {setPlaying(false); setIndex(i => Math.max(0, Math.min(frames.length-1, i+delta)));}
  function keyboard(e) {
    if (['INPUT','SELECT','BUTTON','TEXTAREA'].includes(e.target.tagName)) return;
    if (e.key === 'ArrowRight') {e.preventDefault(); step(1);}
    if (e.key === 'ArrowLeft') {e.preventDefault(); step(-1);}
    if (e.code === 'Space' && ready) {e.preventDefault(); setPlaying(p => !p);}
  }
  async function submit(e) {
    e.preventDefault(); setError(''); setMessage('Searching and queueing…');
    const f = new FormData(e.currentTarget);
    try {
      await fetchJSON('/api/v1/views/session');
      const r = await fetch(absolute('/api/v1/views'), {method:'POST', credentials:'include',
        headers:{'Content-Type':'application/json','Idempotency-Key':crypto.randomUUID()},
        body:JSON.stringify({contract_version:'view-v2', region:{ra:Number(f.get('ra')),dec:Number(f.get('dec')),width_arcmin:Number(f.get('fov')),height_arcmin:Number(f.get('fov'))},collections:['spherex_qr3'],max_frames:3,preparation:{spectral_mode:'common_available'}})});
      if (!r.ok) throw new Error(`Submission ${r.status}`);
      const accepted = await r.json(); setViewId(accepted.id); setReload(n=>n+1);
      history.replaceState(null,'',`?view=${encodeURIComponent(accepted.id)}&api=${encodeURIComponent(api)}`);
    } catch (e) {setError(e.message);}
  }
  async function loadAladin() {
    setWidget('Loading Aladin Lite 3.8.1…');
    const current = generation.current;
    const bounded = promise => new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>reject(new Error('Sky-map loading timed out')),20000);
      Promise.resolve(promise).then(value=>{clearTimeout(timer);resolve(value);},e=>{clearTimeout(timer);reject(e);});
    });
    try {
      if (!frame?.science_image_url) throw new Error('Choose a common-grid science frame.');
      const {default: A} = await bounded(import('aladin-lite')); await bounded(A.init);
      if(current!==generation.current) return;
      widgetRef.current.replaceChildren();
      const region = manifest.request.region;
      const ra = region.ra_deg, dec = region.dec_deg;
      // Empty survey list avoids a mandatory unrelated DSS network dependency.
      const sky = A.aladin(widgetRef.current, {survey:[], hipsList:[], target:`${ra} ${dec}`, fov:region.width_arcmin/60, cooFrame:'equatorial', showReticle:true});
      const catalog = A.catalog({name:'Requested field center — not a detection', sourceSize:12, color:'#ffb347'});
      catalog.addSources([A.source(ra,dec,{label:'Requested field center — not a detection'})]); sky.addCatalog(catalog);
      await bounded(new Promise((resolve,reject) => sky.displayFITS(absolute(frame.science_image_url), {}, () => resolve(), () => reject(new Error('FITS/CORS load failed')))));
      if(current!==generation.current) return;
      const xy = sky.world2pix(ra,dec);
      if (!xy) throw new Error('Aladin projection unavailable');
      const back = sky.pix2world(xy[0],xy[1]);
      if (!back) throw new Error('Aladin inverse projection unavailable');
      const delta = Math.max(Math.abs(((back[0]-ra+540)%360)-180),Math.abs(back[1]-dec));
      if (delta > 1e-6) throw new Error('Sky/pixel round trip outside tolerance');
      setWidget(`FITS + field-center catalog loaded. Epoch ${frame.time.label_utc}. ICRS round-trip error ${delta.toExponential(2)} degrees.`);
    } catch (e) {if(current===generation.current) setWidget(`Sky map unavailable: ${e.message}. Continue with the image player.`);}
  }
  const image = f => <img key={f.id} crossOrigin="anonymous" src={absolute(f.preview.url)} alt={`SPHEREx ${f.time.label_utc}; ${f.spectral.detectors.join(', ')}; ${mode} preview`}
    onLoad={()=>setPreviewLoaded(true)} onError={e=>{
      const img=e.currentTarget; const retries=Number(img.dataset.retries||0); const current=generation.current;
      if(retries<3) {img.dataset.retries=String(retries+1);setTimeout(()=>{if(img.isConnected&&current===generation.current) img.src=absolute(f.preview.url)+`?retry=${retries+1}`;},(retries+1)*1000);}
      else setError('Preview unavailable or expired; reload the view.');
    }}/>;
  return <main>
    <h1>Cosmic Motion AI</h1><p>Backend handoff reference player · real SPHEREx images · no ML package required.</p>
    <label>API URL <input aria-label="API URL" value={api} onChange={e=>setApi(e.target.value)}/></label>
    <form onSubmit={submit}><label>RA (degrees)<input name="ra" type="number" step="any" min="0" max="359.999999" defaultValue="269.45" required/></label>
      <label>Dec (degrees)<input name="dec" type="number" step="any" min="-90" max="90" defaultValue="4.76" required/></label>
      <label>FOV (arcmin)<input name="fov" type="number" step="any" min="1" max="20" defaultValue="3" required/></label><button>Find chronological images</button></form>
    <form onSubmit={e=>{e.preventDefault();setViewId(new FormData(e.currentTarget).get('id'));setReload(n=>n+1);}}><label>Prepared view UUID <input name="id" defaultValue={viewId} required/></label><button>Load view</button></form>
    <p role="status" data-testid="outcome">{message}</p>{error && <p role="alert">{error}</p>}
    <section aria-label="Image player" tabIndex="0" onKeyDown={keyboard}>
      <label>Timeline <select aria-label="Timeline" value={mode} onChange={e=>setMode(e.target.value)}><option value="common">Sky-fixed common grid</option><option value="native">Native inspection — varying orientation</option></select></label>
      {reduced && <p>Reduced motion: playback starts paused. Use steps or deliberately select Play.</p>}
      <div className="controls"><button disabled={!ready} onClick={()=>setPlaying(p=>!p)}>{playing?'Pause':'Play'}</button>
        <button disabled={!index} onClick={()=>step(-1)}>Previous</button><button disabled={index>=frames.length-1} onClick={()=>step(1)}>Next</button>
        <label>Loop<input type="checkbox" checked={loop} disabled={!ready} onChange={e=>setLoop(e.target.checked)}/></label>
        <label>Display speed<select aria-label="Display speed" value={speed} disabled={!ready} onChange={e=>setSpeed(Number(e.target.value))}>{[0.5,1,2,4].map(s=><option key={s} value={s}>{s}×</option>)}</select></label>
        <label>Display<select aria-label="Display" value={layout} onChange={e=>{setPlaying(false);setIndex(0);setLayout(e.target.value);}}><option value="sequence">Sequence</option><option value="blink" disabled={!ready}>Blink first two epochs</option><option value="side">Side by side</option></select></label></div>
      <label>Frame<input aria-label="Frame" type="range" min="0" max={Math.max(0,frames.length-1)} value={index} disabled={!frames.length} onChange={e=>{setPlaying(false);setIndex(Number(e.target.value));}}/></label>
      <p>Display interval: {(700/speed).toFixed(0)} ms/frame. Physical time is shown below; playback speed does not change observation times.</p>
      {frame ? <><p data-testid="frame-label">Frame {index+1}/{frames.length} · {frame.time.label_utc}</p>
        <div className={layout==='side'?'images side':'images'}>{image(frame)}{layout==='side'&&frames.length>1&&<figure>{image(frames[index===0?1:0])}<figcaption>{frames[index===0?1:0].time.label_utc}</figcaption></figure>}</div>
        <p>Physical elapsed: {frame.time.elapsed_seconds.toFixed(3)} s · gap from preceding exposure: {frame.time.gap_seconds.toFixed(3)} s · overlap: {frame.time.overlap_seconds.toFixed(3)} s.</p>
        <p>UTC interval: {frame.time.start_utc} – {frame.time.end_utc}. Units: {frame.spectral.unit}. Detector: {frame.spectral.detectors.join(', ')}. Stretch: {frame.stretch.mode}.</p>
        <p>Scientific comparison supported: {String(frame.quality.comparison_supported)}. Coverage: {frame.quality.contributors.map(c=>(100*c.common_grid_usable_fraction).toFixed(1)+'%').join(', ')}.</p>
        <ul>{[...new Set([...frame.warnings,...(manifest?.warnings||[])])].map(w=><li key={w}>{w}</li>)}</ul>
        <details><summary>WCS, band, flags and provenance</summary><pre>{JSON.stringify({time:frame.time,spatial:frame.spatial,spectral:frame.spectral,stretch:frame.stretch,quality:frame.quality},null,2)}</pre>
          <ul>{frame.original_inputs.map(s=><li key={s.artifact_id}>{s.product_id} · {s.release} · <a href={absolute(s.url)}>Original FITS</a> · {s.source_url&&<a href={s.source_url}>IRSA source</a>}</li>)}</ul></details>
        <button onClick={loadAladin} disabled={!frame.science_image_url || widget.startsWith('Loading')}>Load this frame in Aladin</button></> : <p>{manifest?.timelines[mode].outcome==='no_data'?'No usable image in this timeline. Inspect coverage and try another region/date/band.':'Images are unavailable while the view is pending or failed.'}</p>}
      <p data-testid="aladin-status">{widget}</p><div ref={widgetRef} className="aladin-map"/>
      <p>Keyboard: focus this player, Space play/pause, Left/Right step. Leaving the tab pauses playback.</p>
    </section><footer>Images: NASA/SPHEREx, IPAC/IRSA. Optional sky map: Aladin Lite / CDS. This reference is separate from the production frontend.</footer>
  </main>;
}
createRoot(document.getElementById('root')).render(<Player/>);
