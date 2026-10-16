// Законы «Файлового менеджера / FilesManager» (index.html) - смоук.
// Только демо-диск в IndexedDB браузера: настоящие файлы проверки не трогают.
// Запуск: npx playwright test tests/files-manager.spec.js --workers=1
const { test, expect } = require('@playwright/test');
const path = require('path');
const { pathToFileURL } = require('url');

// FM_FILE - путь к другой копии страницы (так проверяются сломанные копии - мутанты)
const URL = pathToFileURL(process.env.FM_FILE || path.join(__dirname, '..', 'index.html')).href;

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
  expect(st.v).toBe('1.0.2');
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

// Горячие клавиши Проводника на демо-диске: создать папку и назвать её, F2, копировать-вставить,
// войти и выйти (Enter, Alt+стрелка), вкладки Ctrl+T / Ctrl+W, вторая панель Ctrl+\.
test('горячие клавиши: Ctrl+Shift+N, F2, Ctrl+C/V, Enter, Alt+←, Ctrl+T/W, Ctrl+обратная косая', async ({ page }) => {
  const errors = await openFm(page);
  const tab = () => page.evaluate(() => window.__fm.tab());
  const idle = () => page.evaluate(() => window.__fm.idle());
  const tabsCount = () => page.evaluate(() => { const A = window.__fm.App; return A.panels[A.active].tabs.length; });

  // новая папка: имя сразу в поле, набранное заменяет выделенное
  await page.keyboard.press('Control+Shift+N');
  await idle();
  await expect(page.locator('input.rename')).toBeFocused();
  await page.keyboard.type('Ключи');
  await page.keyboard.press('Enter');
  await idle();
  expect((await tab()).names).toContain('Ключи');

  // F2 - переименовать выбранное
  await page.evaluate(() => window.__fm.select(['Ключи']));
  await page.keyboard.press('F2');
  await expect(page.locator('input.rename')).toBeFocused();
  await page.keyboard.type('Ключи-2');
  await page.keyboard.press('Enter');
  await idle();
  const t1 = await tab();
  expect(t1.names).toContain('Ключи-2');
  expect(t1.names).not.toContain('Ключи');

  // копировать файл, войти в папку Enter, вставить, назад Alt+←
  const file = t1.names.find((n) => /\.txt$/.test(n));
  expect(file).toBeTruthy();
  await page.evaluate((n) => window.__fm.select([n]), file);
  await page.keyboard.press('Control+C');
  await page.evaluate(() => window.__fm.select(['Ключи-2']));
  await page.keyboard.press('Enter');
  await idle();
  expect((await tab()).path).toContain('Ключи-2');
  expect((await tab()).names).toEqual([]);
  await page.keyboard.press('Control+V');
  await idle();
  expect((await tab()).names).toEqual([file]);
  await page.keyboard.press('Alt+ArrowLeft');
  await idle();
  const t2 = await tab();
  expect(t2.names).toContain('Ключи-2');
  expect(t2.names).toContain(file); // копия, а не перенос
  expect(t2.fwd).toBe(1);

  // вкладки и вторая панель
  const n0 = await tabsCount();
  await page.keyboard.press('Control+T');
  await idle();
  expect(await tabsCount()).toBe(n0 + 1);
  await page.keyboard.press('Control+W');
  await idle();
  expect(await tabsCount()).toBe(n0);
  const dual0 = await page.evaluate(() => window.__fm.settings.dual);
  await page.keyboard.press('Control+Backslash');
  await idle();
  expect(await page.evaluate(() => window.__fm.settings.dual)).toBe(!dual0);
  expect(errors).toEqual([]);
});

// Двойной щелчок настоящей мышью (page.mouse.dblclick), как у человека. В 1.0.0 не работал:
// первый щелчок выделял, второй (по уже выделенному) перерисовывал список, и событие dblclick
// уходило в старый, уже убранный со страницы элемент - до обработчика не доходило.
test('двойной щелчок мышью: папка открывается, файл - в просмотре; таблица, плитки, список, две панели, поиск, дерево', async ({ page }) => {
  const errors = await openFm(page);
  const idle = () => page.evaluate(() => window.__fm.idle());
  const tab = (i) => page.evaluate((k) => window.__fm.tab(k), i);
  const panel = (i) => page.locator('section.panel').nth(i);
  const dbl = async (loc) => {
    // список и дерево перерисовываются (поиск досылает найденное, дерево догружается): между поиском элемента
    // и замером он может смениться новым - тогда boundingBox даёт null; берём замер живого элемента
    let b = null;
    await expect.poll(async () => (b = await loc.boundingBox()), { timeout: 5000 }).toBeTruthy();
    await page.mouse.dblclick(b.x + b.width / 2, b.y + b.height / 2);
    await idle();
  };
  const item = (i, name) => panel(i).locator(`.it[data-name="${name}"]`);
  const home = async () => { await page.evaluate(() => window.__fm.go('/')); await idle(); };

  for (const view of ['table', 'tiles', 'list']) {
    await page.keyboard.press(view === 'table' ? 'Control+Shift+6' : view === 'tiles' ? 'Control+Shift+2' : 'Control+Shift+5');
    await idle();
    expect(await page.evaluate(() => window.__fm.activeTab().view)).toBe(view);
    expect((await tab(0)).path).toBe('/');
    // папка без выделения
    await dbl(item(0, 'Видео'));
    expect((await tab(0)).path, `вид ${view}: папка без выделения`).toBe('/Видео');
    await home();
    // папка, уже выделенная одним щелчком раньше (так чаще всего и бывает)
    await item(0, 'Документы').click();
    await page.waitForTimeout(600);
    await dbl(item(0, 'Документы'));
    expect((await tab(0)).path, `вид ${view}: выделенная папка`).toBe('/Документы');
    await home();
    // файл открывается в просмотре
    await dbl(item(0, 'Прочитай меня.txt'));
    await expect(page.locator('#viewer'), `вид ${view}: просмотр файла`).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('#viewer')).toBeHidden();
  }

  // две панели: двойной щелчок во второй открывает папку во второй, первая на месте
  await page.keyboard.press('Control+Backslash');
  await idle();
  await expect(panel(1)).toBeVisible();
  const p0 = (await tab(0)).path;
  await expect(item(1, 'Музыка')).toBeVisible();
  await dbl(item(1, 'Музыка'));
  expect((await tab(1)).path).toBe('/Музыка');
  expect((await tab(0)).path).toBe(p0);
  await dbl(item(0, 'Книги'));
  expect((await tab(0)).path).toBe('/Книги');
  expect((await tab(1)).path).toBe('/Музыка');
  await page.keyboard.press('Control+Backslash');
  await idle();
  await home();

  // результаты поиска: папка открывается, файл - в просмотре
  const search = panel(0).locator('.search input');
  await search.fill('меня');
  await idle();
  await expect(item(0, 'Прочитай меня.txt')).toBeVisible();
  await dbl(item(0, 'Прочитай меня.txt'));
  await expect(page.locator('#viewer')).toBeVisible();
  await page.keyboard.press('Escape');
  await search.fill('Изображения');
  await idle();
  await expect(item(0, 'Изображения')).toBeVisible();
  await dbl(item(0, 'Изображения'));
  expect((await tab(0)).path).toBe('/Изображения');
  await home();

  // дерево слева: двойной щелчок по папке открывает её
  const node = page.locator('#sidebar .sn.tn[data-path="/Видео"]');
  await expect(node).toBeVisible();
  await dbl(node.locator('.nm'));
  expect((await tab(0)).path).toBe('/Видео');

  // пустое место полосы вкладок: двойной щелчок - новая вкладка
  const n0 = await page.evaluate(() => window.__fm.App.panels[0].tabs.length);
  const strip = await panel(0).locator('.tabs').boundingBox();
  await page.mouse.dblclick(strip.x + strip.width - 20, strip.y + strip.height / 2);
  await idle();
  expect(await page.evaluate(() => window.__fm.App.panels[0].tabs.length)).toBe(n0 + 1);
  expect(errors).toEqual([]);
});

// 1.0.2, находки независимой проверки 16.10: в окне 560-1120 px правый край панели команд (язык,
// «Настройки», «Справка») уходил за окно - полоса прокрутки у неё скрыта, мышью не добраться; при двух
// панелях в окне 720-1000 px поле поиска уходило за край своей панели.
const FIT_SIZES = [[420, 520], [480, 640], [560, 600], [640, 700], [720, 600], [768, 1024], [820, 700], [900, 700], [960, 800], [1024, 600], [1100, 700], [1280, 720], [1920, 1080]];
test('панель команд и строка навигации влезают целиком: все размеры окна, RU/EN, одна и две панели', async ({ browser }) => {
  test.setTimeout(180_000);
  const problems = [];
  for (const ui of ['ru', 'en']) for (const dual of [false, true]) {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await page.addInitScript((s) => localStorage.setItem('files-manager.settings', s), JSON.stringify({ ui, dual, preview: dual }));
    expect(await openFm(page)).toEqual([]);
    for (const [width, height] of FIT_SIZES) {
      await page.setViewportSize({ width, height });
      await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
      const bad = await page.evaluate(() => {
        const out = [];
        const W = document.documentElement.clientWidth;
        const vis = (e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && !e.closest('[hidden]'); };
        const tb = document.querySelector('#toolbar').getBoundingClientRect();
        for (const b of document.querySelectorAll('#toolbar button')) {
          if (!vis(b)) continue;
          const r = b.getBoundingClientRect();
          if (r.left < tb.left - 0.5 || r.right > Math.min(W, tb.right) + 0.5 || r.top < tb.top - 0.5 || r.bottom > tb.bottom + 0.5) out.push(`кнопка ${b.dataset.cmd} за краем панели команд (${r.left.toFixed(0)}..${r.right.toFixed(0)} из ${W})`);
        }
        for (const p of document.querySelectorAll('section.panel')) {
          if (!vis(p)) continue;
          const pr = p.getBoundingClientRect();
          for (const e of p.querySelectorAll('.nav .nb, .nav .addr, .nav .search')) {
            if (!vis(e)) continue;
            const r = e.getBoundingClientRect();
            if (r.left < pr.left - 0.5 || r.right > pr.right + 0.5) out.push(`панель ${p.dataset.panel}: ${e.className} за краем панели (${r.left.toFixed(0)}..${r.right.toFixed(0)}, панель ${pr.left.toFixed(0)}..${pr.right.toFixed(0)})`);
          }
          for (const h of p.querySelectorAll('.thead button')) { const r = h.getBoundingClientRect(); if (vis(h) && r.right > pr.right + 0.5) out.push(`панель ${p.dataset.panel}: столбец «${h.textContent}» за краем панели`); }
          const s = p.querySelector('.search');
          if (vis(s) && s.getBoundingClientRect().width < 60) out.push(`панель ${p.dataset.panel}: поиск уже 60 px`);
        }
        // выезжающие панели (узкое окно) не заходят на панель команд
        for (const sel of ['#sidebar', '#preview']) {
          const e = document.querySelector(sel);
          if (vis(e) && getComputedStyle(e).position === 'fixed' && e.getBoundingClientRect().top < tb.bottom - 0.5) out.push(`${sel} заходит на панель команд`);
        }
        return out;
      });
      for (const b of bad) problems.push(`${ui}${dual ? ' две панели' : ''} ${width}x${height}: ${b}`);
      if (width <= 720) {
        await page.evaluate(() => document.body.classList.add('side-open'));
        const over = await page.evaluate(() => document.querySelector('#sidebar').getBoundingClientRect().top < document.querySelector('#toolbar').getBoundingClientRect().bottom - 0.5);
        if (over) problems.push(`${ui} ${width}x${height}: дерево папок заходит на панель команд`);
        await page.evaluate(() => document.body.classList.remove('side-open'));
      }
    }
    await ctx.close();
  }
  expect(problems.slice(0, 15)).toEqual([]);
});
