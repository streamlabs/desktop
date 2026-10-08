# Streamlabs Desktop

[![Build Status](https://dev.azure.com/streamlabs/Streamlabs%20OBS/_apis/build/status/stream-labs.streamlabs-obs?branchName=staging)](https://dev.azure.com/streamlabs/Streamlabs%20OBS/_build/latest?definitionId=1&branchName=staging)

Simple, powerful, and efficient live streaming software built on Electron and OBS.

![Streamlabs Desktop](https://slobs-cdn.streamlabs.com/media/streamlabs-desktop_1920x1050.png)

This application currently only supports OSX 10.14+ and 64-bit Windows.

## Dependencies

### Node.js

Node is required for installing npm packages and for running
various scripts. We recommend the latest LTS release.

https://nodejs.org

### Yarn

We use Yarn as our package manager. We use yarn modern (berry) with
the yarn version checked in to version control. To get the yarn CLI,
we currently recommend installing it with npm:

```
npm install -g yarn
```

### Bash

Some of our scripts assume a bash-like environment. On Windows, we recommend
using Git Bash, which is included with Git for Windows. On macOS, the
default shell should work fine.

### Native Modules

Streamlabs Desktop uses several native C++ modules. These are NPM modules
that live in separate repositories, and are automatically installed as prebuilt
binaries by Yarn. If you are not doing any development on these native modules,
no additional action is required to install native modules.

## Installation

Install all node modules via yarn:

```
yarn install
```

Then, compile assets with webpack:

```
yarn compile
```

Alternatively, you can watch for changes to app files:

```
yarn watch
```

## Starting

You can start the app by running:

```
yarn start
```

## Environment Variables

These variables can be used in development to force certain behavior.

`SLOBS_FORCE_AUTO_UPDATE`: Force the auto-updater to run in development. Normally
this would only run in production.

`SLOBS_CACHE_DIR`: Force a different location for the user data cache directory.

`SLOBS_DISABLE_MAIN_LOGGING`: Disable javascript logging in the main process.

`SLOBS_REPORT_TO_SENTRY`: Report errors to sentry in the dev environment

`SLOBS_PRODUCTION_DEBUG`: Forces dev tools to open when the app starts

## Development

You can open dev tools by clicking the `</>` button on the sidebar.
In the development environment, the titlebar of the main window will
light up red when an exception occurs in any window.

Our app is comprised of several windows, which are essentially separate
copies of the same Javascript app, which are running different pieces
of the code and communicating via Electron IPC.

`worker` - This is a persistent invisible window that runs our entire
services layer.

`main` - This is the main window of the application. It communicates
with the worker window to perform actions.

`child` - This window is always running in the background, and appears
to show windows like Source Properties. It stays always running because
Electron windows can take several seconds to initialize, so we keep it
ready in the background.

There are potentially many other JS runtime processes that can be running
depending on use, for features like Apps, embedded webviews, one-off windows
like projectors, pop-outs etc.

### Sync / Async

Given the heavy reliance on interprocess communication in our application,
we strongly recommend using asynchronous IPC whenever possible. When
accessing a service, calling it as an action will call it asynchronously.

For example the following (synchronous):

```
StreamingService.toggleStreaming()
```

Can be rewritten as (asynchronous):

```
StreamingService.actions.toggleStreaming()
```

The return type of the latter will automatically be `void` as actions
are unable to return values.  In general, receiving information from
services is best done via `views`.  `views` are executed in-window, and
backed by our `vuex` data store, which is replicated across windows.

### Vue / React

We are in the process of migrating from Vue to React. There are many components
of both frameworks in our codebase currently. All new components should be
written in React, and major non-trivial changes to existing Vue components
should be accompanied with a rewrite to React.

We exclusively use functional components in React, relying on the hooks API
for things like component state and lifecycle.

## Contributing

We accept outside contributions, and do our best to respond to Pull Requests.
We ask that all contributors sign a Contributor License Agreement before merging
code. We do not guarantee that all external Pull Requests will be merged, but
we deeply appreciate any and all changes submitted. Thank you for your interest
and contribution.

### Translations

At this time, we are not able to accept translations submitted to GitHub, as we
use a professional translation team that manages translations elsewhere.

## Packaging/Distribution

For Windows:

```
yarn package
```

For macOS:

```
yarn package:mac
```

Note that both of these commands require code signing certificates to be
present in the environment, and in the case of macOS, a valid Apple developer
account for notarization of the app package.

There are some environment variables that can be passed to skip these steps:

`SLOBS_NO_SIGN` Do not attempt to codesign the app package

`SLOBS_NO_NOTARIZE` Do not attempt to notarize the macOS package

## ❤ OBS Developers

At its core, Streamlabs Desktop is powered by the [OBS](https://obsproject.com/)
project. We want to thank all of the developers over at the OBS project for
their years of tireless hard work, without which Streamlabs Desktop wouldn't exist today.
