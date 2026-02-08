import type { OriginalPosition } from '../types';

const BASE64_CHARS =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/**
 * Decode VLQ mappings to find the original source position for a
 * given generated line and column.
 *
 * Mapping format: lines separated by ';', segments by ','.
 * Each segment: [genCol, sourceIdx, origLine, origCol, nameIdx]
 * All values are relative to the previous segment (VLQ-encoded).
 */
export function decodeOriginalPosition(
  mappings: string,
  targetLine: number,
  targetColumn: number,
): OriginalPosition | null {
  const generatedLines = mappings.split(';');

  if (targetLine >= generatedLines.length) return null;

  // Cumulative state (VLQ values are relative to previous)
  let accGeneratedColumn = 0;
  let _accSourceIndex = 0;
  let accOriginalLine = 0;
  let accOriginalColumn = 0;

  for (let lineIdx = 0; lineIdx <= targetLine; lineIdx++) {
    const lineMapping = generatedLines[lineIdx];
    if (!lineMapping) continue;

    accGeneratedColumn = 0; // Generated column resets each line
    const segments = lineMapping.split(',');

    for (const segment of segments) {
      const decoded = decodeVLQSegment(segment);
      if (!decoded || decoded.length < 4) continue;

      accGeneratedColumn += decoded[0];
      _accSourceIndex += decoded[1];
      accOriginalLine += decoded[2];
      accOriginalColumn += decoded[3];

      if (lineIdx === targetLine && accGeneratedColumn >= targetColumn) {
        return {
          originalLine: accOriginalLine + 1, // 0-indexed → 1-indexed
          originalColumn: accOriginalColumn,
        };
      }
    }
  }

  // If we decoded to targetLine but didn't find exact column, return last mapping
  return {
    originalLine: accOriginalLine + 1,
    originalColumn: accOriginalColumn,
  };
}

/** Decode a single VLQ segment into an array of numbers */
export function decodeVLQSegment(segment: string): number[] | null {
  if (!segment) return null;

  const values: number[] = [];
  let i = 0;

  while (i < segment.length) {
    let value = 0;
    let shift = 0;
    let continuation = true;

    while (continuation && i < segment.length) {
      const char = segment[i++];
      const digit = BASE64_CHARS.indexOf(char);
      if (digit === -1) return null;

      continuation = (digit & 32) !== 0;
      value += (digit & 31) << shift;
      shift += 5;
    }

    // Sign bit is the least significant bit
    const isNegative = (value & 1) !== 0;
    value >>= 1;
    values.push(isNegative ? -value : value);
  }

  return values;
}
