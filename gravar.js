const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({
    headless: true,
    args: process.env.QEMU ? ['--no-zygote', '--no-sandbox'] : []
  });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 },
    recordVideo: { dir: './videos/', size: { width: 1280, height: 720 } }
  });
  const page = await context.newPage();

  await page.goto(process.env.URL || 'https://example.com');
  await page.waitForTimeout(2000);
  await page.mouse.wheel(0, 400);
  await page.waitForTimeout(1500);
  await page.screenshot({ path: './videos/screenshot.png' });

  const video = page.video();
  await context.close();
  console.log('video:', await video.path());
  await browser.close();
})();
