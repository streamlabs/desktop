export enum OS {
  Windows = 'win32',
  Mac = 'darwin',
}

type TOSHandlerMap<TReturn> = { [os in OS]: (() => TReturn) | TReturn };

export function byOS<TReturn>(handlers: TOSHandlerMap<TReturn>): TReturn {
  // TODO: index
  // @ts-ignore
  const handler = handlers[process.platform];

  if (typeof handler === 'function') return handler();

  return handler;
}

export function getOS() {
  return process.platform as OS;
}
