import { Service } from 'services';
import Realm, { PropertyTypeName } from 'realm';
import path from 'path';
import * as remote from '@electron/remote';
import { ExecuteInCurrentWindow } from './core';

/**
 * This class is our extension of the Realm.Object class.
 * The reason it doesn't sublass Realm.Object directly is
 * because Realm does not support inheritance properly.
 * Therefore, we use a workaround involving a wrapper object
 * and dynamically defining properties.
 */
export class RealmObject {
  /**
   * Internal reference to realm model
   */
  private _realmModel: Realm.Object;

  /**
   * Returns a reference to the realm db this object is stored in
   */
  get db() {
    return (RealmService.instance as RealmService).getDb(this);
  }

  /**
   * Serializable id string as hex
   */
  get idString() {
    // TODO: index
    // @ts-ignore
    return this.realmModel['_id'].toHexString();
  }

  /**
   * Public accessor for the underlying Realm model.
   * Implemented as a getter because this class can be created
   * before the database connection is established.
   */
  get realmModel() {
    if (!RealmService.hasInstance) {
      throw new Error('Realm service does not exist!');
    }

    if (!this.db) {
      throw new Error('Realm is not connected!');
    }

    if (!this._realmModel) {
      // Check the db
      let result = this.db.objects(this.schema.name);

      // Filter by id if present
      if (this._initWithId) {
        result = result.filtered('_id == $0', this._initWithId);
      }

      if (result.length) {
        this._realmModel = result[0];
      } else {
        if (this._initWithId) {
          throw new Error(`Object with id does not exist: ${this._initWithId}`);
        }

        // TODO: Make this better
        // We might already be in a write transaction
        try {
          this.db.write(() => {
            this._realmModel = this.db.create(this.schema.name, {});
          });
        } catch (e: unknown) {
          this._realmModel = this.db.create(this.schema.name, {});
        }

        this.onCreated();
      }
    }

    return this._realmModel;
  }

  /**
   * Synchronous hook for performing an operation after initial create
   * in the database.  This is useful for migrating from StatefulService.
   */
  protected onCreated() {}

  /**
   * This function is useful for binding a bunch of attributes reactively
   * to objects in Realm. This is mostly useful for Vue class components.
   * @param target The target object to bind to
   * @param bindings A map of target keys to realm keys
   * @returns An unbind function
   * @deprecated Don't use this for new components or outside the context
   * of Vue as it has bad type checking semantics. If you think you need this,
   * come up with something better.
   */
  bindProps(target: Object, bindings: Dictionary<string>) {
    const setProps = () => {
      Object.keys(bindings).forEach(key => {
        // TODO: index
        // @ts-ignore
        target[key] = this[bindings[key]];
      });
    };

    setProps();

    this.realmModel.addListener(setProps);

    return () => {
      this.realmModel.removeListener(setProps);
    };
  }

  /**
   * Useful for patching objects that have embedded objects
   * @param patch A deep patch
   */
  deepPatch(patch: DeepPartial<this>) {
    Object.keys(patch).forEach(key => {
      if (!patch.hasOwnProperty(key)) return;
      if (key === '__proto__' || key === 'constructor') return;

      // TODO: index
      // @ts-ignore
      const val = this[key];

      if (val instanceof RealmObject) {
        // TODO: index
        // @ts-ignore
        val.deepPatch(patch[key]);
      } else {
        // TODO: index
        // @ts-ignore
        this[key] = patch[key];
      }
    });
  }

  toObject() {
    const obj = {};

    Object.keys(this.schema.properties).forEach(key => {
      // TODO: index
      // @ts-ignore
      const val = this[key];

      if (val instanceof RealmObject) {
        // TODO: index
        // @ts-ignore
        obj[key] = val.toObject();
      } else {
        // TODO: index
        // @ts-ignore
        obj[key] = val;
      }
    });

    return obj;
  }

  /**
   * Deletes this model in the database and restores defaults
   */
  reset() {
    this.db.write(() => {
      this.db.delete(this.realmModel);
    });
    this._realmModel = null;
  }

  private _initWithId: Realm.BSON.UUID;

  constructor(public schema: Realm.ObjectSchema, id?: Realm.BSON.UUID, realmModel?: Realm.Object) {
    this._initWithId = id;
    this._realmModel = realmModel;

    // Apply dynamic getters
    Object.keys(this.schema.properties).forEach(key => {
      Object.defineProperty(this, key, {
        get() {
          const val = this.realmModel[key] as unknown;

          if (val instanceof Realm.Object) {
            const dataType = this.schema.properties[key];
            // Realm type can be either a string or a nested object with a `type` property or an `objectType`
            // property in the case of referential schemas
            let type = typeof dataType === 'string' ? dataType : dataType.type;
            if (dataType.objectType) type = dataType.objectType;
            const klass = RealmService.registeredClasses[type];
            return klass.fromRealmModel(val);
          }

          return this.realmModel[key];
        },
        set(val: any) {
          if (val instanceof RealmObject) {
            this.realmModel[key] = val.realmModel;
          } else {
            this.realmModel[key] = val;
          }
        },
      });
    });
  }

  static inject<T = RealmObject>(this: { new (schema: any): T } & typeof RealmObject) {
    if (!RealmService.databaseMappings[this.schema.name]) {
      throw new Error(
        `Tried to inject \`${this.schema.name}\` before it was registered! Did you call \`${this.schema.name}.register()\` immediately after defining the class?`,
      );
    }

    return new this(this.schema);
  }

  static register<T extends typeof RealmObject>(this: T, opts: IRealmOptions = {}) {
    if (RealmService.databaseMappings[this.schema.name]) {
      throw new Error(`\`${this.schema.name}\` was registered twice!`);
    }

    // Make sure every object has a unique id
    this.schema.properties['_id'] = { type: 'uuid', default: new Realm.BSON.UUID() };

    const schema = this.schema;

    // This is jumping around some hoops because Realm is extremely picky
    // about the name and base class of its object models.
    const klass = {
      [this.schema.name]: class extends Realm.Object {
        static schema = schema;
      },
    };

    // TypeScript doesn't love metaprogramming
    RealmService.registerObject(
      (klass[this.schema.name] as unknown) as typeof Realm.Object,
      this,
      opts.persist,
    );
  }

  static fromId(id: string) {
    const uuid = Realm.BSON.UUID.createFromHexString(id);
    return new this(this.schema, uuid);
  }

  static fromRealmModel(model: Realm.Object) {
    return new this(this.schema, undefined, model);
  }

  /**
   * Inheriting classes should define this in Realm schema format.
   * @see https://www.mongodb.com/docs/realm/sdk/node/model-data/define-a-realm-object-model/
   */
  static schema: Realm.ObjectSchema;

  /**
   * Subclasses should override this function to perform migrations
   * @param oldRealm A reference to the old realm
   * @param newRealm A new realm matching the new schema
   */
  static onMigration(oldRealm: Realm, newRealm: Realm) {
    // By default, is a no-op
  }

  static build<TInit extends object>(
    name: string,
    initObject: TInit,
  ): () => DynamicRealmObject<TInit> {
    const propMap: { [key: string]: { type: PropertyTypeName; default: any } } = {};

    const klass = class extends RealmObject {};

    Object.keys(initObject).forEach(k => {
      const descriptor = Object.getOwnPropertyDescriptor(initObject, k);

      // TODO: index
      // @ts-ignore
      if (typeof initObject[k] === 'function' || descriptor.get) {
        Object.defineProperty(klass.prototype, k, descriptor);
      } else {
        // TODO: index
        // @ts-ignore
        const t = typeof initObject[k];

        // All else are schema properties
        if (t === 'number') {
          // TODO: index
          // @ts-ignore
          propMap[k] = { type: 'double', default: initObject[k] };
        } else if (t === 'boolean') {
          // TODO: index
          // @ts-ignore
          propMap[k] = { type: 'bool', default: initObject[k] };
        } else if (t === 'string') {
          // TODO: index
          // @ts-ignore
          propMap[k] = { type: 'string', default: initObject[k] };
        }

        // TODO: Support dates?
      }
    });

    klass.schema = {
      name,
      properties: propMap,
    };

    klass.register();

    return () => klass.inject() as any;
  }
}

type DynamicRealmObject<TInit extends object> = RealmObject & TInit;

interface IRealmOptions {
  persist?: boolean;
}

// WARNING: When you increment this number, you are responsible for
// implementing a migration that handles the data change!
const REALM_SCHEMA_VERSION = 2;

export class RealmService extends Service {
  persistentDb: Realm;
  ephemeralDb: Realm;

  get ephemeralConfig() {
    const realmPath = path.join(remote.app.getPath('userData'), 'ephemeral.realm');

    return {
      schema: RealmService.ephemeralSchemas,
      path: realmPath,
      inMemory: true,
    };
  }

  get persistentConfig() {
    const realmPath = path.join(remote.app.getPath('userData'), 'persistent.realm');

    return {
      schema: RealmService.persistentSchemas,
      path: realmPath,
      schemaVersion: REALM_SCHEMA_VERSION,
      onMigration: this.executeMigrations,
    };
  }

  dumpEphemeralToDisk() {
    this.ephemeralDb.writeCopyTo({
      schema: RealmService.ephemeralSchemas,
      path: path.join(remote.app.getPath('userData'), 'ephemeral-copy.realm'),
    } as any);
  }

  // Every process needs its own realm connections
  @ExecuteInCurrentWindow()
  async connect() {
    this.persistentDb = await Realm.open(this.persistentConfig as any);
    this.ephemeralDb = await Realm.open(this.ephemeralConfig as any);
  }

  executeMigrations(oldRealm: Realm, newRealm: Realm) {
    Object.values(RealmService.registeredClasses).forEach(klass => {
      klass.onMigration(oldRealm, newRealm);
    });
  }

  static persistentSchemas: typeof Realm.Object[] = [];
  static ephemeralSchemas: typeof Realm.Object[] = [];
  static databaseMappings: Dictionary<'persistent' | 'ephemeral'> = {};
  static registeredClasses: Dictionary<typeof RealmObject> = {};

  static registerObject(obj: typeof Realm.Object, klass: typeof RealmObject, persist = false) {
    persist ? this.persistentSchemas.push(obj) : this.ephemeralSchemas.push(obj);
    // TODO: index
    // @ts-ignore
    this.databaseMappings[obj['schema']['name']] = persist ? 'persistent' : 'ephemeral';
    // TODO: index
    // @ts-ignore
    this.registeredClasses[obj['schema']['name']] = klass;
  }

  /**
   * Returns the realm db for a given RealmObject
   * @param obj A RealmObject
   */
  @ExecuteInCurrentWindow()
  getDb(obj: RealmObject) {
    if (RealmService.databaseMappings[obj.schema.name] === 'persistent') {
      return this.persistentDb;
    } else {
      return this.ephemeralDb;
    }
  }
}
