// Проверка НАСТОЯЩЕЙ программы «Файловый менеджер» на Electron (electron):
// страница видит диск через window.fmNative. Всё только во временной папке (FM_START),
// настоящие файлы человека не трогаются. Окно (FM_TEST=1) не показывается и не берёт фокус.
// Удаление - в Корзину Windows (shell.trashItem): в Корзину уходит один временный файл.
// Запуск: npx playwright test tests/files-manager-app.spec.js
'use strict';

const { test, expect, _electron: electron } = require('@playwright/test');
const path = require('path');
const os = require('os');
const fs = require('fs');

const APP = path.join(__dirname, '..', 'electron');
const VERSION = JSON.parse(fs.readFileSync(path.join(APP, 'package.json'), 'utf8')).version;

test('программа: временная папка, создать, переименовать, копировать, найти, в Корзину', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'fm-app-'));
  const work = path.join(tmp, 'work');
  fs.mkdirSync(path.join(work, 'sub'), { recursive: true });
  fs.writeFileSync(path.join(work, 'a.txt'), 'привет');
  fs.writeFileSync(path.join(work, 'sub', 'deep-a.txt'), 'глубоко');
  const app = await electron.launch({
    executablePath: require('electron'),
    args: [APP, '--user-data-dir=' + path.join(tmp, 'data')],
    env: { ...process.env, FM_TEST: '1', FM_START: work },
  });
  try {
    const page = await app.firstWindow();
    await page.waitForFunction(() => window.__fm && window.__fm.ready, null, { timeout: 30000 });
    await page.evaluate(() => window.__fm.idle());
    const win = await app.evaluate(({ BrowserWindow }) => { const w = BrowserWindow.getAllWindows()[0]; return { title: w.getTitle(), visible: w.isVisible() }; });
    expect(win.visible).toBe(false);
    expect(win.title).toContain(VERSION);

    let tab = await page.evaluate(() => window.__fm.tab());
    expect(tab.vol).toBe('native');
    expect(tab.path.toLowerCase()).toBe(work.toLowerCase());
    expect(tab.names.sort()).toEqual(['a.txt', 'sub']);

    // создать, переименовать, копировать - прямо через мост
    const r = await page.evaluate(async (dir) => {
      const n = window.fmNative;
      const d = await n.mkdir(dir, 'Новая');
      const f = await n.rename(dir + '\\a.txt', 'b.txt');
      const c = await n.copy(f, d, 'b.txt');
      let dup = '';
      try { await n.mkdir(dir, 'Новая'); } catch (e) { dup = e.code; }
      let into = '';
      try { await n.copy(dir + '\\sub', dir + '\\sub', 'x'); } catch (e) { into = e.code; }
      return { d, f, c, dup, into };
    }, work);
    expect(fs.existsSync(path.join(work, 'Новая', 'b.txt'))).toBe(true);
    expect(fs.readFileSync(path.join(work, 'b.txt'), 'utf8')).toBe('привет');
    expect(r.dup).toBe('EEXIST');
    expect(r.into).toBe('EINSIDE');

    // поиск по маске идёт и в подпапки
    const found = await page.evaluate(async (dir) => {
      const items = [];
      const v = window.__fm.vol('native');
      await v.search(dir, /a\.txt$/i, { onBatch: (b) => items.push(...b.map((e) => e.name)) });
      return items;
    }, work);
    expect(found).toContain('deep-a.txt');

    // удаление - только в Корзину Windows
    const tr = await page.evaluate((p) => window.fmNative.trash([p]), path.join(work, 'b.txt'));
    expect(tr.done).toBe(1);
    expect(fs.existsSync(path.join(work, 'b.txt'))).toBe(false);
    // безвозвратного удаления в мосте нет вовсе
    const names = await page.evaluate(() => Object.keys(window.fmNative));
    for (const bad of ['rm', 'remove', 'unlink', 'rmdir', 'purge', 'delete']) expect(names).not.toContain(bad);
  } finally {
    await app.close();
  }
});
