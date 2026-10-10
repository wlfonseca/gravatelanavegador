const puppeteer = require('puppeteer-core');

const [LARGURA, ALTURA] = (process.env.RES || '1280x720').split('x');

(async () => {
  const args = [
    '--window-position=0,0',
    `--window-size=${LARGURA},${ALTURA}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-dev-shm-usage',
    '--no-sandbox',
    '--test-type'
  ];
  if (process.env.QEMU) args.push('--no-zygote');

  const browser = await puppeteer.launch({
    executablePath: '/usr/bin/chromium',
    headless: false,
    defaultViewport: null,
    ignoreDefaultArgs: ['--enable-automation'],
    args
  });
  const [page] = await browser.pages();

  await page.goto(process.env.URL || 'https://example.com', { waitUntil: 'load' });
  await new Promise(r => setTimeout(r, 2000));
  await page.mouse.wheel({ deltaY: 400 });
  await new Promise(r => setTimeout(r, 1500));
  await page.screenshot({ path: '/app/videos/screenshot.png' });

  await browser.close();
})();
