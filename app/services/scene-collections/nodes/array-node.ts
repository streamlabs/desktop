import { compact } from 'lodash';
import { Node } from './node';

interface IArraySchema<TSchema> {
  items: TSchema[];
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
      } catch (e) {
        console.error('Array node step failed', e);
      }
    }

    for (const cb of afterLoadItemsCallbacks) {
      if (cb) {
        try {
          await cb();
        } catch (e) {
          console.error('Array node callback failed', e);
        }
      }
    }
  }

  /**
   * Can be called before loading to do some data munging
   * @param context the context
   */
  async beforeLoad(context: TContext): Promise<void> {}
}
