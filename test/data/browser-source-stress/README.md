# Browser source stress fixtures

Standalone browser source workloads for Streamlabs Desktop tests and manual checks, stored in `test/data/browser-source-stress` outside the existing scene-tree fixtures. The pages use only local files and a Node.js server bound to `127.0.0.1`; there are no packages, remote assets, credentials, or external services. Automated video checks use the bundled VP8 WebM clip derived from `test/data/sources-files/media/alertbox.mp4`. The original H.264 MP4 remains available for a manual codec check.

## Automated Desktop tests

The regular AVA tests start this server on a free loopback port, check its `/chat` route from Node, run a color-source shutdown control, then create native browser sources and wait for page reports showing that JavaScript, media, Canvas rendering, and network work started. The first chat workload runs with shutdown-on-hide disabled, followed by one with it enabled. This separates browser startup from native showing behavior. These tests pass standard Windows profile and system path variables to Desktop and its CEF subprocesses; the WebDriver default environment omits them. On Windows, both browser-source suites disable Electron hardware acceleration in their temporary Desktop profile because the accelerated Electron shutdown path can hang after the browser workloads finish. OSN's browser-source CEF runs separately. Production Desktop settings are unaffected. The separate stress file adds WebGL, repeats Desktop launches against persisted combined and WebGL sources, cycles six visible overlays between scenes, repeatedly creates sources, and runs a media/GPU/network soak. No manual server is needed for these commands. Compile Desktop first using the usual local workflow.

From the repository root:

```powershell
yarn test -m "*Browser source sandbox*"
yarn test:file ./test-dist/test/stress/browser-source-sandbox.js
yarn test:file ./test-dist/test/stress/browser-source-sandbox.js -m "*repeated Desktop launches*"
```

To reproduce the accelerated Electron path on Windows, set `SLOBS_TEST_ENABLE_ELECTRON_HA=1` for the test run:

```powershell
$env:SLOBS_TEST_ENABLE_ELECTRON_HA = '1'
yarn test:file ./test-dist/test/regular/browser-source-sandbox.js -m "*streamer workloads execute*"
Remove-Item Env:SLOBS_TEST_ENABLE_ELECTRON_HA
```

The stress defaults are 30 Desktop relaunches, 12 scene cycles, 40 source creations, and a 90-second soak. Override them for rare failures, for example:

```powershell
$env:SLOBS_BROWSER_SOURCE_LAUNCHES = '100'
yarn test:file ./test-dist/test/stress/browser-source-sandbox.js -m "*repeated Desktop launches*"
Remove-Item Env:SLOBS_BROWSER_SOURCE_LAUNCHES
```

`SLOBS_BROWSER_SOURCE_CYCLES`, `SLOBS_BROWSER_SOURCE_CREATIONS`, and `SLOBS_BROWSER_SOURCE_SOAK_SECONDS` control the other stress tests; the soak requires at least 20 seconds to observe a full video and SSE reconnect. The WebDriver harness tracks the Desktop Electron process it launched and waits for that process during shutdown. This does not enumerate detached CEF children. A passing page report proves that the native source loaded and its JavaScript advanced; it does not prove OBS composited its pixels or that Windows assigned a restricted token/job to the CEF child.

## Start

From this directory in PowerShell:

```powershell
node .\server.js
```

The server prints `http://127.0.0.1:17842/`. Keep the terminal open during a run; press Ctrl+C to stop it. Node.js is the only prerequisite. If port 17842 is occupied, set `$env:PORT = '17843'` before starting and use that port in every URL below.

Each scenario **requires the server**. Opening the HTML files with `file://` cannot exercise the `/api` or media routes. As a separate local-file compatibility baseline, first load the existing `test/data/sources-files/html/hello.html` in a browser source using Desktop's local-file option. Then switch to the HTTP URLs below.

## URLs and load controls

Use these as browser source URLs (replace the port if changed):

| Scenario | URL | Main activity |
| --- | --- | --- |
| Launcher | `http://127.0.0.1:17842/` | Links to all scenarios |
| Chat | `http://127.0.0.1:17842/chat?load=normal` | Repeated message DOM insertion and eviction |
| Alerts | `http://127.0.0.1:17842/alerts?load=normal` | Burst alert cards, local VP8 WebM playback, user-triggered Web Audio tone |
| H.264 probe | `http://127.0.0.1:17842/alerts?load=normal&media=mp4` | Same alert workload with the original MP4; codec support may vary by CEF build |
| Goals | `http://127.0.0.1:17842/goals?load=normal` | CSS ticker/icons and updated SVG/DOM progress |
| Canvas | `http://127.0.0.1:17842/canvas?load=normal` | Continuous particle rendering and HUD |
| WebGL1 | `http://127.0.0.1:17842/webgl?load=normal` | Animated WebGL1 fragment shader, frame/context/renderer status |
| Network | `http://127.0.0.1:17842/network?load=normal` | Local SSE events, planned reconnects, fetch polling |
| Combined | `http://127.0.0.1:17842/combined?load=normal` | Chat, alerts, goals, canvas, and network activity together |

Change `load=normal` to `load=heavy` or `load=extreme`. Unknown values fall back to normal. All presets are bounded:

| Workload | Normal | Heavy | Extreme |
| --- | ---: | ---: | ---: |
| Chat additions / second | 5 | 20 | 50 |
| Maximum retained chat nodes | 80 | 180 | 350 |
| Alert interval | 7 s | 3 s | 1.2 s |
| Maximum visible alerts | 2 | 4 | 7 |
| Goal update interval | 800 ms | 300 ms | 100 ms |
| Canvas particles | 90 | 220 | 450 |
| WebGL1 shader loop steps | 3 | 8 | 16 |
| WebGL1 maximum drawing buffer | 640 × 360 | 960 × 540 | 1280 × 720 |
| Fetch interval | 1.2 s | 500 ms | 200 ms |

The canvas and WebGL1 scenarios request one frame per browser animation frame. The server sends one SSE update per 500 ms per connection and intentionally ends each connection after 12 updates so the browser's reconnect path is visible. Every SSE stream has an 8-second cap, including `drop=0`. The local WebM and optional MP4 are byte-range capable; the video is muted for autoplay compatibility. Its approximately 13-second clip plays independently of alert bursts, shows `ended`, then replays after 2.5 seconds. The **Play test tone** button requires a user interaction (for example, source interaction in Desktop or a regular browser). Autoplay and audio policy may vary; the alert page shows playback status and errors.

## Set up in Streamlabs Desktop

1. Run the local-file `hello.html` baseline, then add a Browser Source with one of the HTTP URLs above. Set the source to 1920 × 1080 or another representative canvas size. The scenario background is transparent; the debug strip and content panels have translucent backgrounds so they remain legible over a scene.
2. Watch the scenario/load ID, wall-clock heartbeat, uptime, and counters in the top strip. Use source interaction for the alert tone button if available. If the strip stops advancing, note the wall-clock time and whether the whole source, only video, or only network activity froze.
3. For hide/show and scene-switch tests, record whether Desktop's source settings shut down a hidden source or keep it active. A shutdown is expected to reset page counters on return. A retained source should keep advancing. Record the setting with each result.

## Manual run matrix

Run normal first, then heavy and extreme if the machine remains responsive. Use Task Manager, Process Explorer, or another external profiler alongside the visible page. Record Desktop/CEF renderer, GPU, and utility process count, working set, and startup latency before and after each step.

| Step | Action | Expected observation / record |
| --- | --- | --- |
| Local-file baseline | Open `hello.html` with the local-file option | Page renders before trying the server-backed fixtures. |
| Cold start | Quit Desktop fully, start server, launch Desktop, open one normal scenario | Source renders; record time to first moving heartbeat and child process creation. |
| One vs many, same URL | Add one source, then 4 sources pointing at the same chat or combined URL | Each visible source updates; note process reuse/churn and memory growth. |
| Many, distinct URLs | Open chat, alerts, goals, canvas, WebGL1, and network together | Each scenario ID and counter advances; inspect renderer/GPU/utility children. |
| WebGL1 GPU path | Open `/webgl` at each preset and watch moving output, frame counter, context status, and renderer string | Frames advance while visible; any unavailable/context-loss state is shown. A renderer string or animation alone cannot prove hardware acceleration; inspect the GPU process and software fallback externally. |
| WebM completion | Keep alerts open beyond one full clip and its 2.5-second replay delay | `Video: ended` appears before the next replay while alert cards continue at preset cadence. |
| H.264 capability | Open `/alerts?load=normal&media=mp4` | Record whether MP4 plays or reports a codec or policy error; the CEF 6613 test build has proprietary codecs disabled. |
| Hide/show | Hide and show each source with shutdown-on-hide both enabled and disabled if available | Record whether uptime persists or resets per configured lifecycle. |
| Scene switch | Switch repeatedly between scenes holding different sources | No stuck old frame; resumed or reloaded counters match lifecycle settings. |
| Refresh | Use Desktop's browser-source refresh/reload control | Heartbeat and counters restart; source returns without persistent blank frame. |
| Connection recovery | With network or combined open, stop server with Ctrl+C, wait for failures, restart `node .\server.js` | Fetch errors/SSE reconnect appear while offline; updates resume after restart. If the document itself reloads while offline, refresh it after restart. |
| Close/reopen | Remove/re-add a source, then quit/relaunch Desktop | New source starts cleanly; child processes exit or settle as expected. |
| Soak | Keep combined and distinct sources running for 30 minutes | Heartbeat and counters keep moving; record memory/process trend and any renderer/GPU/utility crash or restart. |

The page's counters report activity **inside that page only**. They do not measure host CPU, GPU, memory, child process sandbox state, or Windows token/job membership. Use external tools and OS-level inspection for those checks. The fixtures are workload and liveness aids, not a proof of sandbox membership or security isolation.

## Automated liveness reporting

The same pages can report their own activity to a Node test when the URL includes `run=<id>`. The ID must be 1–80 letters, digits, underscores, or hyphens. Without a valid `run` value, the pages make no reporting requests and the manual URLs above behave as before. After page execution begins, each page sends one GET to `/api/report` per second with its run ID, a unique document ID, scenario, uptime, activity counters, and video/WebGL/network status. The `videoEnds` counter increases when the HTML video clip completes, allowing an automated media completion check during a soak run; it is capped at 1,000,000. A new document ID after a reload helps a test distinguish recovery from a stalled page.

The server validates every field and keeps only the latest report for each run in an in-memory `reports` Map, capped at 100 run IDs. Old entries are evicted; nothing is persisted. Node tests can import `{ server, reports, visits, assetRequests }` from `server.js` and bind the server to an ephemeral loopback port. Importing the module does not start the default listener. `visits` records document GETs and report attempts, including the last HTTP status and validation rejection reason, for up to 100 valid run IDs. `assetRequests` counts global `/app.js` and `/style.css` GETs. These diagnostics distinguish absent navigation from a loaded document that never reports; they do not establish host process state or sandbox membership.

On a report timeout, the test error includes a diagnosis, the last accepted report, request counts for that run, and global script/style request counts. `No document request reached the fixture server` means the native browser source did not request its URL from the loopback listener. `Document requested, but no report request reached` means navigation began but the page did not send its heartbeat; inspect script delivery and execution. An HTTP 400 includes the rejected report field. Asset counts are shared across runs, so use the per-run document and report counts when testing several sources together. The regular tests also log native OBS `showing`/`active` state from the worker window and relevant Desktop/OSN log lines on failure. If the color-source control exits cleanly but browser-source shutdown times out, the hang is specific to the browser path.

To retain the temporary Desktop profile and full logs after a failed run, set `SLOBS_KEEP_FAILED_CACHE=1` before running `yarn test:file`. The test prints the retained path. Remove the variable afterward; retained profiles are not deleted automatically. This is useful when the short log excerpt shows a CEF renderer crash or shutdown fails.

## Optional real-provider parity pass

After the deterministic local run, load your own existing chat, alert, and goal overlay URLs in separate browser sources. Trigger real test events using the provider's own controls, try source interaction and audio, then repeat hide/show, scene switch, refresh, and close/reopen. Compare rendering and lifecycle behavior with the local scenarios. Keep tokenized or private overlay URLs out of committed logs, screenshots, and issue attachments.

## Troubleshooting

- A blank source with no debug strip usually means the local server is stopped, the URL/port is wrong, or the source needs refresh after a connection failure.
- A moving strip with `Video: blocked` means playback failed while alert cards still animate. The automated report includes the play rejection name, selected format capability, and media error code. `NotAllowedError` points to playback policy; `NotSupportedError` with `mp4=none` points to codec support. The default WebM route is `http://127.0.0.1:17842/media/alertbox.webm`; the optional H.264 MP4 route is `http://127.0.0.1:17842/media/alertbox.mp4`.
- `SSE reconnecting` is expected briefly on the network and combined pages because the server deliberately ends each stream after 12 messages. Persistent reconnects and fetch errors indicate the server is unavailable.
- `WebGL1 unavailable` or `context lost` is displayed on the WebGL1 page. The page cannot identify whether CEF is using a hardware GPU or a software fallback; inspect the relevant processes externally.
- `load=extreme` is intentionally demanding. Source count multiplies its work; reduce source count or return to normal after gathering the needed observation.
