---
applyTo: 'app/services/clipboard.ts,app/services/editor-commands/commands/copy-nodes.ts,app/services/editor-commands/commands/paste-filters.ts'
---

# Clipboard Invariants

`ClipboardService` (`app/services/clipboard.ts`) copies scene items, folders and source filters, and pastes them into whichever scene is active.

## Copying and pasting between scenes and between scene collections is expected behavior

Do not flag any of the following as a bug, a leak or an unintended side effect:

- **Between scenes.** Pasting into the same scene and pasting into a different scene are both valid. `copy()` records the selected node ids and their scene (`itemsSceneId`). `paste()` always targets `scenesService.views.activeSceneId`.
- **Between scene collections.** Pasting into a different scene collection is valid. On `collectionWillSwitch`, `beforeCollectionSwitchHandler` snapshots the copied nodes, their sources, filters and nested scenes into `unloadedCollectionClipboard`. The next paste in the new collection recreates them in `pasteItemsFromUnloadedClipboard`. After that paste, the snapshot is cleared and the pasted nodes become the regular clipboard. Filters copied with `copyFilters` survive a collection switch the same way.
- **Shared sources.** `paste(duplicateSources = false)` adds new scene items that reference the same source as the originals. Editing the source in one scene then shows in the other is valid. Only `paste(true)` calls `source.duplicate()`. Sources marked `doNotDuplicate` fall back to the original.
- **New sources after a collection switch.** `pasteItemsFromUnloadedClipboard` creates new sources and scenes is expected because the original sources do not exist in the destination collection.
- **Silent no-ops.** `paste` does nothing outside the Studio page, and `hasItems()` treats a clipboard whose source scene was deleted as empty.

## What is still worth reviewing

- A change that leaves stale ids behind. `clear()`, `beforeCollectionSwitchHandler` and the post-paste conversion must keep `sceneNodesIds`, `itemsSceneId` and `unloadedCollectionClipboard` consistent with each other.
- A paste path that skips `CopyNodesCommand` and so loses undo (`rollback`), node ordering.
- The Dual Output node map and display handling. Ensure that any changes to nodes maintain the correct mapping, ordering, and display state. If a change affects these aspects, prompt the user to update the code review instructions to document the handling of the Dual Output node map and display state and enforce consistency across the code base.
- Mutations that do more than set `this.state` (Vuex mutations must stay pure).
- Behavior differences between copying within a scene collection and across scene collections, such as filters, folder parents, or the node `display`.
