/// <reference path="../vendor/toasted.d.ts" />
/// <reference path="../vendor/urijs.d.ts" />

// all global interfaces here

declare const SLOBS_BUNDLE_ID: string;
declare const SLD_SENTRY_BACKEND_SERVER_URL: string;
declare const SLD_SENTRY_FRONTEND_DSN: string;
declare const SLD_SENTRY_BACKEND_SERVER_PREVIEW_URL: string;

interface Dictionary<TItemType> {
  [key: string]: TItemType;
}

interface IRectangle {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface IScalableRectangle extends IRectangle {
  scaleX?: number;
  scaleY?: number;
  crop?: ICrop;
  rotation?: number;
}

declare type TPatch<TEntity> = { id: string } & Partial<TEntity>;

interface IVec2 {
  x: number;
  y: number;
}

interface ICrop {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

interface IRGBColor {
  r: number;
  g: number;
  b: number;
}

type DeepPartial<T> = Partial<{ [P in keyof T]: DeepPartial<T[P]> }>;

type PartialRec<K extends keyof any, T> = Partial<Record<K, T>>;

/**
 * This is a much more typesafe type for json to return,
 * as it requires declaring its type before use.
 */
interface Response {
  json(): Promise<unknown>;
}

/**
 * Expands and flattens a type for better readability in IDE tooltips.
 * Instead of showing complex intersection types or Pick/Omit compositions,
 * this displays the final resolved object shape with all properties.
 */
type Prettify<T> = { [K in keyof T]: T[K] } & {};

/**
 * Joins two keys into a single string key.
 * Useful for mapping between nested and flattened object structures.
 */
type JoinKeys<
  K1 extends string | number | symbol,
  K2 extends string | number | symbol = '',
  D extends string = '.'
> = K1 extends ''
  ? K2 extends ''
    ? never
    : K2 extends string | number
    ? `${K2}`
    : '[symbol]'
  : K1 extends string | number
  ? K2 extends ''
    ? `${K1}`
    : K2 extends string | number
    ? `${K1}${D}${K2}`
    : `${K1}${D}[symbol]`
  : K2 extends ''
  ? '[symbol]'
  : K2 extends string | number
  ? `[symbol]${D}${K2}`
  : `[symbol]${D}[symbol]`;

/**
 * Flattens a nested object by one level, joining the keys.
 * Useful for mapping between nested and flattened object structures.
 * Set the last param to true to make all properties non-nullable, which
 * can be helpful when flattening types that may have optional properties.
 */
type Flatten<
  T extends object,
  K extends keyof T,
  P extends string | number | symbol = '',
  D extends string = '.',
  N extends boolean = false
> = {
  [S in keyof T[K] as JoinKeys<P, JoinKeys<K, S, D>, D>]: N extends true
    ? NonNullable<T[K][S]>
    : T[K][S];
};

// list of modules without type definitions
declare module 'raven-js/*';
declare module 'v-tooltip';
declare module 'traverse';
declare module 'vue-multiselect';
declare module 'unzip-stream';
declare module 'node-fontinfo';
declare module 'uuid/*';
declare module 'rimraf';
declare module 'vue-color';
declare module 'vue-popperjs';
declare module 'vue-slider-component';
declare module 'vuedraggable';
declare module 'font-manager';
declare module 'vue-codemirror';
declare module 'recursive-readdir';
declare module 'vue-toasted';
declare module 'hyperform';
declare module 'emojione';
declare module 'vue-resize';
declare module 'serve-handler';
declare module 'v-selectpage';
declare module '*.m.less';
declare module '*.lazy.less';
declare module 'streamlabs-beaker';
declare module '*.vert';
declare module '*.frag';
declare module 'mark.js';
declare module 'vuejs-datepicker';
declare module 'vuejs-datepicker/dist/locale';
declare module 'color-picker';
declare module 'overlayscrollbars-vue';
declare module 'gl-transitions';

// React modules
declare module 'rc-animate';
declare module 'react-dom';

// uncomment to allow TS to import components without type definitions
// webpack still checks the module existence

// declare module '*';
