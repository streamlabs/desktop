import React from 'react';
import { createApp, Dict, inject, ReactModules, Store, TAppContext } from 'slap';
import { getResource, StatefulService } from '../../services';
import { AppServices } from '../../app-services';

/**
 * This module adds reactivity support from Vuex
 * It ensures that React components will be re-rendered when Vuex updates their dependencies
 *
 */
class VuexModule {
  private store = inject(Store);

  /**
   * Keep revisions for each StatefulService module in this state
   */
  private modules: Dict<any> = {};

  init() {
    // make sure the module will be added to the component dependency list
    // when the component is building their dependencies
    StatefulService.onStateRead = serviceName => {
      if (this.store.recordingAccessors) {
        const module = this.resolveState(serviceName);
        this.store.affectedModules[serviceName] = module.state.revision;
      }
    };

    // watch for mutations from the global Vuex store
    // and increment the revision number for affected StatefulService
    StatefulService.store.subscribe(mutation => {
      if (mutation.payload && !mutation.payload.__vuexSyncIgnore) return;
      const serviceName = mutation.type.split('.')[0];
      const module = this.resolveState(serviceName);
      module.incrementRevision();
    });
  }

  /**
   * Create and memoize the state for the stateful service
   */
  private resolveState(serviceName: string) {
    if (!this.modules[serviceName]) {
      const module = this.store.createState(serviceName, {
        revision: 0,
        incrementRevision() {
          this.revision++;
        },
      });
      module.finishInitialization();
      this.modules[serviceName] = module;
    }
    return this.modules[serviceName];
  }
}

// keep initialized modules in the global variable
// until we have multiple React roots
let modulesApp: TAppContext;

// create and memoize the React Modules
function resolveApp() {
  if (modulesApp) return modulesApp;
  const app = createApp({ VuexModule });
  const scope = app.servicesScope;
  scope.init(VuexModule);

  // register Services to be accessible via `inject()`
  Object.keys(AppServices).forEach(serviceName => {
    scope.register(() => getResource(serviceName), serviceName, { shouldCallHooks: false });
  });

  modulesApp = app;
  return modulesApp;
}

/**
 * Creates a root React component with integrated Redux store
 */
export function createRoot(ChildComponent: (props: any) => JSX.Element) {
  return function ReactRoot(childProps: Object) {
    const app = resolveApp();

    return (
      <ReactModules app={app}>
        <ChildComponent {...childProps} />
      </ReactModules>
    );
  };
}
