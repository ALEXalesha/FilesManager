// Проверка проверок «Файлового менеджера»: по одному ломает правило страницы в КОПИИ во временной
// папке и гоняет на ней законы tests/files-manager.spec.js (через FM_FILE). Сломанное правило
// должно уронить закон («мутант убит»). Исходник web/files-manager не меняется.
// Запуск из корня репозитория: node tests/mutate.js
// Файл не *.spec.js - Playwright его сам не запускает.
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'index.html');
const SPEC = 'tests/files-manager.spec.js';

// from - точный кусок кода (ровно один раз), to - сломанный вариант, g - какие законы гонять
const MUTANTS = [
  // 1.0.3: вкладки сразу, «>» в адресе, фокус после кнопок, рамка шапки
  { name: 'вкладки пишутся через 200 мс', from: 'function saveSession() {', to: 'function saveSession() { clearTimeout(window.__st); window.__st = setTimeout(saveSessionNow, 200); } function saveSessionNow() {', g: 'сохраняются сразу' },
  { name: 'меню «>» закрывается тем же щелчком', from: '&& Menu.bornClick !== Menu.click) hideMenu();', to: ') hideMenu();', g: 'в адресе' },
  { name: 'у «>» нет подсказки', from: " title=\"${esc(t('crumb.sep', c.label))}\"", to: '', g: 'в адресе' },
  { name: 'после кнопок фокус не возвращается в список', from: '    if (clickBack) backToList();', to: '', g: 'клавиши снова' },
  { name: 'кнопка ищется после перерисовки', from: '    if (clickBack) backToList();', to: "    if (ev.target.closest('#toolbar button, .tabs, .thead button, .crumb')) backToList();", g: 'клавиши снова' },
  { name: 'после пункта меню фокус не возвращается', from: 'it.run(); backToList(); return; }', to: 'it.run(); return; }', g: 'в адресе|клавиши снова' },
  { name: 'рамка шапки снаружи кнопки', from: '.thead > button:focus-visible { outline: 2px solid var(--accent); outline-offset: -2px; }', to: '', g: 'рамка фокуса заголовка' },
  // 1.0.2: панель команд и строка навигации в узком окне
  { name: 'панель команд не подстраивается под окно', from: 'function fitToolbar() {', to: 'function fitToolbar() { return;', g: 'влезают' },
  { name: 'без подписей, но не в две строки', from: "  if (tb.scrollWidth > tb.clientWidth + 1) tb.classList.add('tb-wrap');", to: '', g: 'влезают' },
  { name: 'панель не знает своей ширины (нет container-type)', from: '  container-type: inline-size;', to: '', g: 'влезают' },
  { name: 'столбец размера в панели уже 240 px', from: "  if (width < 240) return ['name'];", to: '', g: 'влезают' },
  { name: 'дерево в узком окне на старом месте', from: '#sidebar { position: fixed; left: 4px; top: calc(var(--tb-h, 46px) + 4px);', to: '#sidebar { position: fixed; left: 4px; top: 50px;', g: 'влезают' },
  // 1.0.1: двойной щелчок
  { name: 'двойной щелчок только через dblclick', from: 'if (e && ev.detail === 2 && p.down === e.path) {', to: 'if (false) {', g: 'двойной щелчок' },
];

function runSpec(file, g) {
  const r = spawnSync(`npx playwright test ${SPEC} -g "${g}" --workers=1 --max-failures=1 --reporter=dot`, {
    cwd: ROOT, env: { ...process.env, FM_FILE: file }, shell: true, encoding: 'utf8', timeout: 10 * 60 * 1000,
  });
  return { ok: r.status === 0, out: (r.stdout || '') + (r.stderr || '') };
}

function main() {
  const src = fs.readFileSync(SRC, 'utf8');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fm-mutants-'));
  const file = path.join(dir, 'index.html');
  let survived = 0;
  fs.writeFileSync(file, src);
  const base = runSpec(file, [...new Set(MUTANTS.map((m) => m.g))].join('|'));
  console.log(`исходная копия: ${base.ok ? 'проверки зелёные' : 'ПРОВЕРКИ КРАСНЫЕ'}`);
  if (!base.ok) { console.log(base.out.slice(-3000)); process.exitCode = 2; return; }
  for (const m of MUTANTS) {
    const n = src.split(m.from).length - 1;
    if (n !== 1) { console.log(`? ${m.name}: кусок кода найден ${n} раз - мутант устарел`); survived++; continue; }
    fs.writeFileSync(file, src.replace(m.from, m.to));
    const r = runSpec(file, m.g);
    console.log(`${r.ok ? 'ВЫЖИЛ' : 'убит '}  ${m.name}`);
    if (r.ok) survived++;
  }
  console.log(`итог: убито ${MUTANTS.length - survived} из ${MUTANTS.length}`);
  if (survived) process.exitCode = 1;
}

if (require.main === module) main();
module.exports = { MUTANTS };
