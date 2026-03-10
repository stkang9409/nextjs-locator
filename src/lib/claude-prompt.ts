import type { AskContext, FiberInspection, ResolvedSource } from '../types';
import { inspectFiber } from './fiber-inspect';

/* eslint-disable @typescript-eslint/no-explicit-any */

const CSS_PROPS = [
  'display', 'flexDirection', 'flexWrap', 'justifyContent', 'alignItems',
  'alignSelf', 'gap', 'rowGap', 'columnGap', 'gridTemplateColumns',
  'gridTemplateRows', 'width', 'height', 'minWidth', 'minHeight',
  'maxWidth', 'maxHeight', 'padding', 'paddingTop', 'paddingRight',
  'paddingBottom', 'paddingLeft', 'margin', 'marginTop', 'marginRight',
  'marginBottom', 'marginLeft', 'color', 'fontSize', 'fontWeight',
  'fontFamily', 'lineHeight', 'textAlign', 'letterSpacing',
  'background', 'backgroundColor', 'border', 'borderRadius', 'boxShadow',
  'position', 'top', 'left', 'right', 'bottom', 'zIndex',
  'overflow', 'overflowX', 'overflowY', 'transform', 'opacity',
  'cursor', 'pointerEvents',
] as const;

/** Capture a DOM element as a PNG blob using the SVG foreignObject technique */
export async function captureElementScreenshot(
  element: HTMLElement,
): Promise<Blob | null> {
  try {
    const rect = element.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return null;

    const scale = window.devicePixelRatio || 1;
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(rect.width * scale);
    canvas.height = Math.round(rect.height * scale);
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    const html = element.outerHTML;
    const svgData = `<svg xmlns="http://www.w3.org/2000/svg" width="${rect.width}" height="${rect.height}">
      <foreignObject width="100%" height="100%">
        <div xmlns="http://www.w3.org/1999/xhtml">${html}</div>
      </foreignObject>
    </svg>`;

    const blob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);

    return new Promise<Blob | null>((resolve) => {
      const img = new Image();
      img.onload = () => {
        ctx.scale(scale, scale);
        ctx.drawImage(img, 0, 0);
        URL.revokeObjectURL(url);
        canvas.toBlob((b) => resolve(b), 'image/png');
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        resolve(null);
      };
      img.src = url;
    });
  } catch {
    return null;
  }
}

/** Upload a screenshot blob to the given endpoint, returns the saved file path */
export async function uploadScreenshot(
  blob: Blob,
  endpoint: string,
): Promise<string | null> {
  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'image/png' },
      body: blob,
    });
    if (!res.ok) return null;
    const json = await res.json();
    return typeof json?.path === 'string' ? json.path : null;
  } catch {
    return null;
  }
}

/** Truncate outerHTML to a safe length for inclusion in a URI prompt */
export function truncateHtml(html: string, maxLen = 8000): string {
  if (html.length <= maxLen) return html;
  return html.slice(0, maxLen) + '\n<!-- ... truncated -->';
}

/** Serialize key computed CSS properties of an element */
export function collectComputedCss(element: HTMLElement): string {
  try {
    const style = window.getComputedStyle(element);
    const lines: string[] = [];
    for (const prop of CSS_PROPS) {
      const value = style.getPropertyValue(
        prop.replace(/([A-Z])/g, '-$1').toLowerCase(),
      );
      if (value && value !== 'none' && value !== 'normal' && value !== 'auto' && value !== '0px') {
        lines.push(`  ${prop}: ${value};`);
      }
    }
    return lines.join('\n');
  } catch {
    return '';
  }
}

interface PromptParams {
  userInstruction: string;
  componentName: string;
  filePath: string;
  line: number;
  inspection: FiberInspection;
  outerHtml: string;
  computedCss: string;
  screenshotPath: string | null;
}

function serializeInspection(inspection: FiberInspection): {
  propsJson: string | null;
  stateJson: string | null;
} {
  let propsJson: string | null = null;
  let stateJson: string | null = null;

  if (inspection.props.length > 0) {
    const obj: Record<string, string> = {};
    for (const p of inspection.props) obj[p.key] = p.value.display;
    propsJson = JSON.stringify(obj, null, 2);
  }

  if (inspection.isClassComponent && inspection.classState && inspection.classState.length > 0) {
    const obj: Record<string, string> = {};
    for (const p of inspection.classState) obj[p.key] = p.value.display;
    stateJson = JSON.stringify(obj, null, 2);
  } else if (!inspection.isClassComponent && inspection.hooks.length > 0) {
    const obj: Record<string, string> = {};
    for (const h of inspection.hooks) {
      const key = h.hookType === 'useState' ? `state[${h.index}]` : `${h.hookType}[${h.index}]`;
      obj[key] = h.value.display;
    }
    stateJson = JSON.stringify(obj, null, 2);
  }

  return { propsJson, stateJson };
}

/** Build the structured markdown prompt for Claude Code */
export function buildClaudePrompt(params: PromptParams): string {
  const {
    userInstruction,
    componentName,
    filePath,
    line,
    inspection,
    outerHtml,
    computedCss,
    screenshotPath,
  } = params;

  const { propsJson, stateJson } = serializeInspection(inspection);

  const sections: string[] = [];

  sections.push('# UI 컴포넌트 수정 요청');
  sections.push(`## 사용자 지시사항\n${userInstruction || '(지시사항 없음)'}`);
  sections.push(
    `## 컴포넌트 정보\n- 컴포넌트: <${componentName}>\n- 파일: ${filePath}\n- 라인: ${line}`,
  );

  if (propsJson) {
    sections.push(`## Props\n\`\`\`json\n${propsJson}\n\`\`\``);
  }

  if (stateJson) {
    sections.push(`## State / Hooks\n\`\`\`json\n${stateJson}\n\`\`\``);
  }

  if (outerHtml) {
    sections.push(`## DOM HTML 구조 (렌더링된 출력)\n\`\`\`html\n${outerHtml}\n\`\`\``);
  }

  if (computedCss) {
    sections.push(`## 적용된 CSS (주요 스타일)\n\`\`\`css\n${computedCss}\n\`\`\``);
  }

  if (screenshotPath) {
    sections.push(`## 스크린샷\n파일 경로: ${screenshotPath}`);
  }

  return sections.join('\n\n');
}

/** Open Claude Code with a pre-filled prompt */
export function openClaudeWithPrompt(prompt: string): void {
  const encoded = encodeURIComponent(prompt);
  window.open(`vscode://anthropic.claude-code/open?prompt=${encoded}`, '_self');
}

/** Main orchestration: collect context, build prompt, open Claude Code */
export async function runAskClaude(params: {
  instruction: string;
  context: AskContext;
  resolved: ResolvedSource | null;
  screenshotEndpoint?: string;
}): Promise<void> {
  const { instruction, context, resolved, screenshotEndpoint } = params;

  const filePath = resolved?.filePath ?? context.filePath ?? '(unknown)';
  const line = resolved?.originalLine ?? context.line ?? 0;

  // Collect fiber inspection
  const inspection: FiberInspection = inspectFiber(context.fiber);

  // Screenshot capture (optional)
  let screenshotPath: string | null = null;
  if (screenshotEndpoint) {
    const blob = await captureElementScreenshot(context.element);
    if (blob) {
      screenshotPath = await uploadScreenshot(blob, screenshotEndpoint);
    }
  }

  // HTML structure
  let outerHtml = '';
  try {
    outerHtml = truncateHtml(context.element.outerHTML);
  } catch {
    // element detached — skip
  }

  // Computed CSS
  let computedCss = '';
  try {
    computedCss = collectComputedCss(context.element);
  } catch {
    // skip
  }

  // Build prompt with URL length safety
  let prompt = buildClaudePrompt({
    userInstruction: instruction,
    componentName: context.componentName,
    filePath,
    line,
    inspection,
    outerHtml,
    computedCss,
    screenshotPath,
  });

  // If URL would be too long, reduce HTML then drop it entirely
  if (encodeURIComponent(prompt).length > 28000) {
    const smallerHtml = truncateHtml(context.element.outerHTML, 4000);
    prompt = buildClaudePrompt({
      userInstruction: instruction,
      componentName: context.componentName,
      filePath,
      line,
      inspection,
      outerHtml: smallerHtml,
      computedCss,
      screenshotPath,
    });
  }

  if (encodeURIComponent(prompt).length > 28000) {
    prompt = buildClaudePrompt({
      userInstruction: instruction,
      componentName: context.componentName,
      filePath,
      line,
      inspection,
      outerHtml: '',
      computedCss,
      screenshotPath,
    });
  }

  openClaudeWithPrompt(prompt);
}
