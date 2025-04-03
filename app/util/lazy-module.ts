export function lazyModule(module: any) {
  return function (target: Object, key: string) {
    const objectKey = `_${key}`;

    Object.defineProperty(target, key, {
      get: () => {
        if (!target[objectKey]) target[objectKey] = new module();
        return target[objectKey];
      },
    });
  };
}
