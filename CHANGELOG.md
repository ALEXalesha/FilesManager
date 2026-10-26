# Changelog

## 1.0.3 - 2026-10-16

Small fixes after the review.

- Fixed: tabs and the open folder were saved 200 ms after a change. A new tab followed at once by a reload or a closed window was lost, and so was the folder you had just opened. Now they are saved at once.
- Fixed: the `>` button in the address bar (folders inside) did not open its menu on the demo disk. The folder list was ready within the same click, and the click handler of the page closed the menu that had just opened. Now a menu is not closed by the click that opened it. The button got a tooltip: "Folders in ...".
- Fixed: after a click on a command bar button the keyboard stayed on that button - the arrows did nothing and Enter pressed the same button again; after a click on a column header, a tab, the address or a menu item the focus fell to the page body. Now the focus goes back to the file list, as in Windows Explorer.
- Fixed: the keyboard focus ring of a column header was cut by the edge of the list; now it is drawn inside the header.
- 4 new laws (red on 1.0.2) and 7 new mutants (13 in all, all killed).

## 1.0.2 - 2026-10-16

Fixes from an independent review.

- Fixed: in a window 560-1120 px wide the right end of the command bar (language, Settings, Help) was outside the window. The bar hides its scrollbar, so the buttons could not be reached with a mouse. Now the bar drops its labels when they do not fit and, if it still does not fit, wraps to two rows; the folder tree and the preview that slide out in a narrow window start below it.
- Fixed: with two panes in a 720-1000 px window the search box went past the edge of its pane. A narrow pane now squeezes the navigation row, a very narrow one puts the search box on its own row, and below 240 px the table shows only the name column.
- New law: the command bar and the navigation rows fit in 13 window sizes from 420x520 to 1920x1080, in both languages, with one and two panes. New mutation script `tests/mutate.js` (6 mutants). The double-click law waits for a live element (the list redraws while search results arrive).

## 1.0.1 - 2026-10-11

- Fixed: a double click on a folder did not open it (and on a file did not open the preview). The first click selects and redraws the list; the click between the two presses redrew it again, so the browser sent `dblclick` to the old item element that was already gone from the page and the handler never saw it. Now an item opens on the second mouse press (`mousedown` with `detail === 2` on the same item), while the element under the mouse is still live, as in Windows Explorer; `dblclick` stays as a fallback for touch screens.
- New laws: a real mouse double click (`page.mouse.dblclick`) in table, tiles and list view, on a selected and a not selected folder, on a file, in both panels, in search results, in the folder tree and on the empty part of the tab strip; and in the Electron app on a temporary folder with the window hidden.

## 1.0.0 - 2026-10-11

First release.

- One page: folder tree, tiles / list / table, tabs, two panels, wildcard search, preview of images, text, code, audio, video and PDF, Windows Explorer hotkeys, five themes, RU/EN.
- Browser: File System Access API for opened folders, otherwise a demo disk in IndexedDB; the page's own Recycle Bin.
- Windows app (Electron): all disk work in the main process over IPC, delete only to the Windows Recycle Bin, move between disks = copy + source to the Recycle Bin; installer and portable.
- Fixed before release: `</script>` inside a string of the inline script closed the tag and the page did not start; disk errors passed through `contextBridge` lost their `code`.
