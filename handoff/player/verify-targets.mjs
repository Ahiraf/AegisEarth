// Local backend-to-reference-player validation. Production handoff acceptance is user-confirmed.
import {chromium, expect} from '@playwright/test';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';

const root=new URL('../../',import.meta.url);
const input=JSON.parse(await readFile(new URL('docs/verification/targets/summary.json',root),'utf8'));
const output=new URL('var/target-validation/browser/',root);await mkdir(output,{recursive:true});
const api=process.env.PLAYER_API||'http://127.0.0.1:18000';
const ui=process.env.PLAYER_URL||'http://127.0.0.1:15173';
const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYER_BROWSER||'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'});
const result={product:'AegisEarth',run_id:input.run_id,verified_at_utc:new Date().toISOString(),
  scope:'Local reference-player evidence; user-confirmed production handoff acceptance is separate',cases:[]};
try {
  for(const target of input.targets) for(const test of target.cases) {
    const context=await browser.newContext({reducedMotion:'reduce',viewport:{width:1280,height:1000}});
    const page=await context.newPage();const errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    const row={target:target.target,case:test.case,view_id:test.view_id};
    try {
      await page.goto(`${ui}/?view=${test.view_id}&api=${encodeURIComponent(api)}`);
      if(test.status!=='succeeded') {
        await expect(page.getByRole('alert')).toBeVisible();
        await expect(page.getByRole('button',{name:'Play',exact:true})).toBeDisabled();
        row.outcome='upstream_failure_shown_without_animation';
      } else {
        await expect(page.getByTestId('outcome')).toHaveText(test.movie_outcome);
        if(test.movie_outcome==='no_data') {
          await expect(page.getByRole('button',{name:'Play',exact:true})).toBeDisabled();
        } else {
          await expect.poll(()=>page.locator('.images img').first().evaluate(img=>img.naturalWidth),{timeout:20000}).toBeGreaterThan(0);
          await expect(page.getByText('Units: MJy/sr.',{exact:false})).toBeVisible();
          if(test.movie_outcome==='ready_for_animation') {
            const before=await page.getByTestId('frame-label').innerText();
            await page.getByRole('button',{name:'Play',exact:true}).click();
            await expect(page.getByTestId('frame-label')).not.toHaveText(before);
            await page.getByRole('button',{name:'Pause',exact:true}).click();
            row.real_animation=true;
          } else await expect(page.getByRole('button',{name:'Play',exact:true})).toBeDisabled();
        }
        row.outcome=test.movie_outcome;
        row.metadata_text=await page.getByRole('region',{name:'Image player'}).innerText();
        // Avoid duplicating full warning/metadata JSON in the aggregate browser report.
        row.metadata_text=row.metadata_text.slice(0,1600);
      }
      await page.screenshot({path:fileURLToPath(new URL(`${target.target}-${test.case}.png`,output)),fullPage:true});
      row.unhandled_errors=errors;row.passed=errors.length===0;
      expect(errors).toEqual([]);
    } catch(e) {row.passed=false;row.error=String(e);}
    result.cases.push(row);await context.close();
  }
  result.all_cases_passed=result.cases.every(c=>c.passed);
  await writeFile(new URL('docs/verification/targets/browser.json',root),JSON.stringify(result,null,2)+'\n');
  console.log(JSON.stringify(result.cases.map(({target,case:kind,outcome,passed,error})=>({target,case:kind,outcome,passed,error})),null,2));
  if(!result.all_cases_passed) throw new Error('Target browser validation failed; inspect the receipt.');
} finally {await browser.close();}
