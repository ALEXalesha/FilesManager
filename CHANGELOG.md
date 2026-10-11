# Changelog

## 1.0.0 - 2026-10-11

First release.

- One page: folder tree, tiles / list / table, tabs, two panels, wildcard search, preview of images, text, code, audio, video and PDF, Windows Explorer hotkeys, five themes, RU/EN.
- Browser: File System Access API for opened folders, otherwise a demo disk in IndexedDB; the page's own Recycle Bin.
- Windows app (Electron): all disk work in the main process over IPC, delete only to the Windows Recycle Bin, move between disks = copy + source to the Recycle Bin; installer and portable.
- Fixed before release: `</script>` inside a string of the inline script closed the tag and the page did not start; disk errors passed through `contextBridge` lost their `code`.
