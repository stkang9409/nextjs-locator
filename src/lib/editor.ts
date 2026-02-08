import type { EditorProtocol } from '../types';

const EDITOR_PROTOCOLS: Record<EditorProtocol, string> = {
  vscode: 'vscode://file',
  'vscode-insiders': 'vscode-insiders://file',
  cursor: 'cursor://file',
  webstorm: 'webstorm://open?file=',
  zed: 'zed://file',
};

/**
 * Build a URL that opens the given file at line:column in the target editor.
 *
 * Examples:
 * - vscode:    vscode://file/path/to/file.tsx:42:10
 * - webstorm:  webstorm://open?file=/path/to/file.tsx&line=42&column=10
 */
export function buildEditorUrl(
  editor: EditorProtocol,
  filePath: string,
  line: number,
  column: number,
): string {
  const protocol = EDITOR_PROTOCOLS[editor];

  if (editor === 'webstorm') {
    return `${protocol}${filePath}&line=${line}&column=${column}`;
  }

  return `${protocol}${filePath}:${line}:${column}`;
}
