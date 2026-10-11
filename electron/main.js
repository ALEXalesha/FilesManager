// Оболочка Electron «Файлового менеджера» (FilesManager): одно окно с той же страницей,
// что на сайте (../index.html, в собранной программе - resources/web/index.html), и
// настоящий диск через IPC. Страница сама к диску доступа не имеет: preload.js отдаёт ей
// window.fmNative, а всё чтение и запись делает этот главный процесс.
//
// Удаление - только в Корзину Windows (shell.trashItem). Безвозвратного удаления здесь нет
// вовсе: даже перенос между дисками (EXDEV) - это копия и потом исходник в Корзину.
//
// Режим проверок (FM_TEST=1): окно не показывается и не берёт фокус, стартовая папка -
// FM_START (временная папка проверки), сессия вкладок не восстанавливается. Папку данных
// проверки задают своим --user-data-dir.
'use strict';

const { app, BrowserWindow, Menu, screen, session, ipcMain, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const fsp = fs.promises;
const { pathToFileURL } = require('url');
const WindowState = require('./window-state');

const TEST = process.env.FM_TEST === '1';
const VERSION = app.getVersion();
const SIZE = { width: 1200, height: 780, minWidth: 560, minHeight: 420 };
const PAGE = app.isPackaged
  ? path.join(process.resourcesPath, 'web', 'index.html')
  : path.join(__dirname, '..', 'index.html');
const stateFile = () => path.join(app.getPath('userData'), 'window-state.json');
const SEARCH_LIMIT = 10000;
const WIN = process.platform === 'win32';
const HIDDEN_WIN = new Set(['desktop.ini', 'thumbs.db', '$recycle.bin', 'system volume information', 'pagefile.sys', 'hiberfil.sys', 'swapfile.sys', 'dumpstack.log.tmp']);

let win = null;

// --- ошибки: код уходит в страницу (EEXIST, ENOENT, EACCES, EINSIDE...) ---------------
function fail(code, message) { const e = new Error(message || code); e.code = code; return e; }
function codeOf(e) {
  const c = e && e.code;
  if (c === 'EPERM') return 'EACCES';
  return c || 'ERR';
}
function checkName(name) {
  if (typeof name !== 'string' || !name || name === '.' || name === '..' || /[\\/:*?"<>|\x00-\x1f]/.test(name)) throw fail('NAME', 'Недопустимое имя');
}
function abs(p) {
  if (typeof p !== 'string' || !path.isAbsolute(p)) throw fail('ENOENT', 'Нужен полный путь');
  return path.resolve(p);
}
function same(a, b) { return WIN ? a.toLowerCase() === b.toLowerCase() : a === b; }
function inside(anc, p) {
  const a = WIN ? anc.toLowerCase() : anc, b = WIN ? p.toLowerCase() : p;
  return b === a || b.startsWith(a.endsWith(path.sep) ? a : a + path.sep);
}
async function exists(p) { try { await fsp.lstat(p); return true; } catch (e) { return false; } }

// --- записи каталога -------------------------------------------------------------------
async function entryOf(full, name) {
  let st;
  try { st = await fsp.stat(full); } catch (e) { st = await fsp.lstat(full); }
  const dir = st.isDirectory();
  return {
    name, path: full, dir,
    size: dir ? null : st.size,
    mtime: st.mtimeMs, ctime: st.birthtimeMs || st.ctimeMs, atime: st.atimeMs,
    hidden: name.startsWith('.') || (WIN && HIDDEN_WIN.has(name.toLowerCase())),
  };
}
async function list(p, onlyDirs) {
  const dir = abs(p);
  const items = await fsp.readdir(dir, { withFileTypes: true });
  const out = [];
  for (let i = 0; i < items.length; i += 64) {
    const part = await Promise.all(items.slice(i, i + 64).map(async (d) => {
      if (onlyDirs && !d.isDirectory() && !d.isSymbolicLink()) return null;
      try { const e = await entryOf(path.join(dir, d.name), d.name); return onlyDirs && !e.dir ? null : e; } catch (e) { return null; }
    }));
    for (const e of part) if (e) out.push(e);
  }
  return out;
}

function places() {
  const ids = [['home', 'home'], ['desktop', 'desktop'], ['documents', 'documents'], ['downloads', 'downloads'], ['pictures', 'pictures'], ['music', 'music'], ['videos', 'videos']];
  const out = [];
  for (const [id, key] of ids) { try { const p = app.getPath(key); if (fs.existsSync(p)) out.push({ id, path: p }); } catch (e) { /* нет такой папки */ } }
  return out;
}
async function drives() {
  const ds = [];
  const roots = WIN ? 'CDEFGHIJKLMNOPQRSTUVWXYZAB'.split('').map((l) => l + ':\\') : ['/'];
  for (const r of roots) {
    try {
      await fsp.access(r);
      let total = null, free = null;
      try { const s = await fsp.statfs(r); total = s.blocks * s.bsize; free = s.bavail * s.bsize; } catch (e) { /* сетевой или пустой привод */ }
      ds.push({ name: WIN ? r.slice(0, 2) : '/', path: r, label: '', total, free });
    } catch (e) { /* буквы нет */ }
  }
  return { drives: ds, places: places() };
}

// --- долгие задачи (размер папки, поиск) с отменой --------------------------------------
const cancelled = new Set();
const tick = () => new Promise((r) => setImmediate(r));
function send(ev, data) { if (win && !win.isDestroyed()) win.webContents.send('fm:' + ev, data); }

async function dirSize(p, id) {
  const root = abs(p);
  const st0 = await fsp.stat(root);
  if (!st0.isDirectory()) return { bytes: st0.size, files: 1, dirs: 0 };
  const st = { bytes: 0, files: 0, dirs: 0 };
  const stack = [root];
  let k = 0;
  try {
    while (stack.length) {
      const d = stack.pop();
      let items;
      try { items = await fsp.readdir(d, { withFileTypes: true }); } catch (e) { continue; }
      for (const it of items) {
        const f = path.join(d, it.name);
        if (it.isDirectory()) { st.dirs++; stack.push(f); } else if (it.isFile()) { st.files++; try { st.bytes += (await fsp.stat(f)).size; } catch (e) { /* занят */ } }
        if (++k % 500 === 0) { send('progress', { id, ...st }); await tick(); if (cancelled.has(id)) throw fail('ABORT'); }
      }
    }
  } finally { cancelled.delete(id); }
  return st;
}

async function search(p, source, flags, id) {
  const root = abs(p);
  const re = new RegExp(source, String(flags || '').replace(/[gy]/g, ''));
  const queue = [root];
  let batch = [], total = 0, k = 0;
  try {
    while (queue.length) {
      const d = queue.shift();
      let items;
      try { items = await fsp.readdir(d, { withFileTypes: true }); } catch (e) { continue; }
      for (const it of items) {
        const f = path.join(d, it.name);
        if (re.test(it.name)) { try { batch.push(await entryOf(f, it.name)); total++; } catch (e) { /* исчез */ } }
        if (it.isDirectory()) queue.push(f);
        if (total >= SEARCH_LIMIT) { send('found', { id, items: batch }); return { total, limited: true }; }
      }
      if (++k % 50 === 0) {
        if (batch.length) { send('found', { id, items: batch }); batch = []; }
        await tick();
        if (cancelled.has(id)) return { total, aborted: true };
      }
    }
    if (batch.length) send('found', { id, items: batch });
    return { total };
  } finally { cancelled.delete(id); }
}

// --- изменения в открытых папках ---------------------------------------------------------
const watchers = new Map();
let watchSeq = 0;
function watch(p) {
  const dir = abs(p);
  const id = 'w' + (++watchSeq);
  let timer = null;
  try {
    const w = fs.watch(dir, { persistent: false }, () => { clearTimeout(timer); timer = setTimeout(() => send('changed', { id }), 250); });
    w.on('error', () => { try { w.close(); } catch (e) { /* уже закрыт */ } watchers.delete(id); });
    watchers.set(id, w);
  } catch (e) { /* папку не слушаем - не беда, есть F5 */ }
  return id;
}
function unwatch(id) { const w = watchers.get(id); if (w) { try { w.close(); } catch (e) { /* уже */ } watchers.delete(id); } return true; }

// --- запись ------------------------------------------------------------------------------
async function target(dir, name) {
  checkName(name);
  const d = abs(dir);
  const p = path.join(d, name);
  if (await exists(p)) throw fail('EEXIST', name);
  return p;
}
async function trashOne(p) { await shell.trashItem(abs(p)); }

const API = {
  info: async () => ({ platform: process.platform, sep: path.sep, version: VERSION, test: TEST, start: TEST && process.env.FM_START ? path.resolve(process.env.FM_START) : '', places: places() }),
  drives,
  list: (p) => list(p, false),
  dirs: (p) => list(p, true),
  stat: async (p) => { const f = abs(p); return entryOf(f, path.basename(f) || f); },
  mkdir: async (dir, name) => { const p = await target(dir, name); await fsp.mkdir(p); return p; },
  mkfile: async (dir, name) => { const p = await target(dir, name); await fsp.writeFile(p, '', { flag: 'wx' }); return p; },
  writeFile: async (dir, name, bytes) => { const p = await target(dir, name); await fsp.writeFile(p, Buffer.from(bytes), { flag: 'wx' }); return p; },
  rename: async (p, name) => {
    const src = abs(p);
    checkName(name);
    const dst = path.join(path.dirname(src), name);
    if (same(src, dst)) return src;
    // смена только регистра в Windows - тот же файл, это не «уже есть»
    if (!(WIN && src.toLowerCase() === dst.toLowerCase()) && await exists(dst)) throw fail('EEXIST', name);
    await fsp.rename(src, dst);
    return dst;
  },
  copy: async (src, dstDir, name) => {
    const s = abs(src), dst = await target(dstDir, name);
    if (inside(s, dst)) throw fail('EINSIDE');
    await fsp.cp(s, dst, { recursive: true, errorOnExist: true, force: false, preserveTimestamps: true });
    return dst;
  },
  move: async (src, dstDir, name) => {
    const s = abs(src), dst = await target(dstDir, name);
    if (inside(s, dst)) throw fail('EINSIDE');
    try { await fsp.rename(s, dst); } catch (e) {
      if (e.code !== 'EXDEV') throw e;
      // другой диск: копия, потом исходник в Корзину (не безвозвратно)
      await fsp.cp(s, dst, { recursive: true, errorOnExist: true, force: false, preserveTimestamps: true });
      await trashOne(s);
    }
    return dst;
  },
  trash: async (paths) => {
    let done = 0;
    const errors = [];
    for (const p of [].concat(paths || [])) {
      try { await trashOne(p); done++; } catch (e) { errors.push({ path: p, code: codeOf(e), message: String(e && e.message || e) }); }
    }
    return { done, errors };
  },
  readBytes: async (p, limit) => {
    const f = abs(p);
    if (!limit) return { bytes: await fsp.readFile(f) };
    const h = await fsp.open(f, 'r');
    try { const buf = Buffer.alloc(limit); const { bytesRead } = await h.read(buf, 0, limit, 0); return { bytes: buf.subarray(0, bytesRead) }; } finally { await h.close(); }
  },
  fileUrl: async (p) => pathToFileURL(abs(p)).href,
  dirSize: (p, id) => dirSize(p, id),
  search: (p, source, flags, id) => search(p, source, flags, id),
  cancel: async (id) => { cancelled.add(id); return true; },
  watch: async (p) => watch(p),
  unwatch: async (id) => unwatch(id),
};

for (const [name, fn] of Object.entries(API)) {
  ipcMain.handle('fm:' + name, async (e, ...args) => {
    if (!win || e.sender !== win.webContents) return { ok: false, code: 'EACCES', message: 'чужое окно' };
    try { return { ok: true, value: await fn(...args) }; } catch (err) { return { ok: false, code: codeOf(err), message: String(err && err.message || err) }; }
  });
}

// --- окно --------------------------------------------------------------------------------
function windowTitle(pageTitle) { return `${pageTitle || 'FilesManager'} ${VERSION}`; }

function createWindow() {
  const primary = screen.getPrimaryDisplay();
  const areas = [primary, ...screen.getAllDisplays().filter((d) => d.id !== primary.id)].map((d) => d.workArea);
  const placed = WindowState.restore(TEST ? null : WindowState.load(stateFile()), areas, SIZE);

  win = new BrowserWindow({
    ...(placed.x !== undefined ? { x: placed.x, y: placed.y } : {}),
    width: placed.width, height: placed.height, minWidth: SIZE.minWidth, minHeight: SIZE.minHeight,
    title: windowTitle(),
    backgroundColor: '#1b1d24',
    icon: path.join(__dirname, 'icon.ico'),
    show: false,
    autoHideMenuBar: true,
    ...(TEST ? { focusable: false, skipTaskbar: true } : {}),
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true, spellcheck: false, preload: path.join(__dirname, 'preload.js') },
  });
  win.on('page-title-updated', (e, title) => { e.preventDefault(); win.setTitle(windowTitle(title)); });
  win.webContents.on('will-navigate', (e, url) => { if (url !== win.webContents.getURL()) e.preventDefault(); });
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.loadFile(PAGE);
  if (placed.maximized && !TEST) win.maximize();
  if (!TEST) win.once('ready-to-show', () => win.show());
  const remember = () => { if (!TEST && win && !win.isDestroyed() && !win.isMinimized()) WindowState.save(stateFile(), WindowState.capture(win)); };
  for (const event of ['resized', 'moved', 'maximize', 'unmaximize']) win.on(event, remember);
  win.on('close', remember);
  win.on('closed', () => { win = null; for (const id of [...watchers.keys()]) unwatch(id); });
}

function pathArg(argv) {
  const a = argv.slice(app.isPackaged ? 1 : 2).find((x) => x && !x.startsWith('-') && path.isAbsolute(x));
  return a && fs.existsSync(a) ? a : null;
}

if (!TEST && !app.requestSingleInstanceLock()) {
  app.quit();
} else {
  Menu.setApplicationMenu(null);
  app.on('second-instance', (_e, argv) => {
    if (!win) return;
    if (win.isMinimized()) win.restore();
    win.focus();
    const p = pathArg(argv);
    if (p) send('open', { path: p });
  });
  app.whenReady().then(() => {
    // Сеть не нужна: страница целиком в одном файле
    session.defaultSession.webRequest.onBeforeRequest({ urls: ['http://*/*', 'https://*/*', 'ws://*/*', 'wss://*/*'] }, (_d, cb) => cb({ cancel: true }));
    createWindow();
    const p = pathArg(process.argv);
    if (p) win.webContents.once('did-finish-load', () => send('open', { path: p }));
  });
  app.on('window-all-closed', () => app.quit());
}

// Для проверок (tests-app/files-manager-app.spec.js читает через app.evaluate)
globalThis.__fmApp = { TEST, VERSION, PAGE, get win() { return win; }, API };
