import type { StackFrame } from '../types';

/* eslint-disable @typescript-eslint/no-explicit-any */

/** Extract React Fiber instance from a DOM element via __reactFiber$ key */
export function getFiberFromElement(element: HTMLElement): any | null {
  const key = Object.keys(element).find((k) => k.startsWith('__reactFiber$'));
  return key ? (element as any)[key] : null;
}

/** Walk up the Fiber tree to find the nearest function/class component */
export function findNearestComponentFiber(fiber: any): any | null {
  let current = fiber;
  while (current) {
    // tag 0 = FunctionComponent, tag 1 = ClassComponent
    if (current.tag === 0 || current.tag === 1) return current;
    current = current.return;
  }
  return null;
}

/** Extract component display name from a Fiber node */
export function getComponentName(fiber: any): string | null {
  if (!fiber?.type) return null;
  return fiber.type.displayName || fiber.type.name || null;
}

/**
 * Extract the first meaningful stack frame from React 19's _debugStack.
 *
 * _debugStack is an Error object whose stack trace contains frames like:
 * "at ComponentName (http://localhost:3000/_next/static/chunks/xxx.js:2085:303)"
 *
 * We skip React-internal frames (jsxDEV, react-dom, etc.) and return
 * the chunk URL, line, and column of the first user-land frame.
 */
export function extractStackFrame(debugStack: any): StackFrame | null {
  if (!debugStack?.stack) return null;

  const lines: string[] = debugStack.stack.split('\n');
  for (const line of lines) {
    if (!line.includes('at ')) continue;

    // Skip React internal frames
    if (
      line.includes('jsxDEV') ||
      line.includes('react-stack-top-frame') ||
      line.includes('react_stack_bottom_frame') ||
      line.includes('react-dom') ||
      line.includes('renderWithHooks') ||
      line.includes('beginWork') ||
      line.includes('performUnitOfWork')
    ) {
      continue;
    }

    // Match "at Name (URL:line:col)" pattern
    const match = line.match(/\((https?:\/\/[^)]+?):(\d+):(\d+)\)/);
    if (match) {
      return {
        chunkUrl: match[1],
        line: parseInt(match[2], 10),
        column: parseInt(match[3], 10),
      };
    }
  }

  return null;
}
