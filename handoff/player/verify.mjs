// Local real-data integration proof. Fault/empty/single cases below are explicitly simulated UI tests.
import {chromium, expect} from '@playwright/test';
import {readFile, mkdir, writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';

const root = new URL('../../', import.meta.url);
const evidenceDir = new URL('var/movie-player/', root);
await mkdir(evidenceDir, {recursive:true});
const live = JSON.parse(await readFile(new URL('var/foundation/step5-live.json', root), 'utf8'));
const api = process.env.PLAYER_API || 'http://127.0.0.1:18000';
const ui = process.env.PLAYER_URL || 'http://127.0.0.1:15173';
const browser = await chromium.launch({headless:true, executablePath:process.env.PLAYER_BROWSER || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const context = await browser.newContext({viewport:{width:1280,height:1000}, reducedMotion:'reduce'});
const page = await context.newPage();
const errors = [], modelCalls = [], fitsResponses = [];
page.on('pageerror', e => errors.push(e.message));
page.on('request', r => {if (/\/analyses|\/suggestions/.test(r.url())) modelCalls.push(r.url());});
page.on('response', r => {if(r.url().endsWith('/science.fits')) fitsResponses.push({status:r.status(),url:r.url()});});
const evidence = {verified_at_utc:new Date().toISOString(), browser:await browser.version(), view_id:live.accepted.id,
  scope:'Local real coordinate submission + React player + optional Aladin; production frontend owner/cloud acceptance separate', checks:{}};
try {
  await page.goto(ui+'/?api='+encodeURIComponent(api));
  const submitted = page.waitForResponse(r=>r.request().method()==='POST' && r.url()===api+'/api/v1/views');
  await page.getByRole('button',{name:'Find chronological images'}).click();
  const receipt = await (await submitted).json();
  evidence.view_id = receipt.id;
  await expect(page.getByTestId('outcome')).toHaveText('ready_for_animation',{timeout:240000});
  await expect(page.getByTestId('frame-label')).toContainText('Frame 1/3');
  await expect(page.locator('.images img')).toHaveJSProperty('naturalWidth',30);
  evidence.checks.coordinate_to_real_chronological_images = true;
  const before = await page.getByTestId('frame-label').innerText();
  await page.getByRole('button',{name:'Play',exact:true}).click();
  await expect(page.getByTestId('frame-label')).not.toHaveText(before);
  await page.getByRole('button',{name:'Pause',exact:true}).click();
  evidence.checks.real_animation_without_model = modelCalls.length===0;
  await page.getByLabel('Display speed',{exact:true}).selectOption('2');
  await page.getByLabel('Loop',{exact:true}).check();
  await page.getByLabel('Frame',{exact:true}).fill('0');
  await expect(page.getByTestId('frame-label')).toContainText('Frame 1/3');
  const player=page.getByRole('region',{name:'Image player'});
  await player.focus(); await page.keyboard.press('ArrowRight');
  await expect(page.getByTestId('frame-label')).toContainText('Frame 2/3');
  await page.getByLabel('Display',{exact:true}).selectOption('side');
  await expect(page.locator('.images img')).toHaveCount(2);
  await page.getByLabel('Display',{exact:true}).selectOption('blink');
  await page.getByRole('button',{name:'Play',exact:true}).click();
  await expect(page.getByTestId('frame-label')).toContainText('Frame 2/3');
  await page.getByRole('button',{name:'Pause',exact:true}).click();
  await page.getByLabel('Display',{exact:true}).selectOption('sequence');
  evidence.checks.play_pause_speed_loop_scrub_step_blink_side_keyboard = true;
  evidence.checks.reduced_motion_starts_paused = await page.getByText('Reduced motion: playback starts paused.',{exact:false}).count()===1;
  await page.getByRole('button',{name:'Load this frame in Aladin'}).click();
  await expect(page.getByTestId('aladin-status')).toContainText('FITS + field-center catalog loaded.',{timeout:90000});
  evidence.aladin_status = await page.getByTestId('aladin-status').innerText();
  evidence.checks.aladin_v3_real_2d_fits_cors_catalog_and_roundtrip = fitsResponses.some(r=>r.status===200);
  await page.screenshot({path:fileURLToPath(new URL('player.png', evidenceDir)),fullPage:true});
  // A separate fresh context makes optional-widget failure independent of module/cache state.
  const fault = await browser.newContext({reducedMotion:'reduce'});
  const broken = await fault.newPage();
  await broken.route('**/*aladin*', r=>r.abort('failed'));
  await broken.goto(ui+'/?view='+receipt.id+'&api='+encodeURIComponent(api));
  await expect(broken.getByTestId('outcome')).toHaveText('ready_for_animation');
  await broken.getByRole('button',{name:'Load this frame in Aladin'}).click();
  await expect(broken.getByTestId('aladin-status')).toContainText('Sky map unavailable:');
  await broken.getByRole('button',{name:'Next',exact:true}).click();
  await expect(broken.getByTestId('frame-label')).toContainText('Frame 2/3');
  evidence.checks.widget_failure_does_not_gate_player = true;
  await fault.close();
  const original = await (await context.request.get(api+`/api/v1/views/${receipt.id}/manifest`)).json();
  for (const outcome of ['single_epoch','no_data']) {
    const test = await browser.newContext(); const p = await test.newPage();
    const mock = structuredClone(original); const timeline = mock.timelines.common;
    timeline.outcome=outcome; timeline.frame_count=outcome==='no_data'?0:1;timeline.distinct_epoch_count=timeline.frame_count;
    if(outcome==='no_data') timeline.first_frame=null;
    mock.outcome=outcome;
    await p.route('**/manifest', r=>r.fulfill({json:mock,headers:{'Access-Control-Allow-Origin':ui,'Access-Control-Allow-Credentials':'true'}}));
    await p.route('**/frames?*', r=>r.fulfill({json:{manifest_sha256:mock.manifest_sha256,items:timeline.first_frame?[timeline.first_frame]:[],next_page:null,preload:[]},headers:{'Access-Control-Allow-Origin':ui,'Access-Control-Allow-Credentials':'true'}}));
    await p.goto(ui+'/?view='+receipt.id+'&api='+encodeURIComponent(api));
    await expect(p.getByTestId('outcome')).toHaveText(outcome);
    await expect(p.getByRole('button',{name:'Play',exact:true})).toBeDisabled();
    await expect(p.getByLabel('Loop',{exact:true})).toBeDisabled();
    evidence.checks[`simulated_${outcome}_cannot_animate`]=true; await test.close();
  }
  evidence.page_errors=errors;
  if(errors.length) throw new Error('Unhandled browser errors: '+errors.join('; '));
  await writeFile(new URL('docs/verification/movie_player_report.json',root),JSON.stringify(evidence,null,2)+'\n');
  console.log(JSON.stringify(evidence,null,2));
} catch(e) {
  evidence.failure=String(e); evidence.page_errors=errors;
  await writeFile(new URL('failure.json',evidenceDir),JSON.stringify(evidence,null,2));
  await page.screenshot({path:fileURLToPath(new URL('failure.png',evidenceDir)),fullPage:true});
  throw e;
} finally {await browser.close();}
