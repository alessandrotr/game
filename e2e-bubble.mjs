import puppeteer from 'puppeteer-core';
const CLIENT = 'http://localhost:4173';
const b = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--no-sandbox', '--enable-unsafe-swiftshader'],
});
const page = await b.newPage();
await page.setViewport({ width: 1280, height: 800 });
page.on('pageerror', (e) => console.log('PAGE ERROR:', e.message));
await page.goto(CLIENT, { waitUntil: 'networkidle0', timeout: 30000 });
await page.waitForFunction(() => document.body.innerText.includes('ARENA'), { timeout: 15000 });
await page.evaluate(() => [...document.querySelectorAll('button')].find((x) => x.textContent?.trim() === 'Register')?.click());
await page.waitForSelector('input[type="email"]', { timeout: 5000 });
await page.type('input[type="email"]', `bub_${Date.now()}@test.com`);
await page.type('input[aria-label="Display name"]', 'Chatter');
await page.type('input[type="password"]', 'password123');
await page.evaluate(() => [...document.querySelectorAll('button')].find((x) => x.textContent?.includes('CREATE ACCOUNT'))?.click());
await page.waitForFunction(() => document.body.innerText.includes('ENTER THE WORLD'), { timeout: 15000 });
await new Promise((r) => setTimeout(r, 400));
await page.evaluate(() => [...document.querySelectorAll('button')].find((x) => x.textContent?.includes('ENTER THE WORLD'))?.click());
await page.waitForFunction(() => !!document.querySelector('canvas'), { timeout: 20000 });
await new Promise((r) => setTimeout(r, 2500));
// Walk toward camera for a closer view, then send a chat message.
await page.mouse.move(640, 760);
await page.mouse.down({ button: 'right' });
await new Promise((r) => setTimeout(r, 1300));
await page.mouse.up({ button: 'right' });
await new Promise((r) => setTimeout(r, 900));
await page.type('input[aria-label="Chat message"]', 'Hello, travelers!');
await page.keyboard.press('Enter');
await new Promise((r) => setTimeout(r, 900));
await page.screenshot({ path: '/tmp/bubble.png' });
console.log('captured');
await b.close();
