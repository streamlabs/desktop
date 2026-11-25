# Vue UI removal plan

Goal: no Vue UI left in the app. Every window mounts React directly, and `app/components/` is gone.

## Scope

**In scope:**
- All `.vue` / `.vue.ts` files and all Vue-TSX files under `app/components/`.
- The root `new Vue({...})` in `app/app.ts`.
- Vue UI-only packages and tooling.

**Out of scope (known leftovers):**
- `vue` / `vuex`: Vuex-backed `StatefulService`s, `Vue.set` / `Vue.delete`, the cross-window store sync. These go away with the Realm migration.
- `vue-i18n`: it sits behind `$t` / `$te`.
- The updater UI (`updater/UpdaterWindow.vue`, `updater/mac/`) and therefore `vue-loader`.
- `slap`. It is a React state/DI library and stays. The new React root keeps wrapping windows in `createRoot()` (`ReactModules` + `VuexModule`).

## Rules

- **Feature parity.** Port behavior one-for-one and don't drop features. Flags stay functional; for example `legacyAlertbox` keeps a working legacy AlertBox, now in React.
- **Tests first.** Write e2e tests that pass on the Vue UI, then migrate without changing the tests.
- **Framework-agnostic tests.** Use only selectors that work on both stacks:
  - `label=`, `button=`
  - `[data-name]`, `[data-type]`, `[data-role=input]`, `[data-testid]`
  
  Prefer checking values through the API (`getApiClient()`). Don't use `FormMonkey`, `.multiselect*`, `.vue-slider*` or `.ant-*`.
- **Code style.** New UI follows `app/components-react` conventions:
  - `ModalLayout`, `Services`, `useVuex`, `useChildWindowParams`
  - `WidgetModule` + `WidgetLayout` for widgets
  - `shared/inputs` + `ObsForm` for forms
  - `.m.less` CSS modules, `$t` for strings
- **Verification.** `yarn typecheck` and `yarn eslint` for every change, plus the relevant `yarn test:file`.

## Inventory

| Group | Files | Entry point | React equivalent | Action |
|---|---|---|---|---|
| Dead | `widgets/Credits.vue.ts`, `widgets/TipJar.vue.ts`, `services/widgets/settings/{credits,tip-jar}.ts`, `shared/RealmReactive.ts`, `components-react/shared/VueComponent.tsx`, `SyncWithValue` (app-decorators), Vue `shared/modals/*` + `WindowsService.showModal/showMessageBox/hideModal`, `vue-js-modal`, `vue-toasted` | none | n/a | Delete (phase 0) |
| Small windows | `OverlayPlaceholder`, `GameOverlayEventFeed`, `EventFilterMenu`, `BrowserSourceInteraction`, `FFZSettings` | game overlay, recent events, Interact, Appearance/chat | partial | Port (phase 2) |
| Source properties | `windows/SourceProperties.vue` (`SourcePropertiesDeprecated`), `obs/inputs/*`, `GenericForm`, `custom-source-properties/*` | `sources.ts` `showSourceProperties` / `showPlatformAppPage` | `components-react/windows/SourceProperties.tsx`, `ObsForm` (missing FONT and EDITABLE_LIST, and no custom-panel slot) | Port (phase 3) |
| Widgets | `MediaShare.tsx`, `Poll.tsx`, `ChatHighlight.tsx`, `AlertBox.vue` (legacy), `WidgetEditor`, `WidgetSettings.vue.ts`, `CodeEditor`, `CustomFieldsEditor`, `widgets/inputs/*` | `sources.ts` `showWidgetProperties` | `WidgetWindow` (no MediaShare, Poll, ChatHighlight or legacy AlertBox) | Port, all four (phase 4) |
| Shared Vue inputs/layout | `shared/inputs/*`, `ModalLayout.vue`, `Tabs.vue`, `Selector.vue`, `Scrollable.tsx` | consumers above | `components-react/shared/*` | Delete after consumers (phase 6) |
| Shell | `windows/Main.tsx`, `ChildWindow.tsx`, `OneOffWindow.vue`, `shared/ReactComponent*.tsx`, `tsx-component.ts`, `app/jsx.d.ts` | `app.ts` | React `Main` | Rewrite and mount React directly (phase 5) |

Non-UI code under `app/components/` that must be relocated (phase 0):
- `obs/inputs/ObsInput.ts`: types and helpers, about 40 importers. Move them to `services/sources/obs-properties.ts`.
- `metadata` / `formMetadata` helpers in `shared/inputs/index.ts` and `widgets/inputs/inputs.ts`. Services import these.
- `shared/inputs/BoolButtonInput.m.less`. React `BoolButtonInput` imports it.

## DOM contract that React ports must keep (the phase 1 tests depend on it)

- **Every OBS input:** `data-role=input`, `data-name=<obs property name>`, and a `data-type` that has a test controller. Each visible property description renders as a `<label>`.
- **List:** `data-option-list`, `data-option-label`, `data-option-value`, `data-selected-option-label`, `data-loading`.
- **Slider:** `data-value`, plus a number box.
- **Color:** an editable `#rrggbb` text input.
- **Bool:** `data-name` plus a checkbox.
- **Font:** `font_face` (list), `font_style` (list) and `font_size` (slider), with the labels "Use Google Font", "Font Family", "Font Style", "Font Size".
- **Editable list:** `data-type=editable-list`, `data-value` = JSON array of paths, and item text containing the file basenames.
- **Widgets:** the label texts and the UI marker texts ("Try the new simplified AlertBox settings" / "Looking for the old AlertBox settings?") must be preserved.
- **Cleanup:** the Vue-only branch in `test/helpers/modules/forms/color.ts` (`.vc-sketch`) can be removed after phase 3.

## Phases

| # | Phase | Status |
|---|---|---|
| 0 | Delete dead code; relocate non-UI types, helpers and styles out of `app/components/` (new homes: `services/sources/obs-properties.ts`, `util/input-metadata.ts`, `services/widgets/widget-input-metadata.ts`). `vue-toasted` is deferred to phase 4, because the legacy widget editor still uses it | done (uncommitted) |
| 1 | Framework-agnostic e2e coverage tests, green on Vue. `test/regular/source-properties/{obs-inputs,per-type}.ts`: 20/20 pass on Vue. Widgets (`media-share`, `poll`, `chat-highlight`, `alertbox-legacy`), windows (`event-filter-menu`, `browser-source-interaction`, `ffz-settings`), `streamlabels` and `platform-app-properties` compile but have not run yet (they need `SLOBS_TEST_USER_POOL_TOKEN`). Helpers are in `test/helpers/modules/{source-properties,widgets-ui}.ts` and `forms/*` | done (uncommitted) |
| 2 | Port the small windows | todo |
| 3 | Source properties: `ObsFontInput` + `ObsEditableListInput` in `ObsForm`; custom-panel slot; port `StreamlabelProperties` and `PlatformAppProperties`; enable `reactSourceProps` per type; delete `SourcePropertiesDeprecated` | todo |
| 4 | Widgets: React MediaShare, Poll, ChatHighlight and LegacyAlertBox (flag preserved); delete `WidgetEditor` and the related files | todo |
| 5 | Shell: React ChildWindow and OneOffWindow, `getComponents()` out of `WindowsService`, React root in `app.ts` (spike `createRoot(Main)` first) | todo |
| 6 | Cleanup: remaining Vue files, `Vue.use(VTooltip/VeeValidate)`, Sentry `Integrations.Vue`, Vue UI packages, babel Vue JSX preset, `vue-tsx-support` types, `eslint-plugin-vue` | todo |
