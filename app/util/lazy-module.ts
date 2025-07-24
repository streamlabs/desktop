export function lazyModule(module: any) {
  return function (target: Object, key: string) {
    const objectKey = `_${key}`;

    Object.defineProperty(target, key, {
      get: () => {
        // TODO: index
        // @ts-ignore
        if (!target[objectKey]) target[objectKey] = new module();
        // TODO: index
        // @ts-ignore
        return target[objectKey];
      },
    });
  };
}
