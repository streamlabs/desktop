---
applyTo: 'app/services/streaming/**,app/services/platforms/**,app/services/dual-output/**'
---

# Dual Stream Invariants

"Dual Stream" lets a single platform go live in Dual Output on both the horizontal and vertical displays at once. Twitch dual stream and YouTube dual stream are **separate implementations with different mechanics**. Do not reason about one from the other, and do not assume a platform appearing in an analytics/read-model getter proves a real destination was created.

## Twitch and YouTube dual stream are not implemented the same

`app/services/platforms/twitch.ts` `setupDualStream` only calls `settingsService.setEnhancedBroadcasting(true)` — it creates no destination, no second key, no second broadcast. Twitch's own backend splits one ingest into both displays server-side (`streaming-view.ts`'s `isVerticalTwitchDualStream` doc comment: "Twitch dual stream uses only the horizontal stream to go live because the backend sends both the horizontal and vertical streams in a single request").

`app/services/platforms/youtube.ts` `setupDualStream` makes real YouTube API calls to create a second, independent broadcast/stream/key, appends it to `customDestinations` as an
`ICustomStreamDestination` with `dualStream: true`, and only then calls `streamSettingsService.setSettings(...)` to point the vertical OBS context at it.

When reviewing a change to one platform's dual stream code, do not describe the other platform's mechanism, and do not assume a fix or guard needed for one is needed for the other.

## `dualStream: true` destinations (aka custom destinations) are deliberately excluded from destination-facing getters

`StreamingView.activeDisplayDestinations` (`streaming-view.ts`) filters out any `ICustomStreamDestination` with `dualStream: true` — this is what keeps the YouTube-generated vertical destination from appearing in the user-facing destination list. The same filter applies inside `verticalStream`.

Separately, `activeDisplayPlatforms.vertical` (and therefore `verticalStream`, which concatenates the two) includes a platform's own name whenever `isDualStreaming(platform)` is true (e.g. whenever `settings.platforms[platform].display === 'both'`) regardless of whether that platform's `setupDualStream` actually succeeded. This is by design, for analytics.

When reviewing a diff that touches dual stream: do not treat a platform appearing in `verticalStream` / `activeDisplayPlatforms.vertical` / `hasDualStream` as evidence that a destination-creation failure is unguarded, and do not treat a `dualStream: true` destination's absence from `activeDisplayDestinations` as a bug — both are the intended behavior. To check whether a failed `setupDualStream` actually leaves the vertical OBS context without a stream key, read that platform's own `setupDualStream` and its caller's try/catch (YouTube's is wrapped in `youtube.ts` `beforeGoLive`, which catches the error and posts "Vertical stream not started" before any `streamSettingsService.setSettings` call for the vertical display can run).
