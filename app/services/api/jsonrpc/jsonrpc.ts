import { Service } from 'services/core/service';
import uuid from 'uuid/v4';
import {
  E_JSON_RPC_ERROR,
  IJsonRpcEvent,
  IJsonRpcRequest,
  IJsonRpcResponse,
  IJsonrpcServiceApi,
} from './jsonrpc-api';

export class JsonrpcService extends Service implements IJsonrpcServiceApi {
  static createError(
    requestOrRequestId: string | IJsonRpcRequest,
    options: { code: E_JSON_RPC_ERROR; message?: string },
  ): IJsonRpcResponse<any> {
    /* eslint-disable */
    const id =
      arguments[0] && typeof arguments[0] === 'object'
        ? (arguments[0] as IJsonRpcRequest).id
        : arguments[0];
    /* eslint-enable */
    return {
      id,
      jsonrpc: '2.0',
      error: {
        code: options.code,
        // tslint:disable-next-line:prefer-template
        message: E_JSON_RPC_ERROR[options.code] + (options.message ? ' ' + options.message : ''),
      },
    };
  }

  static createRequest(resourceId: string, method: string, ...args: any[]): IJsonRpcRequest {
    return {
      method,
      jsonrpc: '2.0',
      id: uuid(),
      params: {
        args,
        resource: resourceId,
      },
    };
  }

  static createRequestWithOptions(
    resourceId: string,
    method: string,
    options: { compactMode: boolean; fetchMutations: boolean },
    ...args: any[]
  ): IJsonRpcRequest {
    const request = this.createRequest(resourceId, method, ...args);
    request.params = { ...request.params, ...options };
    return request;
  }

  static createResponse<TResult>(
    requestOrRequestId: string | IJsonRpcRequest,
    result: TResult = null,
  ): IJsonRpcResponse<TResult> {
    /* eslint-disable */
    const id =
      arguments[0] && typeof arguments[0] === 'object'
        ? (arguments[0] as IJsonRpcRequest).id
        : arguments[0];
    /* eslint-enable */
    return { id, result, jsonrpc: '2.0' } as IJsonRpcResponse<TResult>;
  }

  static createEvent(options: {
    emitter: 'PROMISE' | 'STREAM';
    resourceId: string;
    data: any;
    isRejected?: boolean;
  }): IJsonRpcResponse<IJsonRpcEvent> {
    return this.createResponse<IJsonRpcEvent>(null, {
      _type: 'EVENT',
      ...options,
    });
  }

  createError(
    requestOrRequestId: string | IJsonRpcRequest,
    options: { code: E_JSON_RPC_ERROR; message?: string },
  ): IJsonRpcResponse<any> {
    // eslint-disable-next-line
    return JsonrpcService.createError.apply(this, arguments as any);
  }

  createRequest(resourceId: string, method: string, ...args: any[]): IJsonRpcRequest {
    // eslint-disable-next-line
    return JsonrpcService.createRequest.apply(this, arguments as any);
  }

  createRequestWithOptions(
    resourceId: string,
    method: string,
    options: { compactMode: boolean; fetchMutations: boolean },
    ...args: any[]
  ): IJsonRpcRequest {
    // eslint-disable-next-line
    return JsonrpcService.createRequestWithOptions.apply(this, arguments as any);
  }

  createResponse<TResult>(
    requestOrRequestId: string | IJsonRpcRequest,
    result: TResult,
  ): IJsonRpcResponse<TResult> {
    // eslint-disable-next-line
    return JsonrpcService.createResponse.apply(this, arguments as any) as any;
  }

  createEvent(options: {
    emitter: 'PROMISE' | 'STREAM';
    resourceId: string;
    data: any;
    isRejected?: boolean;
  }): IJsonRpcResponse<IJsonRpcEvent> {
    // eslint-disable-next-line
    return JsonrpcService.createResponse.apply(this, arguments as any) as any;
  }
}
