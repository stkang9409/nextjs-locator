import type { StackFrame, ResolvedSource } from '../types';

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

/**
 * Extract source location from React 18's _debugSource.
 * Returns a ResolvedSource directly — no source map fetch needed.
 */
export function extractDebugSource(fiber: any): ResolvedSource | null {
  const source = fiber?._debugSource;
  if (!source?.fileName) return null;

  return {
    filePath: source.fileName,
    originalLine: source.lineNumber ?? 1,
    originalColumn: source.columnNumber ?? 0,
  };
}

/**
 * Walk up the Fiber tree collecting ALL component ancestors.
 * Returns array from innermost (closest to element) to outermost (root).
 */
export function collectComponentAncestry(
  fiber: any,
  maxDepth: number = 20,
): Array<{ fiber: any; name: string }> {
  const ancestors: Array<{ fiber: any; name: string }> = [];
  let current = fiber;
  let depth = 0;

  while (current && depth < maxDepth) {
    if (current.tag === 0 || current.tag === 1) {
      const name = getComponentName(current);
      if (name) {
        ancestors.push({ fiber: current, name });
      }
    }
    current = current.return;
    depth++;
  }

  return ancestors;
}

/**
 * Scan visible DOM elements to collect unique chunk URLs from React Fiber _debugStack.
 * Used for prefetching source maps when the modifier key is pressed.
 */
export function collectVisibleChunkUrls(limit: number = 50): Set<string> {
  const urls = new Set<string>();
  const walker = document.createTreeWalker(
    document.body,
    NodeFilter.SHOW_ELEMENT,
  );

  let count = 0;
  let node = walker.nextNode();
  while (node && count < limit) {
    const fiber = getFiberFromElement(node as HTMLElement);
    if (fiber) {
      const stackInfo = extractStackFrame(fiber._debugStack);
      if (stackInfo && !urls.has(stackInfo.chunkUrl)) {
        urls.add(stackInfo.chunkUrl);
        count++;
      }
    }
    node = walker.nextNode();
  }

  return urls;
}
