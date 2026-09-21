/**
 * All resources for external-api must be registered in this file
 */

export * from './sources';
export * from './scenes';
export * from './selection';
export * from './streaming';
export * from './scene-collections';
export * from './audio';
export * from './notifications';
export * from './performance';
export * from './transitions';
export * from './game-overlay';
export * from './recent-events';
export * from './customization';

/**
 * NOT part of the documented external API — do not build against this.
 *
 * `EditorCommandsService.executeCommand` is reachable over the JSON-RPC API via the
 * InternalApiService fallback, and rpc-api.ts deserializes `{_type: 'HELPER'}` arguments
 * back into resources. That is enough to drive the commands whose constructors take only
 * primitives, but not the ones taking a Selection (every transform, reorder, group and
 * node-removal command) — because `Selection` resolves to the *external* helper, which has
 * no `state` and whose `freeze()` writes to the fallback proxy instead of the real object.
 *
 * Registering the internal class under a distinct key lets a caller address a genuine
 * Selection, so those commands run exactly as the UI runs them, with working undo.
 */
export { Selection as InternalSelection } from 'services/selection';
