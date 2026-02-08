'use client';

import { useEffect } from 'react';
import type { LocatorProps } from './types';
import type { SourceMapSections } from './types';
import {
  getFiberFromElement,
  findNearestComponentFiber,
  getComponentName,
  extractStackFrame,
} from './lib/fiber';
import { resolveSourceMap } from './lib/source-map';
import { buildEditorUrl } from './lib/editor';
import {
  createOverlay,
  positionOverlay,
  hideOverlay,
  removeOverlay,
} from './lib/overlay';

const MODIFIER_KEYS: Record<string, string> = {
  alt: 'Alt',
  ctrl: 'Control',
  meta: 'Meta',
  shift: 'Shift',
};

/**
 * Dev Locator — Alt(Option)+Click to open source code in your editor.
 *
 * Uses React 19's _debugStack and Turbopack source maps to resolve
 * the original file path and line number. Zero external dependencies.
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
}: LocatorProps = {}) {
  const isEnabled = enabled ?? process.env.NODE_ENV === 'development';

  useEffect(() => {
    if (!isEnabled) return;

    const sourceMapCache = new Map<string, SourceMapSections>();
    const elements = createOverlay(highlightColor);
    const modifierKey = MODIFIER_KEYS[modifier] ?? 'Alt';

    let isModifierHeld = false;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === modifierKey) {
        isModifierHeld = true;
        document.body.style.cursor = 'crosshair';
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === modifierKey) {
        isModifierHeld = false;
        hideOverlay(elements);
        document.body.style.cursor = '';
      }
    };

    const handleMouseMove = (e: MouseEvent) => {
      if (!isModifierHeld) return;

      const target = document.elementFromPoint(
        e.clientX,
        e.clientY,
      ) as HTMLElement;
      if (
        !target ||
        target === elements.overlay ||
        target === elements.tooltip
      )
        return;

      const fiber = getFiberFromElement(target);
      const componentFiber = fiber ? findNearestComponentFiber(fiber) : null;
      const name = componentFiber ? getComponentName(componentFiber) : null;

      positionOverlay(elements, target, name);
    };

    const handleClick = async (e: MouseEvent) => {
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

      // Extract chunk URL + line/column from _debugStack
      let stackInfo = extractStackFrame(fiber._debugStack);
      if (!stackInfo) {
        const componentFiber = findNearestComponentFiber(fiber);
        if (componentFiber) {
          stackInfo = extractStackFrame(componentFiber._debugStack);
        }
      }

      if (!stackInfo) {
        console.warn('[nextjs-locator] Could not extract stack frame.');
        return;
      }

      // Resolve original file + line via source map
      try {
        const resolved = await resolveSourceMap(
          stackInfo.chunkUrl,
          stackInfo.line,
          stackInfo.column,
          sourceMapCache,
        );

        if (resolved) {
          const url = buildEditorUrl(
            editor,
            resolved.filePath,
            resolved.originalLine,
            resolved.originalColumn,
          );
          window.open(url, '_self');
        } else {
          console.warn(
            '[nextjs-locator] Could not resolve source map.',
            stackInfo,
          );
        }
      } catch (err) {
        console.warn('[nextjs-locator] Source map error:', err);
      }
    };

    const handleBlur = () => {
      isModifierHeld = false;
      hideOverlay(elements);
      document.body.style.cursor = '';
    };

    // Register listeners on capture phase to intercept before app handlers
    document.addEventListener('keydown', handleKeyDown, true);
    document.addEventListener('keyup', handleKeyUp, true);
    document.addEventListener('mousemove', handleMouseMove, true);
    document.addEventListener('click', handleClick, true);
    window.addEventListener('blur', handleBlur);

    return () => {
      document.removeEventListener('keydown', handleKeyDown, true);
      document.removeEventListener('keyup', handleKeyUp, true);
      document.removeEventListener('mousemove', handleMouseMove, true);
      document.removeEventListener('click', handleClick, true);
      window.removeEventListener('blur', handleBlur);
      removeOverlay(elements);
      document.body.style.cursor = '';
    };
  }, [isEnabled, editor, projectRoot, modifier, highlightColor]);

  return null;
}
