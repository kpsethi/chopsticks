/* Run npm run dev first, then node scripts/og.cjs [http://localhost:5173].
 * Needs playwright installed (npm i -D playwright) or PLAYWRIGHT_PATH set. */
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const fs = require('node:fs/promises');
const path = require('node:path');
(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
    await page.goto(process.argv[2] || 'http://localhost:5173', { waitUntil: 'networkidle' });
    await page.locator('#arcade[data-screen="title"] canvas').waitFor();
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(500);
    const output = path.resolve(__dirname, '../public/og.png');
    await fs.mkdir(path.dirname(output), { recursive: true });
    await page.screenshot({ path: output });
    console.log(`Generated ${output} (1200×630) from the running Arcade app.`);
  } finally { await browser.close(); }
})().catch(error => { console.error(`Could not render og.png: ${error.message}`); process.exitCode = 1; });
