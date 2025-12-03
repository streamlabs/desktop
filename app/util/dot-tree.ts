export type Prettify<T> = { [K in keyof T]: T[K] } & {};

type LeafPaths<T, Leaf = never> = T extends object
  ? {
      [K in Extract<keyof T, string>]: NonNullable<T[K]> extends Leaf
        ? `${K}` // stop at custom leaf
        : NonNullable<T[K]> extends object
        ? `${K}.${LeafPaths<NonNullable<T[K]>, Leaf>}` // dive
        : `${K}`; // primitive leaf
    }[Extract<keyof T, string>]
  : never;

type DotMap<T extends object, Leaf = never> = {
  [P in LeafPaths<T, Leaf>]: Leaf;
};

// 1) Custom leaf via type guard (more specific — listed first)
// Example usage: const dot = toDotNotation(profile, (value): value is Date => value instanceof Date);
export function toDotNotation<T extends object, Leaf>(
  obj: T,
  isLeaf: (v: unknown) => v is Leaf,
  prefix?: string,
): Prettify<DotMap<T, Leaf>>;

// 2) Default case: just a boolean predicate (or omitted)
// Example usage: const dot = toDotNotation({ user: { id: 7, name: "Ada" } });
export function toDotNotation<T extends object>(
  obj: T,
  isLeaf?: (v: unknown) => boolean,
  prefix?: string,
): Prettify<DotMap<T, never>>;

export function toDotNotation<T extends object, Leaf>(
  obj: T,
  isLeaf: ((v: unknown) => v is Leaf) | ((v: unknown) => boolean) = v =>
    ['string', 'number'].includes(typeof v),
  prefix = '',
) {
  const res: Record<string, unknown> = {};

  for (const key of Object.keys(obj) as Array<keyof T & string>) {
    const value = obj[key as keyof T] as unknown;
    const newKey = prefix ? `${prefix}.${key}` : key;

    if (value === undefined) continue;

    if (isLeaf(value)) {
      res[newKey] = value as Leaf;
    } else if (value && typeof value === 'object' && !Array.isArray(value)) {
      Object.assign(res, toDotNotation(value as object, isLeaf as any, newKey));
    }
  }

  return res;
}

// Builds a nested object back from dot notation entries.
// Example usage: const tree = fromDotNotation<typeof profile>(dotProfile);
export function fromDotNotation<T extends object>(dot: DotMap<T, any>): Prettify<T>;
export function fromDotNotation(dot: Record<string, unknown>): Record<string, unknown>;
export function fromDotNotation(dot: Record<string, unknown>): unknown {
  const root: Record<string, unknown> = {};

  for (const [path, value] of Object.entries(dot)) {
    if (!path) continue;

    const segments = path.split('.');
    let cursor: Record<string, unknown> = root;

    for (let index = 0; index < segments.length; index++) {
      const segment = segments[index]!;
      if (!segment) {
        throw new TypeError(`Invalid path "${path}" contains empty segment.`);
      }

      if (index === segments.length - 1) {
        cursor[segment] = value;
        continue;
      }

      const existing = cursor[segment];
      if (existing === undefined) {
        const branch: Record<string, unknown> = {};
        cursor[segment] = branch;
        cursor = branch;
      } else if (existing !== null && typeof existing === 'object' && !Array.isArray(existing)) {
        cursor = existing as Record<string, unknown>;
      } else {
        throw new TypeError(
          `Cannot expand path "${path}" because "${segments
            .slice(0, index + 1)
            .join('.')}" is already a non-object value.`,
        );
      }
    }
  }

  return root;
}
