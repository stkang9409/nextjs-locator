import type {
  SerializedValue,
  PropEntry,
  HookEntry,
  FiberInspection,
} from '../types';

/* eslint-disable @typescript-eslint/no-explicit-any */

/** Render count tracker — resets naturally when fibers are GC'd on unmount */
const renderCountMap = new WeakMap<object, number>();

/** Stateful hook types worth displaying to the user */
const STATEFUL_HOOKS = new Set([
  'useState',
  'useReducer',
  'useMemo',
  'useRef',
]);

const MAX_STRING_LEN = 50;
const MAX_OBJECT_KEYS = 3;
const MAX_ARRAY_ITEMS = 3;
const MAX_DEPTH = 2;

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

/**
 * Walk fiber.memoizedState linked list to extract hook state.
 * Uses fiber._debugHookTypes for type labels (dev mode only).
 * Only returns stateful hooks: useState, useReducer, useMemo, useRef.
 */
export function extractHookState(
  fiber: any,
  limit: number = 5,
): HookEntry[] {
  try {
    if (fiber?.tag !== 0) return []; // Function components only

    const hookTypes: string[] | undefined = fiber._debugHookTypes;
    const entries: HookEntry[] = [];
    let node = fiber.memoizedState;
    let index = 0;

    while (node && entries.length < limit) {
      const hookType = hookTypes?.[index] ?? `Hook [${index}]`;

      if (STATEFUL_HOOKS.has(hookType) || !hookTypes) {
        let stateValue: any;

        if (hookType === 'useRef') {
          stateValue = node.memoizedState?.current;
        } else if (hookType === 'useState' || hookType === 'useReducer') {
          // React stores useState state in queue.lastRenderedState or memoizedState
          stateValue =
            node.queue?.lastRenderedState ?? node.memoizedState;
        } else {
          stateValue = node.memoizedState;
        }

        entries.push({
          index,
          hookType,
          value: safeSerialize(stateValue),
        });
      }

      node = node.next;
      index++;
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
