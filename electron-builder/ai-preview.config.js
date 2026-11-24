/**
 * Streamlabs Desktop AI Preview: a build of this branch to hand to someone else, with the AI
 * agent connection (Settings > AI Agents) and unreleased changes.
 *
 * - Its own app: installs next to a regular Streamlabs Desktop without replacing it, with its
 *   own settings and scene collections.
 * - Runs the code in this build: no downloaded UI bundles, no self-update to a public release
 *   (either would replace the unreleased changes).
 *
 *   yarn package:ai-preview
 */
const base = require('./base.config');

base.appId = 'com.streamlabs.slobsaipreview';
base.productName = 'Streamlabs Desktop AI Preview';
base.extraMetadata.name = 'slobs-client-ai-preview';
base.win.executableName = 'Streamlabs OBS AI Preview';
base.win.extraFiles.push(
  { from: 'electron-builder/force-local-bundles', to: 'force-local-bundles' },
  { from: 'electron-builder/skip-auto-update', to: 'skip-auto-update' },
);

module.exports = base;
