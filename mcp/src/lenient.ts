/**
 * Lenient argument handling, for smaller models.
 *
 * Models get the *intent* of a tool call right more often than the exact parameter spelling:
 * `itemName` for `item`, `sceneName` for `scene`, `sourceName` for `name`. A strict schema
 * rejects (or silently drops) every one of those.
 *
 * This hooks the SDK's input validation and, before the zod schema sees the arguments:
 *   - maps near-miss keys onto real parameter names (case, `_`/`-`, a trailing "Name"),
 *   - parses arrays/objects that arrive as JSON strings,
 *   - turns numeric strings into numbers and "true"/"false" into booleans,
 * and rewrites a validation failure into a message that names the expected parameters.
 *
 * `validateToolInput` is an SDK method, not documented API -- pinned against 1.30.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { ErrorCode, McpError } from '@modelcontextprotocol/sdk/types.js';
import { log } from './log.js';

type AnyRecord = Record<string, unknown>;

const canon = (k: string) => k.toLowerCase().replace(/[_\-\s]/g, '');

/** Base zod type name, unwrapping optional/default/nullable. */
function baseType(schema: any): string {
  let s = schema;
  for (let i = 0; i < 5 && s; i++) {
    const def = s?._zod?.def ?? s?._def;
    const t = def?.type ?? def?.typeName;
    if (
      t === 'optional' ||
      t === 'default' ||
      t === 'nullable' ||
      t === 'ZodOptional' ||
      t === 'ZodDefault'
    ) {
      s = def.innerType;
      continue;
    }
    return String(t ?? 'unknown');
  }
  return 'unknown';
}

function shapeOf(tool: any): AnyRecord | null {
  const schema = tool?.inputSchema;
  return (schema?.shape ?? schema?._zod?.def?.shape ?? null) as AnyRecord | null;
}

function resolveKey(key: string, known: string[]): string | null {
  if (known.includes(key)) return key;
  const c = canon(key);
  const direct = known.find(k => canon(k) === c);
  if (direct) return direct;
  // sceneName -> scene, itemName -> item, source_name -> source
  if (c.endsWith('name')) {
    const stem = c.slice(0, -4);
    const byStem = known.find(k => canon(k) === stem);
    if (byStem) return byStem;
    // sourceName / sceneName on a tool whose identifier param is literally `name`
    if (known.includes('name') && stem.length > 0) return 'name';
  }
  // source_type -> type, item_type -> type
  if (c.endsWith('type') && known.includes('type')) return 'type';
  return null;
}

function unwrap(schema: any): any {
  let s = schema;
  for (let i = 0; i < 5 && s; i++) {
    const t = s?._zod?.def?.type;
    if (t === 'optional' || t === 'default' || t === 'nullable') s = s._zod.def.innerType;
    else break;
  }
  return s;
}

/** Coerce a value toward its schema, recursing into arrays and objects. */
function coerce(value: unknown, schema: any): unknown {
  const s = unwrap(schema);
  const type = baseType(s);
  let v = value;

  if (typeof v === 'string') {
    const t = v.trim();
    if ((type === 'array' || type === 'object' || type === 'record') && /^[[{]/.test(t)) {
      try {
        v = JSON.parse(t);
      } catch {
        return value;
      }
    } else if (type === 'number' && t !== '' && !Number.isNaN(Number(t.replace(/%$/, '')))) {
      return Number(t.replace(/%$/, ''));
    } else if (type === 'boolean' && /^(true|false)$/i.test(t)) {
      return t.toLowerCase() === 'true';
    } else {
      return value;
    }
  }

  if (type === 'array' && Array.isArray(v)) {
    const element = s?._zod?.def?.element;
    return element ? v.map(e => coerce(e, element)) : v;
  }
  if (type === 'array' && v && typeof v === 'object') {
    // A single object where a list was expected: wrap it.
    const element = s?._zod?.def?.element;
    return [element ? coerce(v, element) : v];
  }
  if (type === 'object' && v && typeof v === 'object' && !Array.isArray(v)) {
    const shape = s?._zod?.def?.shape ?? s?.shape;
    return shape ? normalizeObject(v as AnyRecord, shape) : v;
  }
  return v;
}

function normalizeObject(args: AnyRecord, shape: AnyRecord): AnyRecord {
  const known = Object.keys(shape);
  const out: AnyRecord = {};
  for (const [key, value] of Object.entries(args)) {
    const target = resolveKey(key, known);
    if (!target) {
      out[key] = value; // zod strips it
      continue;
    }
    if (target !== key) log(`lenient: mapped "${key}" -> "${target}"`);
    if (out[target] === undefined) out[target] = coerce(value, shape[target]);
  }
  return out;
}

export function normalizeArgs(tool: unknown, args: unknown): unknown {
  const shape = shapeOf(tool);
  if (!shape || !args || typeof args !== 'object' || Array.isArray(args)) return args;
  return normalizeObject(args as AnyRecord, shape);
}

function describeParams(tool: unknown): string {
  const shape = shapeOf(tool);
  if (!shape) return '';
  return Object.entries(shape)
    .map(([k, s]) => {
      const optional = /optional|default/i.test(String((s as any)?._zod?.def?.type ?? ''));
      return `${k}${optional ? '?' : ''}: ${baseType(s)}`;
    })
    .join(', ');
}

export function installLenientArgs(server: McpServer): void {
  const anyServer = server as any;
  const original = anyServer.validateToolInput?.bind(server);
  if (typeof original !== 'function') {
    log('lenient: SDK has no validateToolInput; argument normalisation disabled');
    return;
  }
  anyServer.validateToolInput = async (tool: unknown, args: unknown, toolName: string) => {
    const normalized = normalizeArgs(tool, args);
    try {
      return await original(tool, normalized, toolName);
    } catch (e) {
      if (e instanceof McpError && e.code === ErrorCode.InvalidParams) {
        throw new McpError(
          ErrorCode.InvalidParams,
          `Wrong arguments for ${toolName}. ${e.message.replace(/^MCP error -?\d+:\s*/, '')}\n` +
            `Expected parameters: { ${describeParams(tool)} }  (? = optional). ` +
            `You sent: ${JSON.stringify(
              args,
            )}. Fix the parameter names and call ${toolName} again.`,
        );
      }
      throw e;
    }
  };
}
