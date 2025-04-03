import { Service } from 'services/core/service';
import Utils from 'services/utils';
import { ObserveList, StatefulService } from 'services/core';

import * as appServices from './app-services';
import { InternalApiClient } from 'services/api/internal-api-client';

/**
 * This service is initializing in all application windows
 * It keeps collection of all application services and
 * allows to access these services via Dependency Injection pattern.
 * @see Inject() decorator
 * Also it initialize all services with `InitAfter()` decorator
 * @see InitAfter() decorator
 * This is only the service that executes its methods in all widows
 * instead of redirecting the calls to the main window
 */
export class ServicesManager extends Service {
  /**
   * List of used application services
   */
  services: Dictionary<any> = {
    ...appServices,
  };

  /**
   * Stores instances of initialized singleton services
   */
  private instances: Dictionary<Service> = {};

  /**
   * The child windows or one-off windows don't execute services methods directly
   * They use InternalApiClient to send IPC requests to the main window
   */
  internalApiClient: InternalApiClient;

  init() {
    // this helps to debug services from the console
    if (Utils.isDevMode() || process.env.SLOBS_PRODUCTION_DEBUG) {
      window['sm'] = this;
    }

    // Renderer windows access services in the worker window via proxy API
    if (!Utils.isWorkerWindow()) {
      this.internalApiClient = new InternalApiClient();
      // redirect all services methods calls to the main window's services
      Service.setupProxy(service => this.internalApiClient.applyIpcProxy(service));
      // don't call the init method for all services
      Service.setupInitFunction(service => null);
    } else {
      // if it's the worker window, subscribe to serviceAfterInit event
      // to initialize services with `InitAfter()` decorator
      Service.serviceAfterInit.subscribe(service => this.initObservers(service));
    }
  }

  /**
   * Find and initialize all observer-services which subscribed with `InitAfter` decorator
   */
  private initObservers(observableService: Service): Service[] {
    const observeList: ObserveList = ObserveList.instance;
    const items = observeList.observations.filter(item => {
      return item.observableServiceName === observableService.serviceName;
    });
    return items.map(item => this.getService(item.observerServiceName).instance);
  }

  getService(serviceName: string) {
    return this.services[serviceName];
  }

  getStatefulServicesAndMutators(): Dictionary<typeof StatefulService> {
    const statefulServices = {};
    Object.keys(this.services).forEach(serviceName => {
      const ServiceClass = this.services[serviceName];
      if (typeof ServiceClass === 'object') return; // skip AppServices object
      const isStatefulService = ServiceClass['initialState'];
      const isMutator = ServiceClass.prototype.mutations;
      if (!isStatefulService && !isMutator) return;
      statefulServices[serviceName] = this.services[serviceName];
    });
    return statefulServices;
  }

  /**
   * returns Service instance or ServiceHelper instance
   * @example
   * sourcesService = getResource('SourcesService')
   *
   * @example
   * source = getResource('Source[12]')
   */
  getResource(resourceId: string) {
    if (resourceId === 'ServicesManager') {
      return this;
    }

    if (this.services[resourceId]) {
      return this.getInstance(resourceId) || this.initService(resourceId);
    }

    const helperName = resourceId.split('[')[0];
    const constructorArgsStr = resourceId.slice(helperName.length);
    const constructorArgs = constructorArgsStr ? JSON.parse(constructorArgsStr) : void 0;
    return this.getHelper(helperName, constructorArgs);
  }

  private getHelper(name: string, constructorArgs: any[]) {
    const Helper = this.services[name];
    if (!Helper) return null;
    return new (Helper as any)(...constructorArgs);
  }

  private initService(serviceName: string): Service {
    const ServiceClass = this.services[serviceName];
    if (!ServiceClass) throw new Error(`unknown service: ${serviceName}`);
    if (this.instances[serviceName]) return;
    this.instances[serviceName] = ServiceClass.instance;
    return ServiceClass.instance;
  }

  private getInstance(serviceName: string): Service {
    return this.instances[serviceName];
  }
}
