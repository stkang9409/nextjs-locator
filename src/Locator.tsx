'use client';

import { useEffect } from 'react';
import type {
  LocatorProps,
  SourceMapSections,
  ResolvedSource,
  ContextMenuItem,
} from './types';
import {
  getFiberFromElement,
  findNearestComponentFiber,
  getComponentName,
  extractStackFrame,
  extractDebugSource,
  extractDataLocatorSource,
  collectComponentAncestry,
  collectVisibleChunkUrls,
} from './lib/fiber';
import {
  resolveSourceMap,
  prefetchSourceMap,
  toRelativePath,
} from './lib/source-map';
import { buildEditorUrl } from './lib/editor';
import {
  createOverlay,
  positionOverlay,
  hideOverlay,
  removeOverlay,
  updateTooltipText,
} from './lib/overlay';
import {
  createContextMenu,
  showContextMenu,
  updateContextMenuItem,
  hideContextMenu,
  removeContextMenu,
  isContextMenuVisible,
} from './lib/context-menu';
import { inspectFiber } from './lib/fiber-inspect';
import {
  createPreviewPanel,
  showPreviewPanel,
  hidePreviewPanel,
  removePreviewPanel,
} from './lib/preview-panel';

/* eslint-disable @typescript-eslint/no-explicit-any */

const MODIFIER_KEYS: Record<string, string> = {
  alt: 'Alt',
  ctrl: 'Control',
  meta: 'Meta',
  shift: 'Shift',
};

/**
 * Resolve the original source location for a component Fiber node.
 * Priority: data-locator-source attribute → React 18 _debugSource → React 19 _debugStack + source map.
 */
async function resolveComponentSource(
  fiber: any,
  cache: Map<string, SourceMapSections>,
  _projectRoot?: string,
  element?: HTMLElement,
): Promise<ResolvedSource | null> {
  // Fastest path: compile-time injected data-locator-source attribute
  if (element) {
    const attrSource = extractDataLocatorSource(element);
    if (attrSource) return attrSource;
  }

  // Fast path: React 18 _debugSource (synchronous, no fetch needed)
  const debugSource = extractDebugSource(fiber);
  if (debugSource) return debugSource;

  // Slow path: React 19 _debugStack (async, needs source map fetch)
  let stackInfo = extractStackFrame(fiber._debugStack);
  if (!stackInfo) {
    const componentFiber = findNearestComponentFiber(fiber);
    if (componentFiber) {
      stackInfo = extractStackFrame(componentFiber._debugStack);
    }
  }
  if (!stackInfo) return null;

  return resolveSourceMap(
    stackInfo.chunkUrl,
    stackInfo.line,
    stackInfo.column,
    cache,
  );
}

/**
 * Dev Locator — Alt(Option)+Click to open source code in your editor.
 *
 * Features:
 * - Alt+Hover: highlights component with name and source file path
 * - Alt+Click: opens source in editor
 * - Alt+Right-click: shows component hierarchy menu
 * - Source map prefetching on modifier key press
 * - React 18 _debugSource fallback
 *
 * Renders nothing (returns null). Only active in development mode.
 * Completely tree-shaken in production builds.
 */
export function Locator({
  editor = 'vscode',
  projectRoot,
  modifier = 'alt',
  enabled,
  highlightColor = '#ef4444',
  showPreview = true,
}: LocatorProps = {}) {
  const isEnabled = enabled ?? process.env.NODE_ENV === 'development';

  useEffect(() => {
    if (!isEnabled) return;

    const sourceMapCache = new Map<string, SourceMapSections>();
    const elements = createOverlay(highlightColor);
    const contextMenu = createContextMenu();
    const previewPanel = showPreview ? createPreviewPanel() : null;
    const modifierKey = MODIFIER_KEYS[modifier] ?? 'Alt';

    let isModifierHeld = false;
    let currentHoverTarget: HTMLElement | null = null;
    let inspectDebounceTimer: ReturnType<typeof setTimeout> | null = null;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === modifierKey) {
        isModifierHeld = true;
        document.body.style.cursor = 'crosshair';

        // Prefetch source maps for visible elements (non-blocking)
        const urls = collectVisibleChunkUrls();
        for (const url of urls) {
          prefetchSourceMap(url, sourceMapCache);
        }
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === modifierKey) {
        isModifierHeld = false;
        hideOverlay(elements);
        hideContextMenu(contextMenu);
        if (previewPanel) hidePreviewPanel(previewPanel);
        if (inspectDebounceTimer) clearTimeout(inspectDebounceTimer);
        document.body.style.cursor = '';
      }
    };

    const handleMouseMove = (e: MouseEvent) => {
      if (!isModifierHeld) return;
      // Don't move overlay while context menu is open
      if (isContextMenuVisible(contextMenu)) return;

      const target = document.elementFromPoint(
        e.clientX,
        e.clientY,
      ) as HTMLElement;
      if (
        !target ||
        target === elements.overlay ||
        target === elements.tooltip ||
        contextMenu.container.contains(target)
      )
        return;

      const fiber = getFiberFromElement(target);
      const componentFiber = fiber ? findNearestComponentFiber(fiber) : null;
      const name = componentFiber ? getComponentName(componentFiber) : null;

      // Show component name immediately
      positionOverlay(elements, target, name);

      // Async: resolve file path and update tooltip
      if (name && componentFiber) {
        currentHoverTarget = target;

        resolveComponentSource(componentFiber, sourceMapCache, projectRoot, target)
          .then((resolved) => {
            if (currentHoverTarget !== target) return; // stale
            if (resolved) {
              const relativePath = toRelativePath(
                resolved.filePath,
                projectRoot,
              );
              updateTooltipText(
                elements,
                `<${name}> \u2014 ${relativePath}:${resolved.originalLine}`,
              );
            }
          })
          .catch(() => {
            /* keep showing name only */
          });

        // Debounced preview panel: inspect fiber props/state
        if (previewPanel) {
          if (inspectDebounceTimer) clearTimeout(inspectDebounceTimer);
          inspectDebounceTimer = setTimeout(() => {
            if (currentHoverTarget !== target) return; // stale
            const inspection = inspectFiber(componentFiber);
            const targetRect = target.getBoundingClientRect();
            const tooltipRect = elements.tooltip.getBoundingClientRect();
            showPreviewPanel(previewPanel, targetRect, tooltipRect, inspection);
          }, 150);
        }
      } else if (previewPanel) {
        hidePreviewPanel(previewPanel);
      }
    };

    const handleClick = async (e: MouseEvent) => {
      // If context menu is open, handle clicks
      if (isContextMenuVisible(contextMenu)) {
        if (contextMenu.container.contains(e.target as Node)) {
          // Inside menu click → let row click handler process it
          return;
        }
        // Outside menu click → dismiss menu
        hideContextMenu(contextMenu);
        e.preventDefault();
        e.stopPropagation();
        return;
      }

      if (!isModifierHeld) return;

      e.preventDefault();
      e.stopPropagation();

      const target = document.elementFromPoint(
        e.clientX,
        e.clientY,
      ) as HTMLElement;
      if (!target) return;

      const fiber = getFiberFromElement(target);
      if (!fiber) {
        console.warn('[nextjs-locator] Could not find React Fiber:', target);
        return;
      }

      // Try the element's fiber first, then the nearest component fiber
      let resolved = await resolveComponentSource(
        fiber,
        sourceMapCache,
        projectRoot,
        target,
      );
      if (!resolved) {
        const componentFiber = findNearestComponentFiber(fiber);
        if (componentFiber) {
          resolved = await resolveComponentSource(
            componentFiber,
            sourceMapCache,
            projectRoot,
            target,
          );
        }
      }

      if (resolved) {
        const url = buildEditorUrl(
          editor,
          resolved.filePath,
          resolved.originalLine,
          resolved.originalColumn,
        );
        window.open(url, '_self');
      } else {
        console.warn('[nextjs-locator] Could not resolve source.');
      }
    };

    const handleContextMenu = (e: MouseEvent) => {
      if (!isModifierHeld) return;

      e.preventDefault();
      e.stopPropagation();
      if (previewPanel) hidePreviewPanel(previewPanel);

      const target = document.elementFromPoint(
        e.clientX,
        e.clientY,
      ) as HTMLElement;
      if (!target) return;

      const fiber = getFiberFromElement(target);
      if (!fiber) return;

      const ancestry = collectComponentAncestry(fiber);
      if (ancestry.length === 0) return;

      // Build menu items
      const items: ContextMenuItem[] = ancestry.map(({ fiber: f, name }) => ({
        componentName: name,
        fiber: f,
      }));

      // Show menu with names immediately
      showContextMenu(contextMenu, e.clientX, e.clientY, items, (item) => {
        // On select: resolve source and open editor
        resolveComponentSource(item.fiber, sourceMapCache, projectRoot)
          .then((resolved) => {
            if (resolved) {
              const url = buildEditorUrl(
                editor,
                resolved.filePath,
                resolved.originalLine,
                resolved.originalColumn,
              );
              window.open(url, '_self');
            }
          })
          .catch((err) =>
            console.warn('[nextjs-locator] Source map error:', err),
          );
      });

      // Async: resolve file paths for each item and update display
      items.forEach((item, index) => {
        resolveComponentSource(item.fiber, sourceMapCache, projectRoot)
          .then((resolved) => {
            if (resolved && isContextMenuVisible(contextMenu)) {
              item.filePath = toRelativePath(resolved.filePath, projectRoot);
              item.line = resolved.originalLine;
              updateContextMenuItem(contextMenu, index, item);
            }
          })
          .catch(() => {});
      });
    };

    const handleBlur = () => {
      isModifierHeld = false;
      hideOverlay(elements);
      hideContextMenu(contextMenu);
      if (previewPanel) hidePreviewPanel(previewPanel);
      if (inspectDebounceTimer) clearTimeout(inspectDebounceTimer);
      document.body.style.cursor = '';
    };

    // Register listeners on capture phase to intercept before app handlers
    document.addEventListener('keydown', handleKeyDown, true);
    document.addEventListener('keyup', handleKeyUp, true);
    document.addEventListener('mousemove', handleMouseMove, true);
    document.addEventListener('click', handleClick, true);
    document.addEventListener('contextmenu', handleContextMenu, true);
    window.addEventListener('blur', handleBlur);

    return () => {
      document.removeEventListener('keydown', handleKeyDown, true);
      document.removeEventListener('keyup', handleKeyUp, true);
      document.removeEventListener('mousemove', handleMouseMove, true);
      document.removeEventListener('click', handleClick, true);
      document.removeEventListener('contextmenu', handleContextMenu, true);
      window.removeEventListener('blur', handleBlur);
      removeOverlay(elements);
      removeContextMenu(contextMenu);
      if (previewPanel) removePreviewPanel(previewPanel);
      if (inspectDebounceTimer) clearTimeout(inspectDebounceTimer);
      document.body.style.cursor = '';
    };
  }, [isEnabled, editor, projectRoot, modifier, highlightColor, showPreview]);

  return null;
}
