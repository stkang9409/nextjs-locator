export interface OverlayElements {
  overlay: HTMLDivElement;
  tooltip: HTMLDivElement;
}

/** Create the overlay highlight box and tooltip, appended to document.body */
export function createOverlay(highlightColor: string): OverlayElements {
  const overlay = document.createElement('div');
  overlay.style.cssText = `
    position: fixed; pointer-events: none; z-index: 99999;
    border: 2px solid ${highlightColor}; border-radius: 4px;
    background: ${hexToRgba(highlightColor, 0.08)};
    transition: top 0.05s ease-out, left 0.05s ease-out,
                width 0.05s ease-out, height 0.05s ease-out;
    display: none;
  `;
  document.body.appendChild(overlay);

  const tooltip = document.createElement('div');
  tooltip.style.cssText = `
    position: fixed; pointer-events: none; z-index: 99999;
    background: #1e293b; color: #f8fafc; padding: 4px 8px;
    border-radius: 4px; font-size: 12px; font-family: ui-monospace, monospace;
    white-space: nowrap; display: none;
    box-shadow: 0 2px 8px rgba(0,0,0,0.3);
  `;
  document.body.appendChild(tooltip);

  return { overlay, tooltip };
}

/** Position the overlay and tooltip around a target element */
export function positionOverlay(
  elements: OverlayElements,
  target: HTMLElement,
  componentName: string | null,
): void {
  const rect = target.getBoundingClientRect();
  const { overlay, tooltip } = elements;

  overlay.style.display = 'block';
  overlay.style.left = `${rect.left}px`;
  overlay.style.top = `${rect.top}px`;
  overlay.style.width = `${rect.width}px`;
  overlay.style.height = `${rect.height}px`;

  if (componentName) {
    tooltip.textContent = `<${componentName}>`;
    tooltip.style.display = 'block';
    tooltip.style.left = `${rect.left}px`;
    tooltip.style.top = `${Math.max(0, rect.top - 28)}px`;
  } else {
    tooltip.style.display = 'none';
  }
}

/** Hide overlay and tooltip */
export function hideOverlay(elements: OverlayElements): void {
  elements.overlay.style.display = 'none';
  elements.tooltip.style.display = 'none';
}

/** Update tooltip text without repositioning */
export function updateTooltipText(
  elements: OverlayElements,
  text: string,
): void {
  elements.tooltip.textContent = text;
}

/** Remove overlay elements from DOM */
export function removeOverlay(elements: OverlayElements): void {
  elements.overlay.remove();
  elements.tooltip.remove();
}

/** Convert hex color to rgba string */
function hexToRgba(hex: string, alpha: number): string {
  // Handle non-hex colors by falling back to rgba with the color as-is
  const match = hex.match(/^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i);
  if (!match) return `rgba(239, 68, 68, ${alpha})`;
  const r = parseInt(match[1], 16);
  const g = parseInt(match[2], 16);
  const b = parseInt(match[3], 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
