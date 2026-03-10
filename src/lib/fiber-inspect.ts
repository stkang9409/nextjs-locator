import type {
  SerializedValue,
  PropEntry,
  HookEntry,
  FiberInspection,
} from '../types';

/* eslint-disable @typescript-eslint/no-explicit-any */

/** Render count tracker — resets naturally when fibers are GC'd on unmount */
const renderCountMap = new WeakMap<object, number>();

/** Effect hook types that should be summarized, not shown raw */
const EFFECT_HOOKS = new Set([
  'useEffect',
  'useLayoutEffect',
  'useInsertionEffect',
]);

/** Detect if a memoizedState node looks like an effect descriptor */
function isEffectNode(state: any): boolean {
  return (
    state != null &&
    typeof state === 'object' &&
    'create' in state &&
    'deps' in state &&
    'tag' in state
  );
}

/** Infer hook type from memoizedState structure when _debugHookTypes unavailable */
function inferHookType(node: any): string {
  const ms = node.memoizedState;
  // 1. Effect descriptor — {tag, create, deps}
  if (isEffectNode(ms)) return 'useEffect';
  // 2. useRef — {current: ...} with no extra keys (check before queue!)
  if (ms != null && typeof ms === 'object' && 'current' in ms
      && Object.keys(ms).length <= 2) return 'useRef';
  // 3. useMemo — [value, deps] tuple
  if (Array.isArray(ms) && ms.length === 2 && Array.isArray(ms[1])) return 'useMemo';
  // 4. useState/useReducer — queue present
  if (node.queue != null) return 'useState';
  return 'unknown';
}

const MAX_STRING_LEN = 80;
const MAX_OBJECT_KEYS = 5;
const MAX_ARRAY_ITEMS = 3;
const MAX_DEPTH = 3;

/**
 * Safely serialize any JS value for display in the preview panel.
 * Handles circular refs, React elements, functions, symbols, and truncation.
 */
export function safeSerialize(
  value: any,
  seen: WeakSet<object> = new WeakSet(),
  depth: number = 0,
): SerializedValue {
  if (value === null) return { display: 'null', type: 'null' };
  if (value === undefined) return { display: 'undefined', type: 'undefined' };

  const t = typeof value;

  if (t === 'boolean') return { display: String(value), type: 'boolean' };
  if (t === 'number') return { display: String(value), type: 'number' };
  if (t === 'bigint') return { display: `${value}n`, type: 'number' };

  if (t === 'string') {
    const truncated =
      value.length > MAX_STRING_LEN
        ? `${value.slice(0, MAX_STRING_LEN)}…`
        : value;
    return { display: `"${truncated}"`, type: 'string' };
  }

  if (t === 'symbol') {
    return { display: `Symbol(${value.description ?? ''})`, type: 'symbol' };
  }

  if (t === 'function') {
    const name = value.displayName || value.name || 'anonymous';
    return { display: `ƒ ${name}()`, type: 'function' };
  }

  // Objects (including arrays, React elements, etc.)
  if (t === 'object') {
    // Circular reference check
    if (seen.has(value)) return { display: '[Circular]', type: 'other' };
    seen.add(value);

    // React element detection (React 18 + 19)
    if (
      value.$$typeof === Symbol.for('react.element') ||
      value.$$typeof === Symbol.for('react.transitional.element')
    ) {
      const name =
        value.type?.displayName || value.type?.name || value.type || 'Unknown';
      return { display: `<${name}>`, type: 'element' };
    }

    // Date
    if (value instanceof Date) {
      return { display: value.toISOString(), type: 'object' };
    }

    // RegExp
    if (value instanceof RegExp) {
      return { display: String(value), type: 'object' };
    }

    // Depth limit
    if (depth >= MAX_DEPTH) {
      return {
        display: Array.isArray(value) ? `[…${value.length}]` : '{…}',
        type: Array.isArray(value) ? 'array' : 'object',
      };
    }

    // Array
    if (Array.isArray(value)) {
      const items = value
        .slice(0, MAX_ARRAY_ITEMS)
        .map((v) => safeSerialize(v, seen, depth + 1).display);
      const rest = value.length > MAX_ARRAY_ITEMS ? `, …${value.length - MAX_ARRAY_ITEMS} more` : '';
      return { display: `[${items.join(', ')}${rest}]`, type: 'array' };
    }

    // Plain object
    const keys = Object.keys(value);
    const entries = keys
      .slice(0, MAX_OBJECT_KEYS)
      .map((k) => `${k}: ${safeSerialize(value[k], seen, depth + 1).display}`);
    const rest = keys.length > MAX_OBJECT_KEYS ? `, …${keys.length - MAX_OBJECT_KEYS} more` : '';
    return { display: `{${entries.join(', ')}${rest}}`, type: 'object' };
  }

  return { display: String(value), type: 'other' };
}

/**
 * Extract props from fiber.memoizedProps.
 * Filters out `children`, `key`, and `ref` internal keys.
 */
export function extractProps(fiber: any, limit: number = 10): PropEntry[] {
  try {
    const props = fiber?.memoizedProps;
    if (!props || typeof props !== 'object') return [];

    const SKIP_KEYS = new Set(['children', 'key', 'ref', '__self', '__source']);
    const entries: PropEntry[] = [];

    for (const key of Object.keys(props)) {
      if (SKIP_KEYS.has(key)) continue;
      if (entries.length >= limit) break;
      entries.push({ key, value: safeSerialize(props[key]) });
    }

    return entries;
  } catch {
    return [];
  }
}

/** Hook types that represent direct component state (high priority) */
const PRIMARY_HOOKS = new Set(['useState', 'useReducer', 'useRef']);

/** Hook types that represent derived/external state (low priority) */
const SECONDARY_HOOKS = new Set(['useMemo', 'useContext']);

/**
 * Check if a value looks like a library-internal descriptor
 * (e.g., effect descriptors, React Query internals) rather than user data.
 * Applied to all hook types, not just useContext.
 */
function isLibraryInternalValue(value: any): boolean {
  if (value == null || typeof value !== 'object') return false;
  // Effect descriptor shape: {tag, create, deps}
  if (isEffectNode(value)) return true;
  // React Query / library internals with subscribe + listeners
  if ('subscribe' in value && 'listeners' in value) return true;
  return false;
}

/**
 * Extract the state value from a hook node based on its type.
 */
function extractHookValue(hookType: string, node: any): any {
  if (hookType === 'useRef') {
    return node.memoizedState?.current;
  }
  if (hookType === 'useState' || hookType === 'useReducer') {
    return node.queue?.lastRenderedState ?? node.memoizedState;
  }
  if (hookType === 'useMemo') {
    return Array.isArray(node.memoizedState)
      ? node.memoizedState[0]
      : node.memoizedState;
  }
  return node.memoizedState;
}

interface RawHook {
  index: number;
  hookType: string;
  node: any;
}

/**
 * Walk fiber.memoizedState linked list to extract hook state.
 * Uses a 2-pass approach: primary hooks (useState, useReducer, useRef) first,
 * then secondary hooks (useMemo, useContext) to fill remaining slots.
 * Filters out library-internal useContext values.
 */
export function extractHookState(
  fiber: any,
  limit: number = 8,
): HookEntry[] {
  try {
    if (fiber?.tag !== 0) return []; // Function components only

    const hookTypes: string[] | undefined = fiber._debugHookTypes;
    const primary: RawHook[] = [];
    const secondary: RawHook[] = [];
    const effects: HookEntry[] = [];
    let node = fiber.memoizedState;
    let index = 0;

    // Single walk: categorize all hooks
    while (node) {
      let hookType: string;

      if (hookTypes) {
        hookType = hookTypes[index] ?? `Hook [${index}]`;

        // Summarize effect hooks
        if (EFFECT_HOOKS.has(hookType)) {
          const deps = node.memoizedState?.deps;
          const depsCount = Array.isArray(deps) ? deps.length : '?';
          effects.push({
            index,
            hookType,
            value: { display: `deps[${depsCount}]`, type: 'other' },
          });
          node = node.next;
          index++;
          continue;
        }
      } else {
        hookType = inferHookType(node);
        if (hookType === 'useEffect' || hookType === 'unknown') {
          node = node.next;
          index++;
          continue;
        }
      }

      // Filter out library-internal values regardless of hook type
      const stateValue = extractHookValue(hookType, node);
      if (isLibraryInternalValue(stateValue)) {
        node = node.next;
        index++;
        continue;
      }

      if (PRIMARY_HOOKS.has(hookType)) {
        primary.push({ index, hookType, node });
      } else if (SECONDARY_HOOKS.has(hookType)) {
        secondary.push({ index, hookType, node });
      }

      node = node.next;
      index++;
    }

    // 2-pass assembly: primary first, then secondary, then effects
    const entries: HookEntry[] = [];

    for (const hook of primary) {
      if (entries.length >= limit) break;
      entries.push({
        index: hook.index,
        hookType: hook.hookType,
        value: safeSerialize(extractHookValue(hook.hookType, hook.node)),
      });
    }

    for (const hook of secondary) {
      if (entries.length >= limit) break;
      entries.push({
        index: hook.index,
        hookType: hook.hookType,
        value: safeSerialize(extractHookValue(hook.hookType, hook.node)),
      });
    }

    for (const effect of effects) {
      if (entries.length >= limit) break;
      entries.push(effect);
    }

    return entries;
  } catch {
    return [];
  }
}

/**
 * Extract class component state from fiber.stateNode.state.
 * Only for class components (fiber.tag === 1).
 */
export function extractClassState(
  fiber: any,
  limit: number = 5,
): PropEntry[] | null {
  try {
    if (fiber?.tag !== 1) return null;

    const state = fiber.stateNode?.state;
    if (!state || typeof state !== 'object') return null;

    const entries: PropEntry[] = [];
    for (const key of Object.keys(state)) {
      if (entries.length >= limit) break;
      entries.push({ key, value: safeSerialize(state[key]) });
    }

    return entries;
  } catch {
    return null;
  }
}

/**
 * Track render count for a fiber. Uses WeakMap so counts
 * are naturally GC'd when components unmount.
 */
export function trackRenderCount(fiber: any): number {
  if (!fiber) return 0;
  const count = (renderCountMap.get(fiber) ?? 0) + 1;
  renderCountMap.set(fiber, count);
  return count;
}

/**
 * Main entry: Inspect a fiber and return all inspection data.
 */
export function inspectFiber(fiber: any): FiberInspection {
  const isClassComponent = fiber?.tag === 1;

  return {
    props: extractProps(fiber),
    hooks: isClassComponent ? [] : extractHookState(fiber),
    renderCount: trackRenderCount(fiber),
    isClassComponent,
    classState: isClassComponent ? extractClassState(fiber) : null,
  };
}
