// Local second-origin iframe and fresh coordinate restoration against real backend data.
import {chromium, expect} from '@playwright/test';
import {createServer} from 'node:http';
import {readFile, writeFile, mkdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';

const root = new URL('../../', import.meta.url);
const live = JSON.parse(await readFile(new URL('docs/verification/context_sharing.json',root),'utf8'));
const api = process.env.CONTEXT_API || 'http://127.0.0.1:18000';
const width = live.wise_images[0].spatial.shape[1];
const host = createServer((req,res)=>{
  res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});
  res.end(`<!doctype html><html lang="en"><title>Independent embedding test</title><body><h1>Another website</h1><iframe id="demo" title="AegisEarth embedded sky viewer" src="${api}/api/v1/share/embed/${live.source_view_id}" width="760" height="1250"></iframe></body></html>`);
});
await new Promise(resolve=>host.listen(15174,'127.0.0.1',resolve));
const browser = await chromium.launch({headless:true,executablePath:process.env.PLAYER_BROWSER || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'});
const context = await browser.newContext({viewport:{width:1000,height:1400},reducedMotion:'reduce'});
const page = await context.newPage();
const errors=[];page.on('pageerror',error=>errors.push(error.message));
const evidence={verified_at_utc:new Date().toISOString(),browser:await browser.version(),view_id:live.source_view_id,scope:'Backend reference pages only; production React and public deployment are separate',checks:{}};
try {
  await page.goto('http://127.0.0.1:15174');
  const frame=page.frameLocator('#demo');
  await expect(frame.locator('#label')).toContainText('Frame 1/3',{timeout:45000});
  await expect(frame.locator('#sky')).toHaveJSProperty('naturalWidth',width);
  await expect(frame.locator('#motion')).toContainText('Reduced motion');
  evidence.checks.second_origin_iframe_real_images=true;
  const gaia=page.waitForResponse(r=>r.url().includes('/overlays/catalogs?survey=gaia'));
  await frame.getByLabel('Gaia DR3 markers').check();
  expect((await gaia).status()).toBe(200);
  const wise=page.waitForResponse(r=>r.url().includes('/overlays/catalogs?survey=wise'));
  await frame.getByLabel('AllWISE markers').check();
  expect((await wise).status()).toBe(200);
  await expect(frame.locator('#markers circle').first()).toBeVisible();
  await frame.getByLabel('WISE image',{exact:true}).selectOption('2');
  await expect(frame.locator('#wise')).toHaveJSProperty('naturalWidth',width,{timeout:45000});
  await frame.getByLabel('Opacity',{exact:true}).focus();
  await page.keyboard.press('Home');
  for(let i=0;i<3;i++) await page.keyboard.press('ArrowRight');
  await expect(frame.locator('#wise')).toHaveCSS('opacity','0.3');
  await expect(frame.locator('#context')).toContainText('AllWISE W2');
  await expect(frame.locator('#markers circle').first()).toBeVisible();
  evidence.checks.real_catalog_toggles_w2_image_opacity_and_epoch_legend=true;
  await mkdir(new URL('var/context-sharing/',root),{recursive:true});
  await page.screenshot({path:fileURLToPath(new URL('docs/verification/context_embed.png',root)),fullPage:true});
  await frame.getByRole('button',{name:'Next',exact:true}).click();
  await expect(frame.locator('#label')).toContainText('Frame 2/3');
  // This reference section uses its label for keyboard focus even without role=region.
  await frame.locator('section').focus();await page.keyboard.press('ArrowRight');
  await expect(frame.locator('#label')).toContainText('Frame 3/3');
  evidence.checks.keyboard_frame_step_and_paused_start=true;
  await page.route('**/overlays/**',route=>route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({status:'unavailable'})}));
  await frame.getByLabel('Gaia DR3 markers').uncheck();
  await frame.getByLabel('Gaia DR3 markers').check();
  await expect(frame.locator('#context')).toContainText('unavailable');
  await frame.getByRole('button',{name:'Previous',exact:true}).click();
  await expect(frame.locator('#label')).toContainText('Frame 2/3');
  evidence.checks.simulated_overlay_outage_preserves_playback=true;
  await page.unroute('**/overlays/**');
  const fresh=await browser.newContext();const restored=await fresh.newPage();
  let submissions=0;restored.on('request',r=>{if(r.method()==='POST' && r.url().endsWith('/views'))submissions++;});
  await restored.goto(api+live.links.reference_viewer_url);
  await expect(restored.locator('#entry-status')).toContainText('options restored');
  const request=JSON.parse(await restored.getByLabel('Restored request').inputValue());
  expect(request).toEqual(live.links.state.request);
  expect(submissions).toBe(0);
  evidence.checks.fresh_browser_restores_full_coordinate_state_without_automatic_job=true;
  await restored.goto(api+live.links.reference_frozen_url);
  await expect(restored.locator('#entry-status')).toContainText('Saved view restored');
  await expect(restored.frameLocator('#viewer').locator('#label')).toContainText('Frame 1/3');
  evidence.checks.frozen_id_link_reopens_same_real_movie=true;
  await fresh.close();
  expect(errors).toEqual([]);evidence.checks.no_unhandled_browser_errors=true;
  await writeFile(new URL('docs/verification/context_browser.json',root),JSON.stringify(evidence,null,2)+'\n');
  console.log(JSON.stringify(evidence.checks,null,2));
} finally {
  await browser.close();await new Promise(resolve=>host.close(resolve));
}
