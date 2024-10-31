import { IJsonRpcRequest, IJsonRpcResponse } from 'services/api/jsonrpc';
import { RpcApi } from './rpc-api';

/**
 * Internal SLOBS API for usage inside SLOBS itself
 * This API is using by Child-window, one-offs windows and tests
 */
export class InternalApiService extends RpcApi {
  getResource(resourceId: string) {
    // return the resource instance directly from ServicesManager
    return this.servicesManager.getResource(resourceId);
  }

  /**
   * Adds extra logic for errors handling
   * @override
   */
  protected onErrorsHandler(
    request: IJsonRpcRequest,
    errors: (string | Error)[],
  ): IJsonRpcResponse<any> {
    // the errors for the child-window API are anomaly
    // re-raise error for Raven to log these errors
    errors
      .filter(e => e instanceof Error)
      .forEach(e => {
        const isChildWindowRequest = request.params && request.params.fetchMutations;
        if (isChildWindowRequest) {
          setTimeout(() => {
            throw e;
          }, 0);
        }
      });

    // we are not going to change the response
    return super.onErrorsHandler(request, errors);
  }
}
