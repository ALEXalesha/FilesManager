# Changelog

## 1.0.1 - 2026-10-11

- Fixed: a double click on a folder did not open it (and on a file did not open the preview). The first click selects and redraws the list; the click between the two presses redrew it again, so the browser sent `dblclick` to the old item element that was already gone from the page and the handler never saw it. Now an item opens on the second mouse press (`mousedown` with `detail === 2` on the same item), while the element under the mouse is still live, as in Windows Explorer; `dblclick` stays as a fallback for touch screens.
- New laws: a real mouse double click (`page.mouse.dblclick`) in table, tiles and list view, on a selected and a not selected folder, on a file, in both panels, in search results, in the folder tree and on the empty part of the tab strip; and in the Electron app on a temporary folder with the window hidden.

## 1.0.0 - 2026-10-11

First release.

- One page: folder tree, tiles / list / table, tabs, two panels, wildcard search, preview of images, text, code, audio, video and PDF, Windows Explorer hotkeys, five themes, RU/EN.
- Browser: File System Access API for opened folders, otherwise a demo disk in IndexedDB; the page's own Recycle Bin.
- Windows app (Electron): all disk work in the main process over IPC, delete only to the Windows Recycle Bin, move between disks = copy + source to the Recycle Bin; installer and portable.
- Fixed before release: `</script>` inside a string of the inline script closed the tag and the page did not start; disk errors passed through `contextBridge` lost their `code`.
