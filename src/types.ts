/** Supported editor protocols for opening source files */
export type EditorProtocol =
  | 'vscode'
  | 'vscode-insiders'
  | 'cursor'
  | 'webstorm'
  | 'zed';

export interface LocatorProps {
  /** Editor to open files in. Default: 'vscode' */
  editor?: EditorProtocol;
  /** Absolute project root path. Overrides NEXT_PUBLIC_PROJECT_ROOT env var */
  projectRoot?: string;
  /** Keyboard modifier to activate locator. Default: 'alt' */
  modifier?: 'alt' | 'ctrl' | 'meta' | 'shift';
  /** Whether the locator is enabled. Default: true in development */
  enabled?: boolean;
  /** Overlay border color (CSS color). Default: '#ef4444' (red) */
  highlightColor?: string;
}

/** Parsed stack frame from React _debugStack */
export interface StackFrame {
  chunkUrl: string;
  line: number;
  column: number;
}

/** A single section in a Turbopack source map */
export interface SourceMapSection {
  offset: { line: number; column: number };
  map: {
    version: number;
    sources: string[];
    mappings: string;
    names?: string[];
  };
}

export type SourceMapSections = SourceMapSection[];

/** Resolved original source location */
export interface ResolvedSource {
  filePath: string;
  originalLine: number;
  originalColumn: number;
}

/** Decoded original position from VLQ mappings */
export interface OriginalPosition {
  originalLine: number;
  originalColumn: number;
}

/** React 18 _debugSource object on Fiber nodes */
export interface DebugSource {
  fileName: string;
  lineNumber?: number;
  columnNumber?: number;
}

/** Context menu item representing a component in the ancestor chain */
export interface ContextMenuItem {
  componentName: string;
  filePath?: string;
  line?: number;
  /* eslint-disable @typescript-eslint/no-explicit-any */
  fiber: any;
}
