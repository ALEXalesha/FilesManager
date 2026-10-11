// Законы «Файлового менеджера / FilesManager» (index.html) - смоук.
// Только демо-диск в IndexedDB браузера: настоящие файлы проверки не трогают.
// Запуск: npx playwright test tests/files-manager.spec.js --workers=1
const { test, expect } = require('@playwright/test');
const path = require('path');
const { pathToFileURL } = require('url');

const URL = pathToFileURL(path.join(__dirname, '..', 'index.html')).href;

async function openFm(page) {
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await require('./helpers').lockFirst(page); await page.goto(URL);
  await page.waitForFunction(() => window.__fm && window.__fm.ready, null, { timeout: 20000 });
  await page.evaluate(() => window.__fm.idle());
  return errors;
}

test('страница открывается на демо-диске без ошибок', async ({ page }) => {
  const errors = await openFm(page);
  const st = await page.evaluate(() => ({ v: window.__fm.version, tab: window.__fm.tab() }));
  expect(st.v).toBe('1.0.0');
  expect(st.tab.vol).toBe('demo');
  expect(st.tab.error).toBeFalsy();
  expect(st.tab.names.length).toBeGreaterThan(0);
  expect(errors).toEqual([]);
});

test('новая папка, вкладка, две панели, удаление в Корзину программы', async ({ page }) => {
  const errors = await openFm(page);
  const before = await page.evaluate(() => window.__fm.tab().names.length);
  await page.evaluate(() => window.__fm.run('newFolder'));
  await page.keyboard.press('Enter');
  await page.evaluate(() => window.__fm.idle());
  const after = await page.evaluate(() => window.__fm.tab());
  expect(after.names.length).toBe(before + 1);
  const made = after.names.find((n) => !n.startsWith('.') && after.sel.includes(n)) || after.sel[0];
  expect(made).toBeTruthy();

  // удаление: только в Корзину программы, и оттуда видно
  await page.evaluate((n) => window.__fm.select([n]), made);
  await page.evaluate(() => { window.__fm.run('delete'); });
  // спрашивает перед удалением; кнопка «Удалить» - data-act=ok
  await page.locator('[data-act="ok"]').last().click();
  await page.evaluate(() => window.__fm.idle());
  expect(await page.evaluate(() => window.__fm.tab().names)).not.toContain(made);
  await page.evaluate(() => window.__fm.run('trashOpen'));
  await page.evaluate(() => window.__fm.idle());
  expect((await page.evaluate(() => window.__fm.tab().names)).join('|')).toContain(made);

  // вкладка и две панели
  await page.evaluate(() => window.__fm.run('newTab'));
  await page.evaluate(() => window.__fm.run('dual'));
  await page.evaluate(() => window.__fm.idle());
  expect(await page.evaluate(() => window.__fm.settings.dual)).toBe(true);
  expect(errors).toEqual([]);
});
