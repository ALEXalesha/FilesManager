<div align="center">

<img src="electron/icon.png" width="96" alt="">

# FilesManager

**FilesManager is a file explorer in one HTML page: folder tree, tabs, two panels, wildcard search, file preview and Windows Explorer hotkeys. There is a Windows app on Electron that works with the real disk. It cannot delete permanently: everything goes to the Recycle Bin.**

[**▶ Open on the web (demo disk) →**](https://alexalesha.github.io/FilesManager/) &nbsp;·&nbsp; [Download for Windows](https://github.com/ALEXalesha/FilesManager/releases/latest) &nbsp;·&nbsp; [Русская версия этого файла](README.ru.md)

[![Status](https://img.shields.io/badge/status-stable-brightgreen)](#) [![Release](https://img.shields.io/github/v/release/ALEXalesha/FilesManager)](https://github.com/ALEXalesha/FilesManager/releases/latest) [![CI](https://github.com/ALEXalesha/FilesManager/actions/workflows/ci.yml/badge.svg)](https://github.com/ALEXalesha/FilesManager/actions/workflows/ci.yml) [![License](https://img.shields.io/badge/license-MIT-blue)](LICENSE) [![HTML5](https://img.shields.io/badge/HTML5-E34F26?logo=html5&logoColor=white)](https://developer.mozilla.org/docs/Web/HTML) [![Electron](https://img.shields.io/badge/Electron-47848F?logo=electron&logoColor=white)](https://www.electronjs.org/) [![Website](https://img.shields.io/badge/Website-open-0A84FF?logo=googlechrome&logoColor=white)](https://alexalesha.github.io/FilesManager/) [![Built with Claude Code](https://img.shields.io/badge/Built_with-Claude_Code-D97757?logo=claude&logoColor=white)](https://claude.com/claude-code)

Code, tests and docs are written by Claude (Anthropic) in Claude Code. Ideas, testing and decisions - Alexey.

</div>

The interface is in English and Russian (RU/EN button in the header).

![Demo disk, tiles](docs/screens/main.png)

![Two panels, night theme](docs/screens/dual-night.png)

## What it sees

| Opened in | Sees | Deleted items go to |
|---|---|---|
| Windows app | the whole disk, through the Electron main process | Windows Recycle Bin (`shell.trashItem`) |
| Chrome, Edge (web or `index.html`) | the demo disk in the browser's IndexedDB and folders opened with "Open folder..." (File System Access API) | the app's Recycle Bin: a `.files-manager-trash` folder inside the opened folder; the demo disk has its own |
| Firefox, Safari | the demo disk only (no File System Access API there) | the demo disk's Recycle Bin |

The demo disk is five folders and a "read me" text file in this browser's IndexedDB. On the web you can create, rename, copy and delete anything: the page never touches real files.

## Why it is built this way

- **Delete means Recycle Bin.** The bridge between the page and the disk (`electron/preload.js`) has no permanent delete at all, and the app test checks it: `window.fmNative` must not have `rm`, `remove`, `unlink`, `rmdir`, `purge` or `delete`. In Windows Explorer Shift+Del deletes for good; here it also goes to the Recycle Bin, and the confirmation says so. "Delete permanently" exists only inside the page's own Recycle Bin in the browser, where there is no Windows Recycle Bin.
- **Move between disks = copy + source to the Recycle Bin.** Rename across Windows volumes fails (`EXDEV`), and "copy then erase" leaves you without the source if the copy breaks. Here the source is copied first, then goes to the Recycle Bin and can be restored.
- **All disk work in the main process.** The page gets neither `fs` nor Node: it sends 18 requests (`fm:list`, `fm:copy`, `fm:trash`, `fm:search` and others) through `ipcMain.handle`, and the main process checks the paths and does the work.
- **One page for the web and the app.** The app opens the same `index.html` (installed as `resources/web/index.html`), there is no second copy. Without `window.fmNative` the page switches to the demo disk by itself.
- **Disk errors as plain objects.** An Error passed through `contextBridge` loses its `code` field (only the message is left), and the page could not tell "already exists" (`EEXIST`) from "access denied". The bridge returns failures as `{name, code, message}`.

## Features

- **Views:** tiles, list, table (Ctrl+Shift+1...8, as in Explorer), sort by name, date, type, size, hidden files and extensions on request.
- **Tabs and two panels:** Ctrl+T / Ctrl+W, Ctrl+Tab, Ctrl+\ for the second panel, Tab between panels, Shift+F5 / Shift+F6 to copy / move to the other panel.
- **Search:** by wildcard (`*.txt`, `report*`) in all subfolders, cancellable.
- **Preview:** images, text and code with highlighting, audio, video, PDF - in the right pane (Alt+P or Space) and in a viewer (Enter or double click), arrows step to the next file.
- **Look:** five themes (Glass, Formal, Light, Night, Warm - the same as in Paint Pro), works on a phone.
- **Memory:** settings in `localStorage` (keys `files-manager.*`); if storage is blocked the page still works. The app remembers window size and position.

![Light theme, English interface](docs/screens/light-en.png)

### Limits

| What | Limit | Why |
|---|---|---|
| Text in the preview pane | 256 KB | selecting a big log must not freeze the page |
| Text in the viewer | 2 MB | the same for the viewer |
| Code highlighting | 300 KB | plain text above that: highlighting a big file is slow |
| Search results | 10,000 | a longer list no longer helps to find |
| Image thumbnails in tiles | up to 40 MB | bigger ones get an icon, the file is not read whole |

### Keys

| Key | Action |
|---|---|
| Alt+← / Alt+→ / Alt+↑, Backspace | back / forward / up; back |
| Enter, Ctrl+Enter | open; a folder in a new tab |
| F2 | rename |
| Del, Ctrl+D, Shift+Del | to the Recycle Bin |
| Ctrl+C / Ctrl+X / Ctrl+V | copy / cut / paste |
| Ctrl+Shift+C | copy path |
| Ctrl+Shift+N / Ctrl+Alt+N | new folder / new file |
| F3, Ctrl+F, Ctrl+E | search |
| F4, Ctrl+L, Alt+D | address bar |
| F5, Ctrl+R | refresh |
| Alt+Enter | properties |
| Shift+F10, Menu key | context menu |
| letters | jump to a name (what you type within a second is the start of the name) |
| F1 | key help |

![Phone, warm theme](docs/screens/phone.png)

## Run it yourself

- **Browser:** open `index.html` in Chrome or Edge. Everything is inside the file (about 245 KB), nothing is downloaded.
- **Windows app:** `FilesManager-<version>-Setup.exe` (installs for the current user) or `FilesManager-<version>-Portable.exe` (no install) in [Releases](https://github.com/ALEXalesha/FilesManager/releases). The version is in the window title.
- **From source:** `npm install`, then `npm start` (the app) or `npm run dist` (installer and portable in `electron/dist`).

## Tests

```
npm install
npx playwright install chromium
npm run test:page              # page laws on the demo disk
npm test                       # plus the Electron app law (window hidden)
node tests/mutate.js           # checks of the checks: broken copies of the page must fail the laws
```

The page laws open `index.html` by file URL in headless Chromium and use only the demo disk. The app law starts the real Electron app with a hidden window (`FM_TEST=1`) on a temporary folder (`FM_START`): it creates, renames, copies, searches, moves one temporary file to the Windows Recycle Bin and opens a folder and a file with a mouse double click. The screenshots above were taken without a window by `tools/screenshots.js`.

A finding of the first check: an example string with `</script>` inside the inline script closed the tag early. The HTML parser knows nothing about JavaScript strings: it sees `</script>` and cuts the script there. The page did not start at all and reported no error about its own code, only a syntax error in the cut-off part. Now it is `<\/script>`, and the page laws fail on any console error.

A finding of 1.0.1: a double click on a folder did not open it. A measurement showed why: the first click selects the folder and redraws the list, and the click between the two presses redrew it once more. The browser sends `dblclick` to the element of the second press, which by then was already removed from the page (`isConnected` = false), so the event reached neither the list nor even `document`. Now a folder or file opens on the second mouse press (`mousedown` with `detail === 2` on the same item) while the element under the mouse is still live, as Windows Explorer does. The law clicks with a real mouse (`page.mouse.dblclick`) in every view, in both panels, in search results and in the tree, and separately in the Electron app.

Findings of the independent review in 1.0.2: in a window 560-1120 px wide the right end of the command bar (language, Settings, Help) went past the window edge, and the bar hides its scrollbar, so a mouse could not reach those buttons. Now the bar drops its labels when they do not fit and, if it still does not fit, wraps to two rows. With two panes in a 720-1000 px window the search box went past the edge of its pane; now a narrow pane squeezes the navigation row and a very narrow one puts the search box on its own row. The law checks 13 window sizes, both languages, one and two panes. The mutation script `node tests/mutate.js` breaks 6 rules in a copy of the page.

Small fixes in 1.0.3: tabs and the open folder are saved at once (before, 200 ms later, so a new tab followed by a quick close was lost); the `>` button in the address bar opens its folder menu on the demo disk too (the same click used to close it) and has a tooltip; after a click on a command bar button, a column header, a tab, the address or a menu item the keyboard goes back to the file list; the focus ring of a column header is no longer cut. The mutation script now breaks 13 rules.

## History

FilesManager was made in the [Hub](https://github.com/ALEXalesha/ALEXalesha.github.io) collection (folder `web/files-manager`), where it is an app in the Hub's "Programs" section. This repository carries it with its commit history. Changes by version are in [CHANGELOG.md](CHANGELOG.md).

## License

MIT, see [LICENSE](LICENSE).
