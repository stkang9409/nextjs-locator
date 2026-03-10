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
    min-width: 280px; max-width: 520px;
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
  onGoToCode: (item: ContextMenuItem) => void,
  onAskClaude: (item: ContextMenuItem) => void,
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
      padding: 6px 10px; cursor: default;
      display: flex; align-items: center; gap: 6px;
      transition: background 0.1s;
    `;

    // Component name
    const nameSpan = document.createElement('span');
    nameSpan.textContent = `<${item.componentName}>`;
    nameSpan.style.cssText = 'color: #93c5fd; flex-shrink: 0;';
    row.appendChild(nameSpan);

    // File path (fills available space)
    if (item.filePath) {
      const pathSpan = document.createElement('span');
      pathSpan.setAttribute('data-path', '');
      pathSpan.textContent = `${item.filePath}:${item.line ?? ''}`;
      pathSpan.style.cssText =
        'color: #94a3b8; font-size: 11px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1; min-width: 0;';
      row.appendChild(pathSpan);
    } else {
      // Spacer so buttons stay on the right
      const spacer = document.createElement('span');
      spacer.setAttribute('data-path', '');
      spacer.style.cssText = 'flex: 1;';
      row.appendChild(spacer);
    }

    // "코드로 이동" button
    const codeBtn = document.createElement('button');
    codeBtn.textContent = '↗ 코드';
    codeBtn.title = '소스 코드로 이동';
    codeBtn.style.cssText = `
      padding: 2px 8px; border-radius: 4px; font-size: 11px;
      cursor: pointer; border: 1px solid rgba(255,255,255,0.2);
      background: rgba(255,255,255,0.05); color: #cbd5e1;
      flex-shrink: 0; font-family: inherit; white-space: nowrap;
      transition: background 0.1s;
    `;
    codeBtn.addEventListener('mouseenter', () => {
      codeBtn.style.background = 'rgba(255,255,255,0.15)';
    });
    codeBtn.addEventListener('mouseleave', () => {
      codeBtn.style.background = 'rgba(255,255,255,0.05)';
    });
    codeBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      onGoToCode(item);
      hideContextMenu(elements);
    });
    row.appendChild(codeBtn);

    // "Claude에게 묻기" button
    const claudeBtn = document.createElement('button');
    claudeBtn.textContent = '◎ Claude';
    claudeBtn.title = 'Claude에게 묻기';
    claudeBtn.style.cssText = `
      padding: 2px 8px; border-radius: 4px; font-size: 11px;
      cursor: pointer; border: 1px solid rgba(139,92,246,0.4);
      background: rgba(139,92,246,0.1); color: #a78bfa;
      flex-shrink: 0; font-family: inherit; white-space: nowrap;
      transition: background 0.1s;
    `;
    claudeBtn.addEventListener('mouseenter', () => {
      claudeBtn.style.background = 'rgba(139,92,246,0.25)';
    });
    claudeBtn.addEventListener('mouseleave', () => {
      claudeBtn.style.background = 'rgba(139,92,246,0.1)';
    });
    claudeBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      onAskClaude(item);
      hideContextMenu(elements);
    });
    row.appendChild(claudeBtn);

    row.addEventListener('mouseenter', () => {
      rows.forEach((r) => (r.style.background = ''));
      row.style.background = 'rgba(255,255,255,0.06)';
      focusedIndex = index;
    });
    row.addEventListener('mouseleave', () => {
      row.style.background = '';
    });

    container.appendChild(row);
    rows.push(row);
  });

  // Position within viewport
  container.style.display = 'block';
  const menuWidth = container.offsetWidth || 340;
  const menuHeight = container.offsetHeight || items.length * 36;
  container.style.left = `${Math.min(x, window.innerWidth - menuWidth - 8)}px`;
  container.style.top = `${Math.min(y, window.innerHeight - menuHeight - 8)}px`;
  container.focus();

  // Keyboard navigation
  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      focusedIndex = Math.min(focusedIndex + 1, items.length - 1);
      rows.forEach((r) => (r.style.background = ''));
      rows[focusedIndex].style.background = 'rgba(255,255,255,0.06)';
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      focusedIndex = Math.max(focusedIndex - 1, 0);
      rows.forEach((r) => (r.style.background = ''));
      rows[focusedIndex].style.background = 'rgba(255,255,255,0.06)';
    } else if (e.key === 'Enter' && focusedIndex >= 0) {
      e.preventDefault();
      onGoToCode(items[focusedIndex]);
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
      'color: #94a3b8; font-size: 11px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1; min-width: 0;';
    // Insert after nameSpan (first child)
    const nameSpan = row.firstChild;
    if (nameSpan && nameSpan.nextSibling) {
      row.insertBefore(pathSpan, nameSpan.nextSibling);
    } else {
      row.appendChild(pathSpan);
    }
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
