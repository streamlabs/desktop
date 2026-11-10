---
applyTo: 'app/**,main.js'
---

# Paths Inside the Packaged App

In a packaged build the app's code and bundled assets live inside `resources/app.asar`, an archive that only Electron and Node's `fs` can read through. `app.getAppPath()` and `__dirname` both point into it. Native code (obs-studio-node, the other native modules), child processes and the OS cannot open a file inside the archive. Dev builds don't use an archive, so a path that breaks this rule works in development and fails only after `yarn package`. When code reviewing a PR, check for the following.

## In-archive paths passed outside Node's `fs`

Flag a path built from `app.getAppPath()`, `remote.app.getAppPath()`, `getAppPath()` (`services/utils`) or `__dirname` that is passed to any of:

- OBS source, filter or output settings (for example a `file`, `image_path` or `local_file` value).
- A native module, or a file descriptor opened on such a path and handed to one.
- `child_process` (`exec`, `execSync`, `spawn`, `execFile`), as a path argument or a working directory.
- `nativeImage.createFromPath`, `shell.openPath`, or an OS dialog's `defaultPath`.

Do not flag:

- Reading in-archive files with `fs` (`readFile`, `existsSync`, `readdir`), as `services/i18n` does.
- In-archive paths loaded by Electron or Chromium itself: `BrowserWindow`/`BrowserView` URLs, `webPreferences.preload`, or an image path used as a URL in the UI, as `$i()` in `services/utils` returns.
- `fs.open` and friends on user data, cache or user-chosen files, which are never in the archive.
