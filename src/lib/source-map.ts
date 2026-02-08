import type { SourceMapSections, ResolvedSource } from '../types';
import { decodeOriginalPosition } from './vlq';

/**
 * Prefetch a source map into the cache without resolving a specific position.
 * Non-blocking, best-effort. Returns immediately if already cached.
 */
export async function prefetchSourceMap(
  chunkUrl: string,
  cache: Map<string, SourceMapSections>,
): Promise<void> {
  if (cache.has(chunkUrl)) return;

  try {
    const resp = await fetch(chunkUrl + '.map');
    if (!resp.ok) return;
    const sm = await resp.json();
    if (sm.sections) {
      cache.set(chunkUrl, sm.sections as SourceMapSections);
    }
  } catch {
    // Silently fail — prefetch is best-effort
  }
}

/**
 * Convert an absolute file path to a relative one for display.
 * Strips projectRoot prefix, or looks for common markers like src/, app/.
 */
export function toRelativePath(
  absolutePath: string,
  projectRoot?: string,
): string {
  const root =
    projectRoot ?? process.env.NEXT_PUBLIC_PROJECT_ROOT ?? '';
  if (root && absolutePath.startsWith(root)) {
    const relative = absolutePath.slice(root.length);
    return relative.startsWith('/') ? relative.slice(1) : relative;
  }
  // Try to find common directory markers
  const markers = ['/src/', '/app/', '/pages/', '/components/'];
  for (const marker of markers) {
    const idx = absolutePath.indexOf(marker);
    if (idx !== -1) return absolutePath.slice(idx + 1);
  }
  // Last resort: return last 3 path segments
  const parts = absolutePath.split('/');
  return parts.slice(-3).join('/');
}

/**
 * Fetch and cache source map, then resolve the original source position
 * for a given generated line and column.
 *
 * Supports Turbopack's "sections" format where a single .map file
 * contains multiple source map sections with line offsets.
 */
export async function resolveSourceMap(
  chunkUrl: string,
  generatedLine: number,
  generatedColumn: number,
  cache: Map<string, SourceMapSections>,
): Promise<ResolvedSource | null> {
  let sections = cache.get(chunkUrl);

  if (!sections) {
    const resp = await fetch(chunkUrl + '.map');
    if (!resp.ok) return null;
    const sm = await resp.json();
    sections = sm.sections as SourceMapSections;
    if (!sections) return null;
    cache.set(chunkUrl, sections);
  }

  // Find the section whose offset.line <= generatedLine (last match)
  let matchedSection = null;
  for (let i = sections.length - 1; i >= 0; i--) {
    if (sections[i].offset.line <= generatedLine) {
      matchedSection = sections[i];
      break;
    }
  }

  if (!matchedSection || !matchedSection.map.sources.length) return null;

  // Extract absolute file path from source URI
  const sourceUri = matchedSection.map.sources[0];
  const filePath = sourceUri.startsWith('file://')
    ? sourceUri.slice(7)
    : sourceUri.startsWith('turbopack:///')
      ? extractPathFromTurbopack(sourceUri)
      : sourceUri;

  // Decode VLQ mappings within the section to find original position
  const sectionRelativeLine = generatedLine - matchedSection.offset.line;
  const originalPos = decodeOriginalPosition(
    matchedSection.map.mappings,
    sectionRelativeLine,
    generatedColumn,
  );

  return {
    filePath,
    originalLine: originalPos?.originalLine ?? 1,
    originalColumn: originalPos?.originalColumn ?? 0,
  };
}

/**
 * Convert a turbopack:///[project]/... URI to an absolute file path.
 *
 * Examples:
 * - turbopack:///[project]/Users/foo/project/src/App.tsx → /Users/foo/project/src/App.tsx
 * - turbopack:///[project]/src/App.tsx → {projectRoot}/src/App.tsx
 */
export function extractPathFromTurbopack(
  uri: string,
  projectRoot?: string,
): string {
  const match = uri.match(/turbopack:\/\/\/\[project\]\/(.*)/);
  if (match) {
    const relativePath = match[1];
    // If the path already starts with an absolute-like structure, prefix with /
    if (relativePath.startsWith('Users/') || relativePath.startsWith('home/')) {
      return '/' + relativePath;
    }
    const root =
      projectRoot ?? process.env.NEXT_PUBLIC_PROJECT_ROOT ?? '';
    return `${root}/${relativePath}`;
  }
  return uri;
}
