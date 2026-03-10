import type { StackFrame, ResolvedSource } from '../types';

/**
 * Check if the target element or ancestors (up to 3 levels) have a
 * data-locator-source attribute injected at compile time.
 * Returns parsed ResolvedSource or null.
 */
export function extractDataLocatorSource(
  element: HTMLElement,
): ResolvedSource | null {
  let current: HTMLElement | null = element;
  let depth = 0;
  while (current && depth < 3) {
    const attr = current.getAttribute('data-locator-source');
    if (attr) {
      // Format: "filepath:line:col" or "filepath:line:col:endLine" — parse from end to handle Windows colons
      const parts = attr.split(':');
      if (parts.length >= 3) {
        const col = parseInt(parts[parts.length - 1], 10);
        const line = parseInt(parts[parts.length - 2], 10);
        const maybeEndLine =
          parts.length >= 4
            ? parseInt(parts[parts.length - 3], 10)
            : undefined;
        const hasEndLine =
          maybeEndLine !== undefined && !isNaN(maybeEndLine);
        const filePath = parts
          .slice(0, hasEndLine ? -3 : -2)
          .join(':');
        if (filePath && !isNaN(line) && !isNaN(col)) {
          return {
            filePath,
            originalLine: line,
            originalColumn: col,
            endLine: hasEndLine ? maybeEndLine : undefined,
          };
        }
      }
    }
    current = current.parentElement;
    depth++;
  }
  return null;
}

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

    // Skip React internal frames and node_modules
    if (
      line.includes('jsxDEV') ||
      line.includes('react-stack-top-frame') ||
      line.includes('react_stack_bottom_frame') ||
      line.includes('react-dom') ||
      line.includes('renderWithHooks') ||
      line.includes('beginWork') ||
      line.includes('performUnitOfWork') ||
      line.includes('node_modules') ||
      line.includes('react-server-dom-turbopack') ||
      line.includes('react-server-dom-webpack')
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
 * Returns true if the fiber's source originates from user code (not node_modules).
 * Falls back to true (include) when source info is unavailable.
 *
 * React 18: _debugSource.fileName is the actual source path — accurate.
 * React 19 + Turbopack: _debugStack.stack has bundled chunk URLs (no node_modules in URL).
 *   Post-resolution filtering is done in handleContextMenu (Locator.tsx) instead.
 */
export function isUserComponent(fiber: any): boolean {
  // React 18: _debugSource.fileName is the original source path
  const fileName = fiber?._debugSource?.fileName as string | undefined;
  if (fileName) {
    return !fileName.includes('node_modules');
  }

  // React 19: can't determine from _debugStack URL alone (bundled chunks).
  // Post-resolution filtering is done in handleContextMenu (Locator.tsx).
  return true;
}

/**
 * Walk up the Fiber tree collecting ALL component ancestors.
 * Returns array from innermost (closest to element) to outermost (root).
 * Only includes user-defined components (filters out node_modules).
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
      if (name && isUserComponent(current)) {
        ancestors.push({ fiber: current, name });
      }
    }
    current = current.return;
    depth++;
  }

  return ancestors;
}

/**
 * Collect all HostComponent (tag=5) DOM nodes rendered by a component fiber,
 * including Fragment roots and sibling subtrees. Returns the union bounding rect.
 */
export function getFiberBoundingRect(fiber: any): DOMRect | null {
  const nodes: HTMLElement[] = [];

  function walk(node: any): void {
    if (!node) return;
    if (node.tag === 5 && node.stateNode instanceof HTMLElement) {
      nodes.push(node.stateNode);
    }
    walk(node.child);
    walk(node.sibling);
  }

  walk(fiber.child);

  if (nodes.length === 0) return null;

  const rects = nodes.map((n) => n.getBoundingClientRect());
  const left = Math.min(...rects.map((r) => r.left));
  const top = Math.min(...rects.map((r) => r.top));
  const right = Math.max(...rects.map((r) => r.right));
  const bottom = Math.max(...rects.map((r) => r.bottom));
  return new DOMRect(left, top, right - left, bottom - top);
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
