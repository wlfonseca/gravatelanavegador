const puppeteer = require('puppeteer-core');

const URL_REUNIAO = process.env.URL;
const NOME = process.env.NOME || 'Gravador';
const DURACAO_MAX = Number(process.env.DURACAO || 3600) * 1000;
const ESPERA_LOBBY = Number(process.env.ESPERA_LOBBY || 600) * 1000;
const [LARGURA, ALTURA] = (process.env.RES || '1280x720').split('x');
const SAIDA = '/app/videos';

const FIM_REUNIAO = [
  'meeting has ended', 'you\'ve been removed', 'you have been removed', 'you left the meeting',
  'denied access', 'call ended', 'couldn\'t connect', 'try joining again', 'não foi possível conectar', 'tente ingressar novamente', 'reunião terminou', 'você foi removido', 'você saiu da reunião', 'acesso negado'
];
const LOBBY = ['should let you in soon', 'waiting for someone to let you in', 'deverá admiti-lo', 'aguardando'];

const espera = ms => new Promise(r => setTimeout(r, ms));
const log = msg => console.log(`[${new Date().toISOString()}] ${msg}`);

async function emQualquerFrame(page, fn, arg) {
  for (const frame of page.frames()) {
    try {
      const r = await frame.evaluate(fn, arg);
      if (r) return r;
    } catch {}
  }
  return null;
}

function clicarFn({ seletores, textos }) {
  const visivel = e => e.offsetParent !== null && !e.disabled && e.getAttribute('aria-disabled') !== 'true';
  for (const s of seletores) {
    const e = document.querySelector(s);
    if (e && visivel(e)) { e.click(); return s; }
  }
  const els = [...document.querySelectorAll('button, a, [role="button"]')].filter(visivel);
  for (const t of textos) {
    const e = els.find(x => `${x.innerText} ${x.getAttribute('aria-label') || ''}`.toLowerCase().includes(t));
    if (e) { e.click(); return t; }
  }
  return null;
}

async function clicar(page, alvo, timeout = 30000) {
  const fim = Date.now() + timeout;
  while (Date.now() < fim) {
    const r = await emQualquerFrame(page, clicarFn, alvo);
    if (r) return r;
    await espera(1000);
  }
  return null;
}

function textoPagina() {
  return document.body ? document.body.innerText.toLowerCase() : '';
}

async function texto(page) {
  const partes = [];
  for (const frame of page.frames()) {
    try { partes.push(await frame.evaluate(textoPagina)); } catch {}
  }
  return partes.join('\n');
}

async function foto(page, nome) {
  try { await page.screenshot({ path: `${SAIDA}/${nome}.png` }); } catch {}
}

async function preencherNome(page) {
  const fim = Date.now() + 60000;
  while (Date.now() < fim) {
    for (const frame of page.frames()) {
      const campo = await frame.$('input[data-tid="prejoin-display-name-input"], input[placeholder*="name" i], input[placeholder*="nome" i]').catch(() => null);
      if (campo) {
        await campo.click({ clickCount: 3 });
        await campo.type(NOME, { delay: 50 });
        return true;
      }
    }
    await espera(1000);
  }
  return false;
}

function estadoToggles() {
  return [...document.querySelectorAll('[data-tid="toggle-mute"], [data-tid="toggle-video"], [role="switch"]')]
    .map(e => ({
      tid: e.getAttribute('data-tid') || '',
      titulo: e.getAttribute('title') || e.getAttribute('aria-label') || '',
      checked: e.checked,
      ariaChecked: e.getAttribute('aria-checked'),
      ariaPressed: e.getAttribute('aria-pressed')
    }));
}

async function desligarMicECamera(page) {
  log(`toggles antes: ${JSON.stringify(await emQualquerFrame(page, estadoToggles))}`);
  await emQualquerFrame(page, () => {
    const alvos = [...document.querySelectorAll('[data-tid="toggle-mute"], [data-tid="toggle-video"], [role="switch"]')];
    for (const a of alvos) {
      const ligado = a.checked === true || a.getAttribute('aria-checked') === 'true' || a.getAttribute('aria-pressed') === 'true';
      if (ligado) a.click();
    }
    return alvos.length;
  });
  await espera(1500);
  log(`toggles depois: ${JSON.stringify(await emQualquerFrame(page, estadoToggles))}`);
}

async function entrarNoTeams(page) {
  const continuar = await clicar(page, {
    seletores: ['[data-tid="joinOnWeb"]', '#openTeamsClientInBrowser'],
    textos: ['continue on this browser', 'join on the web', 'continuar neste navegador', 'ingressar na web']
  }, 45000);
  log(`continuar no navegador: ${continuar || 'não apareceu'}`);
  await foto(page, 'etapa-1-launcher');

  const nome = await preencherNome(page);
  log(`nome preenchido: ${nome}`);
  await espera(3000);
  await desligarMicECamera(page);
  await foto(page, 'etapa-2-prejoin');

  const entrar = await clicar(page, {
    seletores: ['[data-tid="prejoin-join-button"]', 'button[data-tid*="join"]'],
    textos: ['join now', 'ingressar agora', 'participar agora']
  }, 60000);
  log(`ingressar: ${entrar || 'botão não encontrado'}`);
  if (!entrar) return false;

  const semDispositivo = await clicar(page, {
    seletores: [],
    textos: ['continue without audio or video', 'continuar sem áudio ou vídeo']
  }, 5000);
  if (semDispositivo) log('diálogo de dispositivos fechado');

  const fimLobby = Date.now() + ESPERA_LOBBY;
  let noLobby = false;
  while (Date.now() < fimLobby) {
    const t = await texto(page);
    if (FIM_REUNIAO.some(f => t.includes(f))) { log('recusado ou reunião encerrada no lobby'); return false; }
    if (LOBBY.some(f => t.includes(f))) {
      if (!noLobby) { log('no lobby, aguardando ser admitido'); await foto(page, 'etapa-3-lobby'); }
      noLobby = true;
    } else if (await emQualquerFrame(page, () => !!document.querySelector('#hangup-button, [data-tid="hangup-main-btn"], [data-tid="call-hangup"]'))) {
      log('dentro da reunião');
      await foto(page, 'etapa-4-reuniao');
      return true;
    }
    await espera(2000);
  }
  log('tempo de lobby esgotado');
  return false;
}

(async () => {
  if (!URL_REUNIAO) throw new Error('defina URL');

  const args = [
    '--window-position=0,0',
    `--window-size=${LARGURA},${ALTURA}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-dev-shm-usage',
    '--no-sandbox',
    '--test-type',
    '--lang=en-US',
    '--autoplay-policy=no-user-gesture-required',
    '--use-fake-ui-for-media-stream',
    '--use-fake-device-for-media-stream',
    '--use-file-for-fake-audio-capture=/app/silencio.wav',
    '--disable-features=Translate'
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
  await page.setExtraHTTPHeaders({ 'Accept-Language': 'en-US,en;q=0.9' });

  await page.goto(URL_REUNIAO, { waitUntil: 'domcontentloaded', timeout: 90000 });
  let inicio = Date.now();

  const ehTeams = /teams\.(microsoft\.com|live\.com|cloud\.microsoft)/.test(URL_REUNIAO);
  if (ehTeams && !(await entrarNoTeams(page))) {
    await foto(page, 'etapa-erro');
    await browser.close();
    process.exit(2);
  }
  inicio = Date.now();

  while (Date.now() - inicio < DURACAO_MAX) {
    await espera(5000);
    if (!ehTeams) continue;
    const t = await texto(page);
    if (FIM_REUNIAO.some(f => t.includes(f))) { log('reunião encerrada'); break; }
  }

  if (ehTeams) {
    await clicar(page, { seletores: ['#hangup-button', '[data-tid="hangup-main-btn"]', '[data-tid="call-hangup"]'], textos: ['leave', 'sair'] }, 5000);
    await espera(2000);
  }
  await foto(page, 'etapa-5-fim');
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
