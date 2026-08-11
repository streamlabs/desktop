import { Node } from './node';
import compact from 'lodash/compact';

interface IArraySchema<TSchema> {
  items: TSchema[];
}

let strictLoadErrors: unknown[] | null = null;

export class StrictArrayNodeLoadError extends Error {
  constructor(readonly errors: unknown[]) {
    super(`Legacy scene collection load failed in ${errors.length} array node step(s)`);
    this.name = 'StrictArrayNodeLoadError';
  }
}

export async function loadArrayNodesStrictly(load: () => Promise<void>): Promise<void> {
  const parentErrors = strictLoadErrors;
  const errors: unknown[] = [];
  strictLoadErrors = errors;
  try {
    await load();
  } finally {
    strictLoadErrors = parentErrors;
  }
  if (errors.length) throw new StrictArrayNodeLoadError(errors);
}

export abstract class ArrayNode<TSchema, TContext, TItem> extends Node<
  IArraySchema<TSchema>,
  TContext
> {
  abstract saveItem(item: TItem, context: TContext): Promise<TSchema>;

  abstract loadItem(item: TSchema, context: TContext): Promise<(() => Promise<void>) | void>;

  abstract getItems(context: TContext): TItem[];

  async save(context: TContext): Promise<void> {
    const values = await Promise.all(
      this.getItems(context).map(item => {
        return this.saveItem(item, context);
      }),
    );

    this.data = { items: compact(values) };
  }

  async load(context: TContext): Promise<void> {
    await this.beforeLoad(context);

    const afterLoadItemsCallbacks: (void | (() => Promise<void>))[] = [];

    if (!this.data.items) return;

    for (const item of this.data.items) {
      try {
        afterLoadItemsCallbacks.push(await this.loadItem(item, context));
      } catch (e: unknown) {
        console.error('Array node step failed', e);
        strictLoadErrors?.push(e);
      }
    }

    for (const cb of afterLoadItemsCallbacks) {
      if (cb) {
        try {
          await cb();
        } catch (e: unknown) {
          console.error('Array node callback failed', e);
          strictLoadErrors?.push(e);
        }
      }
    }

    await this.afterLoad(context);
  }

  /**
   * Will be called before loading to do some data munging
   * @param context the context
   */
  async beforeLoad(context: TContext): Promise<void> {}

  /**
   * Will be called after all items are loaded
   * @param context the context
   */
  async afterLoad(context: TContext): Promise<void> {}
}
