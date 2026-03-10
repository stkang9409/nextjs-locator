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

  // Position within viewport (set before rendering so we can measure)
  container.style.display = 'block';

  function setKeydownHandler(handler: (e: KeyboardEvent) => void) {
    const prev = (container as any)._keydownHandler;
    if (prev) container.removeEventListener('keydown', prev);
    container.addEventListener('keydown', handler);
    (container as any)._keydownHandler = handler;
  }

  // ── Stage 1: Component list ───────────────────────────────────────────────
  function renderList() {
    container.innerHTML = '';

    let focusedIndex = -1;
    const rows: HTMLDivElement[] = [];

    items.forEach((item, index) => {
      const row = document.createElement('div');
      row.setAttribute('role', 'menuitem');
      row.tabIndex = -1;
      row.style.cssText = `
        padding: 6px 10px; cursor: pointer;
        display: flex; align-items: center; gap: 6px;
        transition: background 0.1s;
      `;

      // Component name
      const nameSpan = document.createElement('span');
      nameSpan.textContent = `<${item.componentName}>`;
      nameSpan.style.cssText = 'color: #93c5fd; flex-shrink: 0;';
      row.appendChild(nameSpan);

      // File path
      if (item.filePath) {
        const pathSpan = document.createElement('span');
        pathSpan.setAttribute('data-path', '');
        pathSpan.textContent = `${item.filePath}:${item.line ?? ''}`;
        pathSpan.style.cssText =
          'color: #94a3b8; font-size: 11px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1; min-width: 0;';
        row.appendChild(pathSpan);
      } else {
        const spacer = document.createElement('span');
        spacer.setAttribute('data-path', '');
        spacer.style.cssText = 'flex: 1;';
        row.appendChild(spacer);
      }

      row.addEventListener('click', () => renderActionPicker(item));

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

    setKeydownHandler((e: KeyboardEvent) => {
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
        renderActionPicker(items[focusedIndex]);
      } else if (e.key === 'Escape') {
        hideContextMenu(elements);
      }
    });

    container.focus();
  }

  // ── Stage 2: Action picker ────────────────────────────────────────────────
  function renderActionPicker(item: ContextMenuItem) {
    container.innerHTML = '';

    // Header: back arrow + component name
    const header = document.createElement('div');
    header.style.cssText = `
      padding: 7px 12px; cursor: pointer; display: flex;
      align-items: center; gap: 8px;
      border-bottom: 1px solid rgba(255,255,255,0.08);
      transition: background 0.1s;
    `;

    const backArrow = document.createElement('span');
    backArrow.textContent = '←';
    backArrow.style.cssText = 'color: #64748b; flex-shrink: 0;';
    header.appendChild(backArrow);

    const headerName = document.createElement('span');
    headerName.textContent = `<${item.componentName}>`;
    headerName.style.cssText = 'color: #93c5fd; font-size: 13px;';
    header.appendChild(headerName);

    header.addEventListener('click', () => renderList());
    header.addEventListener('mouseenter', () => {
      header.style.background = 'rgba(255,255,255,0.04)';
    });
    header.addEventListener('mouseleave', () => {
      header.style.background = '';
    });
    container.appendChild(header);

    // Path subtitle (if available)
    if (item.filePath) {
      const pathLine = document.createElement('div');
      pathLine.setAttribute('data-path', '');
      pathLine.textContent = `${item.filePath}:${item.line ?? ''}`;
      pathLine.style.cssText = `
        padding: 3px 12px 6px;
        color: #64748b; font-size: 10px;
        overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
        border-bottom: 1px solid rgba(255,255,255,0.08);
      `;
      container.appendChild(pathLine);
    }

    // Action rows
    const actionRows: HTMLDivElement[] = [];
    let focusedIndex = -1;

    function makeActionRow(
      icon: string,
      label: string,
      color: string,
      hoverBg: string,
      onClick: () => void,
    ): HTMLDivElement {
      const row = document.createElement('div');
      row.setAttribute('role', 'menuitem');
      row.tabIndex = -1;
      row.style.cssText = `
        padding: 9px 14px; cursor: pointer; display: flex;
        align-items: center; gap: 10px; font-size: 13px;
        transition: background 0.1s; color: ${color};
      `;

      const iconSpan = document.createElement('span');
      iconSpan.textContent = icon;
      iconSpan.style.cssText = 'flex-shrink: 0;';
      row.appendChild(iconSpan);

      const labelSpan = document.createElement('span');
      labelSpan.textContent = label;
      row.appendChild(labelSpan);

      row.addEventListener('click', onClick);
      row.addEventListener('mouseenter', () => {
        actionRows.forEach((r) => (r.style.background = ''));
        row.style.background = hoverBg;
        focusedIndex = actionRows.indexOf(row);
      });
      row.addEventListener('mouseleave', () => {
        row.style.background = '';
      });

      return row;
    }

    const codeRow = makeActionRow(
      '↗',
      '소스 코드로 이동',
      '#cbd5e1',
      'rgba(255,255,255,0.08)',
      () => {
        onGoToCode(item);
        hideContextMenu(elements);
      },
    );

    const claudeRow = makeActionRow(
      '◎',
      'Claude에게 묻기',
      '#a78bfa',
      'rgba(139,92,246,0.15)',
      () => {
        onAskClaude(item);
        hideContextMenu(elements);
      },
    );

    container.appendChild(codeRow);
    container.appendChild(claudeRow);
    actionRows.push(codeRow, claudeRow);

    setKeydownHandler((e: KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        focusedIndex = Math.min(focusedIndex + 1, actionRows.length - 1);
        actionRows.forEach((r) => (r.style.background = ''));
        actionRows[focusedIndex].style.background =
          focusedIndex === 0 ? 'rgba(255,255,255,0.08)' : 'rgba(139,92,246,0.15)';
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        focusedIndex = Math.max(focusedIndex - 1, 0);
        actionRows.forEach((r) => (r.style.background = ''));
        actionRows[focusedIndex].style.background =
          focusedIndex === 0 ? 'rgba(255,255,255,0.08)' : 'rgba(139,92,246,0.15)';
      } else if (e.key === 'Enter' && focusedIndex >= 0) {
        e.preventDefault();
        actionRows[focusedIndex].click();
      } else if (e.key === 'Escape') {
        renderList();
      }
    });

    container.focus();
  }

  // Render first stage
  renderList();

  // Position within viewport
  const menuWidth = container.offsetWidth || 340;
  const menuHeight = container.offsetHeight || items.length * 36;
  container.style.left = `${Math.min(x, window.innerWidth - menuWidth - 8)}px`;
  container.style.top = `${Math.min(y, window.innerHeight - menuHeight - 8)}px`;
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
