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
    // Count occurrences of each hook type for numbering (useState#0, useState#1, ...)
    const typeCounts: Record<string, number> = {};
    for (const h of inspection.hooks) {
      const count = typeCounts[h.hookType] ?? 0;
      typeCounts[h.hookType] = count + 1;
    }
    const typeIndices: Record<string, number> = {};
    for (const h of inspection.hooks) {
      const idx = typeIndices[h.hookType] ?? 0;
      typeIndices[h.hookType] = idx + 1;
      const key = (typeCounts[h.hookType] ?? 0) > 1
        ? `${h.hookType}#${idx}`
        : h.hookType;
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
}): Promise<void> {
  const { instruction, context, resolved } = params;

  const filePath = resolved?.filePath ?? context.filePath ?? '(unknown)';
  const line = resolved?.originalLine ?? context.line ?? 0;

  // Collect fiber inspection
  const inspection: FiberInspection = inspectFiber(context.fiber);

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
  
    });
  }

  openClaudeWithPrompt(prompt);
}
