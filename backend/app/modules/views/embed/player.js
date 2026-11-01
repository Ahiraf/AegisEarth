/* Backend reference embed; production React may consume the same REST contracts. */
const $=id=>document.getElementById(id), base='/api/v1/views/'+document.body.dataset.view, mode=document.body.dataset.mode;
let frames=[], index=0, timer=null, generation=0;
const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
$('motion').textContent=reduced?'Reduced motion: starts paused; manual stepping is available.':'Playback starts paused. Display speed does not represent elapsed physical time.';
async function get(url){const r=await fetch(url);if(r.status===202)throw new Error('View preparation is pending; reopen after processing finishes.');if(!r.ok)throw new Error(r.status===410?'Saved view expired; reopen its coordinate link.':'Data unavailable ('+r.status+').');return r.json();}
function pause(){clearInterval(timer);timer=null;$('play').textContent='Play';}
function show(){if(!frames.length)return;const f=frames[index];$('sky').src=f.preview.url;$('sky').alt='SPHEREx '+f.time.label_utc+' '+f.spectral.detectors.join(', ');$('label').textContent=`Frame ${index+1}/${frames.length} · ${f.time.label_utc} · ${f.spectral.detectors.join(', ')} · ${f.spectral.unit}`;$('scrub').value=index;$('warnings').textContent=f.warnings.join(' ');context();}
function step(n){index=(index+n+frames.length)%frames.length;show();}
$('prev').onclick=()=>{pause();step(-1);};$('next').onclick=()=>{pause();step(1);};
$('scrub').oninput=e=>{pause();index=+e.target.value;show();};
$('play').onclick=()=>{if(timer){pause();return;}if(frames.length<2)return;timer=setInterval(()=>step(1),+$('speed').value);$('play').textContent='Pause';};
$('speed').onchange=()=>{if(timer){pause();$('play').click();}};
document.querySelector('section').onkeydown=e=>{if(e.target!==e.currentTarget)return;if(e.key==='ArrowRight'){e.preventDefault();pause();step(1);}if(e.key==='ArrowLeft'){e.preventDefault();pause();step(-1);}if(e.key===' '){e.preventDefault();$('play').click();}};
$('opacity').oninput=e=>$('wise').style.opacity=e.target.value;
for(const id of ['gaia','catalog','band'])$(id).onchange=context;
async function context(){const token=++generation, ordinal=index;const errors=[];$('markers').replaceChildren();$('wise').style.display='none';
 const f=frames[index];if(!f)return;const [h,w]=f.spatial.shape;$('stage').style.aspectRatio=w+'/'+h;$('markers').setAttribute('viewBox',`0 0 ${w} ${h}`);
 const jobs=[['gaia','gaia','#7bf3ff'],['catalog','wise','#ffd578']].filter(([id])=>$(id).checked).map(async([,survey,color])=>{try{const data=await get(base+`/overlays/catalogs?survey=${survey}&mode=${mode}&ordinal=${ordinal}`);if(token!==generation)return;for(const m of data.markers.filter(m=>m.pixel.inside)){const circle=document.createElementNS('http://www.w3.org/2000/svg','circle');circle.setAttribute('cx',m.pixel.x_png);circle.setAttribute('cy',m.pixel.y_png);circle.setAttribute('r',Math.max(0.5,w/90));circle.setAttribute('fill','none');circle.setAttribute('stroke',color);circle.setAttribute('stroke-width',Math.max(.15,w/400));const title=document.createElementNS('http://www.w3.org/2000/svg','title');title.textContent=m.survey+' '+m.id+' '+m.position_status;circle.append(title);$('markers').append(circle);}if(data.truncated)errors.push(survey+' results truncated.');}catch(e){errors.push(survey+': '+e.message);}});
 if($('band').value)jobs.push((async()=>{try{const data=await get(base+`/overlays/wise/${$('band').value}?mode=${mode}&ordinal=${ordinal}`);if(token!==generation)return;$('wise').src=data.png_url;$('wise').style.opacity=$('opacity').value;$('wise').style.display='block';errors.push(`AllWISE ${data.band}: ${data.source.date_obs1} to ${data.source.date_obs2}; independent display stretch.`);}catch(e){errors.push('WISE image: '+e.message);}})());
 await Promise.all(jobs);if(token===generation)$('context').textContent=errors.join(' ')||'Gaia cyan · AllWISE yellow. Optional layers do not alter movie frames.';
}
(async()=>{try{const manifest=await get(base+'/manifest');const page=await get(base+'/frames?mode='+mode+'&limit=12');frames=page.items;$('status').textContent=manifest.outcome+' · '+frames.length+' frame(s)';$('scrub').max=Math.max(0,frames.length-1);for(const id of ['prev','next','play','scrub'])$(id).disabled=frames.length<2;$('metadata').href=base+'/export-metadata';show();}catch(e){$('status').textContent=e.message;for(const id of ['prev','next','play'])$(id).disabled=true;}})();
