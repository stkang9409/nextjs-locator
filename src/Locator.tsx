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
  getFiberBoundingRect,
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
  positionOverlayByRect,
  hideOverlay,
  removeOverlay,
  updateTooltipText,
} from './lib/overlay';
import {
  createContextMenu,
  showContextMenu,
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
import {
  createAskModal,
  showAskModal,
  hideAskModal,
  removeAskModal,
  isAskModalVisible,
} from './lib/ask-modal';
import { runAskClaude } from './lib/claude-prompt';

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
 * - Alt+Right-click: shows component hierarchy menu with two actions:
 *     - "↗ 코드": opens source in editor
 *     - "◎ Claude": opens Claude Code with rich component context prompt
 * - Source map prefetching on modifier key press
 * - React 18 _debugSource fallback
 *
 * Renders nothing (returns null). Only active in development mode.
 * Completely tree-shaken in production builds.
 */
export function Locator(props: LocatorProps = {}) {
  if (process.env.NODE_ENV !== 'development' && props.enabled !== true)
    return null;
  return <LocatorImpl {...props} />;
}

function LocatorImpl({
  editor = 'vscode',
  projectRoot,
  modifier = 'alt',
  enabled,
  highlightColor = '#ef4444',
  showPreview = true,
}: LocatorProps = {}) {
  const isEnabled = enabled ?? true;

  useEffect(() => {
    if (!isEnabled) return;

    console.log('[nextjs-locator] v' + __VERSION__ + ' initialized');

    const sourceMapCache = new Map<string, SourceMapSections>();
    const elements = createOverlay(highlightColor);
    const contextMenu = createContextMenu();
    const previewPanel = showPreview ? createPreviewPanel() : null;
    const askModal = createAskModal();
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
      // Don't interfere while modal is open
      if (isAskModalVisible(askModal)) return;
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
      // If modal is open, let its own event handlers work; dismiss on outside click
      if (isAskModalVisible(askModal)) {
        if (!askModal.overlay.contains(e.target as Node)) {
          hideAskModal(askModal);
          e.preventDefault();
          e.stopPropagation();
        }
        return;
      }

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
      if (previewPanel) hidePreviewPanel(previewPanel);

      const target = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement;
      if (!target) return;

      const fiber = getFiberFromElement(target);
      if (!fiber) return;

      // Resolve the nearest user component for Alt+click (single component, Stage 2 직행)
      const componentFiber = findNearestComponentFiber(fiber);
      let resolved = await resolveComponentSource(fiber, sourceMapCache, projectRoot, target);
      if (!resolved && componentFiber) {
        resolved = await resolveComponentSource(componentFiber, sourceMapCache, projectRoot, target);
      }
      if (!resolved || resolved.filePath.includes('node_modules')) return;
      if (!isModifierHeld) return;

      // component fiber가 있으면 그걸 사용 (이름, props, hooks 추출용)
      const inspectionFiber = componentFiber ?? fiber;
      const componentName = getComponentName(inspectionFiber) ?? 'Unknown';
      const item: ContextMenuItem = {
        componentName,
        fiber: inspectionFiber,
        filePath: toRelativePath(resolved.filePath, projectRoot),
        line: resolved.originalLine,
      };

      const capturedResolved = resolved;

      showContextMenu(
        contextMenu,
        e.clientX,
        e.clientY,
        [item],
        // onGoToCode
        () => {
          const url = buildEditorUrl(
            editor,
            capturedResolved.filePath,
            capturedResolved.originalLine,
            capturedResolved.originalColumn,
          );
          window.open(url, '_self');
        },
        // onAskClaude
        (menuItem) => {
          showAskModal(askModal, menuItem.componentName, async (instruction) => {
            await runAskClaude({
              instruction,
              context: {
                componentName: menuItem.componentName,
                fiber: menuItem.fiber,
                element: target,
                filePath: menuItem.filePath,
                line: menuItem.line,
              },
              resolved: capturedResolved,
            });
            hideAskModal(askModal);
          });
        },
        item, // skipToAction → Stage 2 직행
      );
    };

    const handleContextMenu = async (e: MouseEvent) => {
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

      // Resolve all sources in parallel — source maps are prefetched on modifier keydown
      const resolvedEntries = await Promise.all(
        ancestry.map(async ({ fiber: f, name }) => {
          const resolved = await resolveComponentSource(
            f,
            sourceMapCache,
            projectRoot,
          ).catch(() => null);
          return { fiber: f, name, resolved };
        }),
      );

      // Guard: user may have released modifier key while resolving
      if (!isModifierHeld) return;

      // Filter out node_modules (React 19 + Turbopack: filePath is the resolved source path)
      const userEntries = resolvedEntries.filter(
        ({ resolved }) => !resolved?.filePath.includes('node_modules'),
      );

      if (userEntries.length === 0) return;

      const capturedTarget = target;

      const items: ContextMenuItem[] = userEntries.map(
        ({ fiber: f, name, resolved }) => ({
          componentName: name,
          fiber: f,
          filePath: resolved
            ? toRelativePath(resolved.filePath, projectRoot)
            : undefined,
          line: resolved?.originalLine,
        }),
      );

      showContextMenu(
        contextMenu,
        e.clientX,
        e.clientY,
        items,
        // onGoToCode — reuse already-resolved source
        (item) => {
          const ent = userEntries.find((en) => en.fiber === item.fiber);
          if (ent?.resolved) {
            const url = buildEditorUrl(
              editor,
              ent.resolved.filePath,
              ent.resolved.originalLine,
              ent.resolved.originalColumn,
            );
            window.open(url, '_self');
          } else {
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
          }
        },
        // onAskClaude — reuse already-resolved source
        (item) => {
          const ent = userEntries.find((en) => en.fiber === item.fiber);
          const resolved = ent?.resolved ?? null;
          showAskModal(askModal, item.componentName, async (instruction) => {
            await runAskClaude({
              instruction,
              context: {
                componentName: item.componentName,
                fiber: item.fiber,
                element: capturedTarget,
                filePath: item.filePath,
                line: item.line,
              },
              resolved,
            });
            hideAskModal(askModal);
          });
        },
        undefined, // skipToAction
        // onHover — 부모 항목 호버 시 오버레이 이동
        (item) => {
          const rect = getFiberBoundingRect(item.fiber);
          if (rect) positionOverlayByRect(elements, rect, item.componentName);
        },
        // onLeave — 메뉴 밖으로 나가면 오버레이 숨김
        () => { hideOverlay(elements); },
      );
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
      removeAskModal(askModal);
      if (previewPanel) removePreviewPanel(previewPanel);
      if (inspectDebounceTimer) clearTimeout(inspectDebounceTimer);
      document.body.style.cursor = '';
    };
  }, [isEnabled, editor, projectRoot, modifier, highlightColor, showPreview]);

  return null;
}
