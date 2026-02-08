import type { FiberInspection, PropEntry, HookEntry } from '../types';

export interface PreviewPanelElements {
  panel: HTMLDivElement;
}

/** Create the preview panel container, appended to document.body */
export function createPreviewPanel(): PreviewPanelElements {
  const panel = document.createElement('div');
  panel.style.cssText = `
    position: fixed; z-index: 99999; pointer-events: none;
    background: #1e293b; color: #f8fafc;
    border-radius: 8px; padding: 8px 0;
    font-size: 12px; font-family: ui-monospace, monospace;
    box-shadow: 0 4px 16px rgba(0,0,0,0.4);
    border: 1px solid rgba(255,255,255,0.1);
    min-width: 200px; max-width: 360px;
    max-height: 300px; overflow-y: auto;
    display: none;
  `;
  document.body.appendChild(panel);
  return { panel };
}

/** Build a section header row */
function createSectionHeader(text: string): HTMLDivElement {
  const header = document.createElement('div');
  header.style.cssText =
    'padding: 2px 10px 4px; color: #93c5fd; font-size: 11px; font-weight: 600; border-bottom: 1px solid rgba(255,255,255,0.06);';
  header.textContent = text;
  return header;
}

/** Build a key-value row for props or class state */
function createPropRow(entry: PropEntry): HTMLDivElement {
  const row = document.createElement('div');
  row.style.cssText =
    'padding: 2px 10px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;';

  const keySpan = document.createElement('span');
  keySpan.style.color = '#c084fc';
  keySpan.textContent = entry.key;

  const eqSpan = document.createElement('span');
  eqSpan.style.color = '#64748b';
  eqSpan.textContent = ' = ';

  const valSpan = document.createElement('span');
  valSpan.style.color = getValueColor(entry.value.type);
  valSpan.textContent = entry.value.display;

  row.appendChild(keySpan);
  row.appendChild(eqSpan);
  row.appendChild(valSpan);
  return row;
}

/** Build a row for hook state */
function createHookRow(entry: HookEntry): HTMLDivElement {
  const row = document.createElement('div');
  row.style.cssText =
    'padding: 2px 10px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;';

  const typeSpan = document.createElement('span');
  typeSpan.style.color = '#fbbf24';
  typeSpan.textContent = entry.hookType;

  const sepSpan = document.createElement('span');
  sepSpan.style.color = '#64748b';
  sepSpan.textContent = ': ';

  const valSpan = document.createElement('span');
  valSpan.style.color = getValueColor(entry.value.type);
  valSpan.textContent = entry.value.display;

  row.appendChild(typeSpan);
  row.appendChild(sepSpan);
  row.appendChild(valSpan);
  return row;
}

/** Get a display color based on the serialized value type */
function getValueColor(type: string): string {
  switch (type) {
    case 'string':
      return '#a5d6a7'; // green
    case 'number':
      return '#90caf9'; // blue
    case 'boolean':
      return '#ffcc80'; // orange
    case 'null':
    case 'undefined':
      return '#78909c'; // gray
    case 'function':
      return '#ce93d8'; // purple
    case 'element':
      return '#93c5fd'; // light blue
    default:
      return '#f8fafc'; // white
  }
}

/** Show the preview panel positioned relative to target and tooltip */
export function showPreviewPanel(
  elements: PreviewPanelElements,
  targetRect: DOMRect,
  tooltipRect: DOMRect,
  inspection: FiberInspection,
): void {
  const { panel } = elements;
  panel.innerHTML = '';

  const hasProps = inspection.props.length > 0;
  const hasHooks = inspection.hooks.length > 0;
  const hasClassState =
    inspection.isClassComponent && inspection.classState !== null && inspection.classState.length > 0;

  // If nothing to show, hide
  if (!hasProps && !hasHooks && !hasClassState) {
    panel.style.display = 'none';
    return;
  }

  // Props section
  if (hasProps) {
    panel.appendChild(createSectionHeader(`Props (${inspection.props.length})`));
    for (const entry of inspection.props) {
      panel.appendChild(createPropRow(entry));
    }
  }

  // Hooks section (function components)
  if (hasHooks) {
    panel.appendChild(createSectionHeader(`Hooks (${inspection.hooks.length})`));
    for (const entry of inspection.hooks) {
      panel.appendChild(createHookRow(entry));
    }
  }

  // Class state section
  if (hasClassState) {
    panel.appendChild(
      createSectionHeader(`State (${inspection.classState!.length})`),
    );
    for (const entry of inspection.classState!) {
      panel.appendChild(createPropRow(entry));
    }
  }

  // Render count footer
  const footer = document.createElement('div');
  footer.style.cssText =
    'padding: 4px 10px 2px; color: #64748b; font-size: 11px; border-top: 1px solid rgba(255,255,255,0.06); margin-top: 2px;';
  footer.textContent = `Renders: ${inspection.renderCount}`;
  panel.appendChild(footer);

  // Show and position
  panel.style.display = 'block';

  // Calculate position: prefer RIGHT of target, fallback LEFT, then BELOW tooltip
  const panelWidth = panel.offsetWidth || 220;
  const panelHeight = panel.offsetHeight || 100;
  const gap = 8;
  const margin = 8;

  const rightSpace = window.innerWidth - targetRect.right;
  const leftSpace = targetRect.left;

  let x: number;
  let y: number;

  if (rightSpace >= panelWidth + gap + margin) {
    // Place to the RIGHT of target
    x = targetRect.right + gap;
    y = targetRect.top;
  } else if (leftSpace >= panelWidth + gap + margin) {
    // Place to the LEFT of target
    x = targetRect.left - panelWidth - gap;
    y = targetRect.top;
  } else {
    // Place BELOW tooltip
    x = tooltipRect.left;
    y = tooltipRect.bottom + gap;
  }

  // Clamp to viewport
  x = Math.max(margin, Math.min(x, window.innerWidth - panelWidth - margin));
  y = Math.max(margin, Math.min(y, window.innerHeight - panelHeight - margin));

  panel.style.left = `${x}px`;
  panel.style.top = `${y}px`;
}

/** Hide the preview panel */
export function hidePreviewPanel(elements: PreviewPanelElements): void {
  elements.panel.style.display = 'none';
  elements.panel.innerHTML = '';
}

/** Remove preview panel from DOM */
export function removePreviewPanel(elements: PreviewPanelElements): void {
  elements.panel.remove();
}
