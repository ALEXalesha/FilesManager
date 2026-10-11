// Мост страницы к диску: window.fmNative. Каждый вызов уходит в главный процесс (main.js)
// по IPC; ошибка возвращается с кодом (EEXIST, ENOENT, EACCES...), здесь она снова
// становится отказом с e.code, как ждёт страница.
'use strict';

const { contextBridge, ipcRenderer, webUtils } = require('electron');

const call = (name) => async (...args) => {
  const r = await ipcRenderer.invoke('fm:' + name, ...args);
  if (r && r.ok) return r.value;
  // Error через contextBridge теряет свои поля (остаётся только message), поэтому отказ -
  // простой объект: его страница получает целиком, с e.code
  throw { name: 'Error', code: (r && r.code) || 'ERR', message: (r && r.message) || 'Ошибка' };
};

const NAMES = ['info', 'drives', 'list', 'dirs', 'stat', 'mkdir', 'mkfile', 'writeFile', 'rename', 'copy', 'move', 'trash',
  'readBytes', 'fileUrl', 'dirSize', 'search', 'cancel', 'watch', 'unwatch'];
const api = {};
for (const n of NAMES) api[n] = call(n);
api.on = (ev, cb) => {
  if (!['progress', 'found', 'changed', 'open'].includes(ev)) return;
  ipcRenderer.on('fm:' + ev, (_e, d) => cb(d));
};
api.pathForFile = (f) => { try { return webUtils.getPathForFile(f) || ''; } catch (e) { return ''; } };

contextBridge.exposeInMainWorld('fmNative', api);
