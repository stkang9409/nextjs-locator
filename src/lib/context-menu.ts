import type { ContextMenuItem } from '../types';

export interface ContextMenuElements {
  container: HTMLDivElement;
}

/** Create the context menu container, appended to document.body */
export function createContextMenu(): ContextMenuElements {
  const container = document.createElement('div');
  container.style.cssText = `
    position: fixed; z-index: 100000;
    background: #1e293b; color: #f8fafc;
    border-radius: 8px; padding: 4px 0;
    font-size: 13px; font-family: ui-monospace, monospace;
    box-shadow: 0 4px 16px rgba(0,0,0,0.4);
    min-width: 240px; max-width: 480px;
    display: none; outline: none;
    border: 1px solid rgba(255,255,255,0.1);
    overflow: hidden;
  `;
  container.setAttribute('role', 'menu');
  container.tabIndex = -1;
  document.body.appendChild(container);
  return { container };
}

/** Show the context menu at a position with the given items */
export function showContextMenu(
  elements: ContextMenuElements,
  x: number,
  y: number,
  items: ContextMenuItem[],
  onSelect: (item: ContextMenuItem) => void,
): void {
  const { container } = elements;
  container.innerHTML = '';

  let focusedIndex = -1;
  const rows: HTMLDivElement[] = [];

  items.forEach((item, index) => {
    const row = document.createElement('div');
    row.setAttribute('role', 'menuitem');
    row.tabIndex = -1;
    row.style.cssText = `
      padding: 6px 12px; cursor: pointer;
      display: flex; align-items: center; gap: 8px;
      transition: background 0.1s;
    `;

    const nameSpan = document.createElement('span');
    nameSpan.textContent = `<${item.componentName}>`;
    nameSpan.style.cssText = 'color: #93c5fd; flex-shrink: 0;';
    row.appendChild(nameSpan);

    if (item.filePath) {
      const pathSpan = document.createElement('span');
      pathSpan.setAttribute('data-path', '');
      pathSpan.textContent = `${item.filePath}:${item.line ?? ''}`;
      pathSpan.style.cssText =
        'color: #94a3b8; font-size: 11px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;';
      row.appendChild(pathSpan);
    }

    row.addEventListener('mouseenter', () => {
      rows.forEach((r) => (r.style.background = ''));
      row.style.background = 'rgba(255,255,255,0.1)';
      focusedIndex = index;
    });
    row.addEventListener('mouseleave', () => {
      row.style.background = '';
    });
    row.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      onSelect(item);
      hideContextMenu(elements);
    });

    container.appendChild(row);
    rows.push(row);
  });

  // Position within viewport
  container.style.display = 'block';
  const menuWidth = container.offsetWidth || 300;
  const menuHeight = container.offsetHeight || items.length * 32;
  container.style.left = `${Math.min(x, window.innerWidth - menuWidth - 8)}px`;
  container.style.top = `${Math.min(y, window.innerHeight - menuHeight - 8)}px`;
  container.focus();

  // Keyboard navigation
  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      focusedIndex = Math.min(focusedIndex + 1, items.length - 1);
      rows.forEach((r) => (r.style.background = ''));
      rows[focusedIndex].style.background = 'rgba(255,255,255,0.1)';
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      focusedIndex = Math.max(focusedIndex - 1, 0);
      rows.forEach((r) => (r.style.background = ''));
      rows[focusedIndex].style.background = 'rgba(255,255,255,0.1)';
    } else if (e.key === 'Enter' && focusedIndex >= 0) {
      e.preventDefault();
      onSelect(items[focusedIndex]);
      hideContextMenu(elements);
    } else if (e.key === 'Escape') {
      hideContextMenu(elements);
    }
  };

  container.addEventListener('keydown', handleKeyDown);
  (container as any)._keydownHandler = handleKeyDown;
}

/** Update a single context menu item's file path display */
export function updateContextMenuItem(
  elements: ContextMenuElements,
  index: number,
  item: ContextMenuItem,
): void {
  const row = elements.container.children[index] as HTMLDivElement;
  if (!row) return;

  let pathSpan = row.querySelector('[data-path]') as HTMLSpanElement;
  if (!pathSpan && item.filePath) {
    pathSpan = document.createElement('span');
    pathSpan.setAttribute('data-path', '');
    pathSpan.style.cssText =
      'color: #94a3b8; font-size: 11px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;';
    row.appendChild(pathSpan);
  }
  if (pathSpan && item.filePath) {
    pathSpan.textContent = `${item.filePath}:${item.line ?? ''}`;
  }
}

/** Hide the context menu */
export function hideContextMenu(elements: ContextMenuElements): void {
  elements.container.style.display = 'none';
  elements.container.innerHTML = '';
  const handler = (elements.container as any)._keydownHandler;
  if (handler) {
    elements.container.removeEventListener('keydown', handler);
    delete (elements.container as any)._keydownHandler;
  }
}

/** Remove context menu from DOM */
export function removeContextMenu(elements: ContextMenuElements): void {
  hideContextMenu(elements);
  elements.container.remove();
}

/** Check if context menu is currently visible */
export function isContextMenuVisible(elements: ContextMenuElements): boolean {
  return elements.container.style.display !== 'none';
}
