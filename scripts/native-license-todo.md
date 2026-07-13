# Native / C++ module license audit — TO DO

These components ship as **prebuilt binaries** (or an external installer), so their
licenses are **not** in the JS dependency tree and are **not** covered by
`scripts/license-audit.*`. Each must be audited at its own upstream repo — and,
critically, so must *its* transitive/vendored C++ dependencies.

Versions are the **shipped** versions from `scripts/repositories.json`
(authoritative — that's what `scripts/install-native-deps.js` downloads). The
versions baked into `node_modules/<pkg>/package.json` are stale placeholders.

Streamlabs-owned native repos live under the **`streamlabs`** GitHub org (note:
NOT `stream-labs` — that redirects). Status legend: ☐ not started · ◑ own-license
confirmed, deep deps pending · ☑ done.

## Step 1 — own (top-level) repo license — DONE

| Status | Module | Ship version | Platforms | Repo (default branch) | Own license |
|---|---|---|---|---|---|
| ◑ | **obs-studio-node** | 0.26.29b3 | win64, osx | streamlabs/obs-studio-node (`staging`) | **GPL-2.0** |
| ◑ | **node-libuiohook** | 1.1.17 | win64, osx | streamlabs/node-libuiohook (`streamlabs`) | **GPL-2.0** |
| ◑ | **node-fontinfo** | 1.1.12 | win64, osx | streamlabs/node-fontinfo (`streamlabs`) | **GPL-3.0** |
| ◑ | **font-manager** | 1.2.10 | win64, osx | streamlabs/font-manager (`streamlabs`) | **MIT** (no LICENSE file in repo; inherited from upstream foliojs/font-manager — confirm) |
| ◑ | **crash-handler** | 1.2.28 | win64, osx | streamlabs/crash-handler (`streamlabs`) | **GPL-2.0** |
| ◑ | **node-window-rendering** | 1.0.20 | osx only | streamlabs/node-window-rendering (`streamlabs`) | **GPL-2.0** |
| ◑ | **game_overlay** | 0.0.63 | win64 only | streamlabs/streamlabs-overlay | **GPL-2.0** |
| ◑ | **color-picker** | 1.3.11 | win64 only | streamlabs/color-picker (`master`) | **GPL-2.0** |
| ◑ | **slobs-vcam-installer** | 1.0.16 | osx only | streamlabs/slobs-virtual-cam-installer (installer, **no license**) → installs streamlabs/slobs-virtual-cam (**GPL-2.0**) | see repo(s) |

### JS deps installed from git (source compiled into bundle, not from npm) — DONE

| Status | Package | Version | Repo | License |
|---|---|---|---|---|
| ☑ | sl-vue-tree | git HEAD | streamlabs/sl-vue-tree (`master`) | **MIT** |
| ☑ | slap | v0.1.83 | streamlabs/slap (`master`) | **MIT** |

> ⚠️ **Compliance note (flag, not a blocker for cataloguing):** most native wrappers
> are **GPL-2.0-only**, while the app itself is **GPL-3.0**. GPL-2.0-only and
> GPL-3.0 are technically incompatible when combined into one work — worth raising
> with legal, but out of scope for this license *inventory*.

## Step 2 — vendored / statically-linked third-party deps — DONE (default-branch HEAD)

Full results in **`scripts/native-deps-audit.csv`** (also the "Native deep deps" tab in the xlsx).
Method: shallow-cloned each repo, inspected `.gitmodules` / CMake / `dependencies/*.node.txt`
(binary import dumps). Ground truth = default-branch HEAD (per decision), so it may
not exactly match the shipped release tags — see caveats below.

- [x] **obs-studio-node** — builds against **libobs `31.1.2ndi1`** (Streamlabs OBS+NDI prebuilt) + Crashpad, nlohmann/json, StackWalker (BSD-2), lib-streamlabs-ipc. libobs bundles the OBS third-party stack (FFmpeg, x264, curl, mbedTLS, …) — enumerated in native-deps-audit, flagged "leveraged".
- [x] **node-libuiohook** — links **libuiohook** (kwhat, dual LGPL-3.0/GPL-3.0)
- [x] **crash-handler** — links **zlib** (Zlib); no Crashpad here
- [x] **streamlabs-overlay** (game_overlay) — Win32 system libs only (Direct2D/UxTheme); no bundled third-party
- [x] **font-manager** — system font APIs only (DirectWrite/CoreText); own MIT
- [x] **node-fontinfo** — statically links **FreeType** (FTL/GPL-2.0)
- [x] **node-window-rendering** — OpenGL (system) only
- [x] **color-picker** — Win32 system libs only; no bundled third-party
- [x] **slobs-virtual-cam** — **FFmpeg** + submodule **obs-virtual-cam** (GPL-2.0)

### ⚠️ Remaining caveats / follow-ups

- [ ] **Reconcile against shipped release tags** — audited default-branch HEAD; shipped
      versions (e.g. osn 0.26.29b3, color-picker 1.3.11) differ from HEAD. Confirm the
      deep-dep set matches the actually-shipped binaries.
- [ ] **NDI SDK** (proprietary) — obs-studio-node's libobs is an "ndi" build; NDI runtime
      is redistributable under the NDI SDK License. Confirm with legal.
- [ ] **OBS bundled stack** — "leveraged" rows should be reconciled with the license
      folder inside the shipped `libobs-31.1.2ndi1` artifact (Qt6 / Python / LuaJIT /
      SVT-AV1 / libaom / libdatachannel presence not yet confirmed for this build).
- [ ] **GPL-2.0-only vs app GPL-3.0** compatibility question (see note above) — legal.
