import puppeteer from 'puppeteer-core';

const CLIENT = 'http://localhost:4173';
const EXEC = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--no-sandbox', '--enable-unsafe-swiftshader'];

async function enterTown(page, { register, email }) {
  await page.goto(CLIENT, { waitUntil: 'networkidle0', timeout: 30000 });
  await page.waitForFunction(() => document.body.innerText.includes('ARENA'), { timeout: 15000 });
  if (register) {
    await page.evaluate(() =>
      [...document.querySelectorAll('button')].find((b) => b.textContent?.trim() === 'Register')?.click(),
    );
    await page.waitForSelector('input[type="email"]', { timeout: 5000 });
    await page.type('input[type="email"]', email);
    await page.type('input[aria-label="Display name"]', 'SirKnight');
    await page.type('input[type="password"]', 'password123');
    await page.evaluate(() =>
      [...document.querySelectorAll('button')].find((b) => b.textContent?.includes('CREATE ACCOUNT'))?.click(),
    );
  }
  await page.waitForFunction(() => document.body.innerText.includes('ENTER THE WORLD'), { timeout: 15000 });
  await new Promise((r) => setTimeout(r, 400));
  await page.evaluate(() =>
    [...document.querySelectorAll('button')].find((b) => b.textContent?.includes('ENTER THE WORLD'))?.click(),
  );
  await page.waitForFunction(() => !!document.querySelector('canvas'), { timeout: 20000 });
}

// Two independent browsers → two GL contexts, two accounts.
const browserA = await puppeteer.launch({ executablePath: EXEC, headless: 'new', args: ARGS });
const browserB = await puppeteer.launch({ executablePath: EXEC, headless: 'new', args: ARGS });
const a = await browserA.newPage();
await a.setViewport({ width: 1280, height: 800 });
a.on('pageerror', (e) => console.log('A ERROR:', e.message));
const b = await browserB.newPage();
await b.setViewport({ width: 900, height: 600 });

await enterTown(a, { register: true, email: `pdA_${Date.now()}@test.com` });
await enterTown(b, { register: true, email: `pdB_${Date.now()}@test.com` });
await new Promise((r) => setTimeout(r, 3500));

// Both players cluster at spawn; A's own model has no hitbox, so clicking the
// cluster hits the other player. Sweep a few points until the paperdoll opens.
await a.screenshot({ path: '/tmp/pd_pre.png' });
const grid = [];
for (let y=160;y<=235;y+=15) for (let x=540;x<=710;x+=20) grid.push([x,y]);
let opened = false;
for (const [x, y] of grid) {
  await a.mouse.click(x, y, { button: 'left' });
  await new Promise((r) => setTimeout(r, 90));
  if (await a.evaluate(() => document.body.innerText.includes('drag to rotate'))) {
    console.log(`paperdoll opened at ${x},${y}`);
    opened = true;
    break;
  }
}
if (!opened) console.log('paperdoll did not open from clicks');
await new Promise((r) => setTimeout(r, 1500));
await a.screenshot({ path: '/tmp/paperdoll.png' });
console.log('captured /tmp/paperdoll.png');
await browserA.close();
await browserB.close();
