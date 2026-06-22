Connect Claude to a live Streamlabs Desktop instance for AI-driven testing, using the WebdriverIO MCP server. Work through the steps in order, stopping and reporting clearly if anything fails.

The app is an Electron app; we drive it directly via WebDriver (no separate ChromeDriver terminal needed — wdio launches and manages everything from a single `start_session` call).

---

## Step 1 — Verify dependencies

Check that `@wdio/mcp` is in `package.json` devDependencies. If missing, run `yarn add -D @wdio/mcp`.

---

## Step 2 — Verify the MCP server is registered and loaded

Confirm `.mcp.json` (project root) contains the `webdriverio` server:

```json
{
  "mcpServers": {
    "webdriverio": {
      "type": "stdio",
      "command": "node",
      "args": ["node_modules/@wdio/mcp/lib/server.js"]
    }
  }
}
```

Then check whether the `webdriverio` MCP tools are actually available to you (e.g. `start_session`). If they are not, the server hasn't been loaded — tell the user to **restart Claude Code**, then re-run this skill. (Ensure there's no conflicting `webdriverio` entry in `.claude/settings.json`; `.mcp.json` is the single source of truth.)

---

## Step 3 — Verify the app is compiled

Confirm `bundles/renderer.js` exists. If not, tell the user to run `yarn compile` first, then stop.

---

## Step 3.5 — Clear the TEST app-data cache (always)

All MCP test state lives in **one** project-local directory:

| Directory | Purpose | Created by |
|---|---|---|
| `<ROOT>\.slobs-mcp-cache` | **Streamlabs app data** (scenes, settings, onboarding state) **and** the Electron/Chromium user-data-dir. `main.js` redirects both `appData` and `userData` here, so `DevToolsActivePort` is written under `…\.slobs-mcp-cache\slobs-client` | `test-main-standalone.js` via `SLOBS_CACHE_DIR`; the `slobs-client` subdir is also passed as `--user-data-dir` in Step 4 |

It's gitignored (`.slobs-mcp-cache/`). **First kill any leftover processes from a previous run** — they hold file locks, so deleting the cache while they're alive silently fails and you end up resuming a half-written cache (a common cause of a flaky-looking start). Then delete the cache:

```powershell
Get-Process | Where-Object { $_.Name -match "electron|chromedriver" } | Stop-Process -Force -ErrorAction SilentlyContinue
Remove-Item -Recurse -Force "<ROOT>\.slobs-mcp-cache" -ErrorAction SilentlyContinue
```

(The `electron` match targets the dev `node_modules/electron` binary used by the harness; the user's *production* Streamlabs runs as a differently-named exe and is not affected.)

> ⚠️ **NEVER delete `%APPDATA%\slobs-client`** — that is the user's real production Streamlabs install data (live scenes, credentials, settings). Only ever delete `<ROOT>\.slobs-mcp-cache`, which is used exclusively by MCP test sessions.

The directory is recreated automatically on next launch. Skip this step only if you explicitly want to resume a previous session's state.

---

## Step 4 — Launch and attach in one call

Determine the absolute project root (the directory containing `package.json`) and call `start_session` with the capabilities below. Substitute **`<ROOT>`** everywhere — the absolute project root in **forward-slash** form, e.g. `C:/Users/acree/code/desktop`. That single value is the *only* substitution; it appears in all four args, including `--user-data-dir`. Use the same forward-slash spelling each time (don't hand-build a backslash path).

```json
{
  "platform": "browser",
  "headless": false,
  "capabilities": {
    "browserName": "chrome",
    "webSocketUrl": false,
    "wdio:enforceWebDriverClassic": true,
    "wdio:chromedriverOptions": {
      "binary": "<ROOT>/node_modules/electron-chromedriver/bin/chromedriver.exe"
    },
    "goog:chromeOptions": {
      "binary": "<ROOT>/node_modules/electron/dist/electron.exe",
      "args": [
        "--app=<ROOT>/test-main-standalone.js",
        "--nosync",
        "--user-data-dir=<ROOT>/.slobs-mcp-cache/slobs-client"
      ]
    }
  }
}
```

Why each piece matters (these were all hard-won — do not drop them):
- `wdio:chromedriverOptions.binary` → use **electron-chromedriver** (matches this Electron's Chromium — currently Electron 29 / Chromium 122). Without it, wdio downloads the latest stable ChromeDriver, which refuses to drive this Electron.
- `goog:chromeOptions.binary` → the real `electron.exe`. A `.cmd` wrapper here makes ChromeDriver lose the process ("Chrome instance exited").
- `--app=test-main-standalone.js` → a tiny entry that sets `NODE_ENV=test` + an isolated `SLOBS_CACHE_DIR` in-process, then requires `test-main.js`. ChromeDriver does not propagate env to the launched Electron, so this is how the test harness gets enabled. It also isolates app data from the real install.
- `--user-data-dir=<ROOT>/.slobs-mcp-cache/slobs-client` → **must exactly match the app's actual Electron `userData` dir, or the session times out.** `main.js` overrides Electron's paths at startup (`app.setPath('appData', SLOBS_CACHE_DIR)` → `userData = <SLOBS_CACHE_DIR>/slobs-client`), and `test-main-standalone.js` sets `SLOBS_CACHE_DIR = <ROOT>/.slobs-mcp-cache`. So Electron writes its `DevToolsActivePort` file into `<ROOT>/.slobs-mcp-cache/slobs-client`. ChromeDriver watches the dir it passed as `--user-data-dir` for that file to learn the debug port — so the two must name the same directory. If they don't, ChromeDriver waits 60s, fails with `session not created: DevToolsActivePort file doesn't exist`, and wdio retries — which *looks* like the app "relaunches" mid-boot (a second boot banner ~60s after the first). Because both sides derive from `<ROOT>`, they agree as long as you substitute `<ROOT>` consistently; the session then comes up in ~3s. (Forward-slash vs backslash doesn't matter — Windows resolves them to the same path — but **don't** introduce an unexpanded `%TEMP%`/`$env:` token or a different base dir.) The cache deliberately lives under the project root, not OS-temp, precisely so the caller never has to compute a machine-specific path.
- `webSocketUrl: false` + `wdio:enforceWebDriverClassic: true` → force WebDriver-classic. wdio 9 defaults to BiDi, which fails on this Electron with a TrustedHTML error.
- `headless: false` → the app misbehaves headless; keep it visible.

The `window/rect` "unknown command" note in the result is harmless.

---

## Step 5 — Switch to the main window

Electron exposes three windows (worker, main, child). The session attaches to the hidden **worker** window first (blank screenshot). Call `get_tabs`, find the one whose URL ends with `windowId=main`, and `switch_tab` to its handle.

---

## Step 6 — Confirm

Call `get_screenshot`. You should see the Streamlabs Desktop UI (onboarding "Welcome to Streamlabs!" on a fresh cache, or the main studio if previously set up). Show it to the user.

---

## Step 7 — Print usage summary

```
Session active — the webdriverio MCP tools are now driving a live Streamlabs Desktop.

Remember: the worker window is the default target. switch_tab to windowId=main for the UI.

Useful starting prompts:
  • "Take a screenshot and describe what you see"
  • "Click Live Streaming and walk through onboarding"
  • "Add a new scene and verify it appears in the scene list"
  • "Check for any visible errors or broken UI elements"

To stop:      close_session
To reconnect: run /sld-live-session again
```

---

## Driving the app — operational playbook

This section is the knowledge needed to actually *do things* in the app after connecting (verified end-to-end via MCP). Read it before acting on a request like "skip onboarding, create a scene, add a color source."

### Window model
Electron exposes three windows; `get_tabs` lists them by URL (`?windowId=...`). Handles are stable for the session.
- **worker** — hidden background window. **This is the default attach target** and renders nothing (blank screenshot). Never interact here.
- **main** — the studio UI (Scenes / Sources / Mixer, onboarding). Most actions start here.
- **child** — where **all dialogs and forms open** (name-scene, add-source picker, source properties). The pattern is always: click a control in `main` → `switch_tab` to `child` → fill the form → confirm → `switch_tab` back to `main`.

### Selector strategy (critical)
- **Prefer stable selectors**, in this order: visible text (`button=Done`, `h2=Live Streaming`, `span=MyScene`, `div*=Color Block`), `[data-name="..."]`, `[data-testid="..."]`, `[role="tab"]`. `click_element` and `set_value` accept webdriverio's text-selector syntax.
- **Never use hashed CSS-module classes** like `.option___2q1zm` or `.help-tip__close___ZR_Bz` — the hash suffix changes on every build, so they break on other machines / after recompiles.
- **`get_elements` returns 0 for this Vue/React app** — it doesn't introspect it. Instead use `execute_script` to discover structure (`document.querySelectorAll`, read `data-name`/text), then act with `click_element` / `set_value`.

### Selector lookup — DON'T hardcode, look it up (this is the scalable part)

This app has a huge UI. We deliberately **do not** keep a selector catalog — it would drift instantly (the helper's `[data-name="color_source"]` was already stale vs the running build). Instead, selectors have three maintained homes; look them up on demand in this order:

1. **Test helpers** — `test/helpers/modules/*.ts` (`scenes.ts`, `sources.ts`, `streaming.ts`, `forms/`, `core.ts`, `onboarding.ts`…). The test suite keeps these current, and they encode the exact selector sequence *and* the window switches. `Grep` for the action (e.g. `addSource`, `addScene`).
2. **Component source** — if no helper covers it, `Grep` the app source for the feature's `data-name=` / `data-testid=` near the relevant component.
3. **Live DOM** — `execute_script` on the running app is ground truth for the actual build. Use it to confirm a selector, or when tiers 1–2 are stale.

**Delegate the lookup to a subagent.** For anything non-trivial, spawn an **Explore agent** with a focused prompt — e.g. *"In test/helpers/modules and the app source, find the stable selector sequence (with window switches) to do X. Return only the selectors and steps."* It reads the files and returns just the answer, so the main session never fills with file dumps and this stays fast no matter how much UI exists. Then verify against the live DOM if a click times out.

### React-controlled inputs (important gotcha)
Form inputs are pre-filled and React-controlled. `set_value` **appends** to the existing value (its clearValue doesn't reset React's model) — e.g. naming a scene "MyScene" yields "New SceneMyScene". To replace cleanly, set via the native setter and dispatch events with `execute_script`:
```js
const inp = document.querySelector('[data-name=newSourceName]');
const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;
set.call(inp, 'My Name'); inp.dispatchEvent(new Event('input',{bubbles:true}));
inp.dispatchEvent(new Event('change',{bubbles:true}));
```

### Onboarding help tooltips
After onboarding, two help tooltips overlay the Scenes panel and can intercept clicks. Dismiss them first:
`execute_script`: `document.querySelectorAll('[class*="help-tip__close"]').forEach(c=>c.click())`

### Worked examples (illustrations of the procedure — NOT the catalog)

These three are spelled out because they exercise every pattern above (cross-window, search-picker, React inputs). For anything else, use the lookup procedure — don't expect it to be listed here.

**Skip onboarding** (in `main`, all stable text selectors):
`h2=Live Streaming` → `button=Continue` → `button=Skip` (auth) → `div=Start Fresh` if shown (OBS import) → `button=Skip` (hardware) → `button=Skip` (themes) → `div[data-testid=choose-free-plan-btn]`. Ends in the studio editor.

**Add a scene:**
1. `main`: `click_element [data-name=SceneSelector] .icon-add-circle`
2. `switch_tab` → child; set `[data-name=sceneName]` (use the native-setter snippet to avoid appending), `click_element button=Done`
3. `switch_tab` → main; verify with `execute_script` querying `[data-name=SceneSelector] span`

**Add a color source:**
1. `main`: `click_element [data-name=sourcesControls] .icon-add-circle`
2. `switch_tab` → child (the "Add Source" picker). **Picker tiles have no `data-name` in this build** (the helper's `[data-name="color_source"]` may not match — verify, don't assume). Use the search box instead: `set_value input[placeholder*=Search]` = `Color`, then `click_element div*=Color Block`.
3. `click_element button=Add Source` → name dialog; set `[data-name=newSourceName]` via the native-setter snippet; `click_element button=Add Source`
4. `switch_tab` → main; verify `execute_script`: `!!document.querySelector('[data-name="<your name>"]')`

---

## Cleanup note

If sessions are left dangling, zombie `electron` / `chromedriver` processes can accumulate. To reset on Windows:
`Get-Process | Where-Object { $_.Name -match "electron|chromedriver" } | Stop-Process -Force`
