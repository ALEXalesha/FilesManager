// Кадры для README: docs/screens/*.png. Страница открывается в безголовом Chromium по
// файловому адресу на демо-диске (IndexedDB этого браузера) - настоящие файлы не видны.
// Окон на экране нет, захват мыши - заглушка.
//   node tools/screenshots.js
// FM_PAGE - другая копия страницы, FM_OUT - другая папка для кадров.
'use strict';
const path = require('path');
const fs = require('fs');
const { pathToFileURL } = require('url');
const { chromium } = require('@playwright/test');

const PAGE = process.env.FM_PAGE || path.join(__dirname, '..', 'index.html');
const OUT = process.env.FM_OUT || path.join(__dirname, '..', 'docs', 'screens');

async function shot(browser, name, { settings = {}, size = { width: 1280, height: 800 }, then = null } = {}) {
  const page = await browser.newPage({ viewport: size, deviceScaleFactor: 1 });
  await page.addInitScript(() => { Element.prototype.requestPointerLock = function () {}; Document.prototype.exitPointerLock = function () {}; });
  await page.addInitScript((s) => localStorage.setItem('files-manager.settings', JSON.stringify(s)), settings);
  await page.route(/^https?:\/\//, (r) => r.abort());
  await page.goto(pathToFileURL(PAGE).href);
  await page.waitForFunction(() => window.__fm && window.__fm.ready === true, null, { timeout: 20000 });
  await page.evaluate(() => window.__fm.idle());
  if (then) { await page.evaluate(then); await page.evaluate(() => window.__fm.idle()); }
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(OUT, name) });
  await page.close();
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ headless: true, args: ['--allow-file-access-from-files'] });
  await shot(browser, 'main.png', { settings: { view: 'tiles', preview: true } });
  await shot(browser, 'dual-night.png', { settings: { theme: 'night', dual: true, view: 'table' } });
  await shot(browser, 'light-en.png', { settings: { theme: 'light', ui: 'en', view: 'list', preview: true } });
  await shot(browser, 'phone.png', { settings: { theme: 'warm', view: 'list' }, size: { width: 390, height: 844 } });
  await browser.close();
  for (const f of fs.readdirSync(OUT)) console.log(f, Math.round(fs.statSync(path.join(OUT, f)).size / 1024) + ' КБ');
})().catch((e) => { console.error(e); process.exit(1); });
