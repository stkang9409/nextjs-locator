# Changelog

## 0.2.0 (2025-02-08)

### Features

- **File path tooltip** — Hover shows `<ComponentName> — src/path/file.tsx:33` with async source map resolution
- **Component hierarchy menu** — Alt+Right-click shows parent component ancestry, each item clickable
- **Source map prefetch** — Prefetches `.map` files when modifier key is pressed for instant resolution
- **React 18 `_debugSource` fallback** — Works with React 18 projects (no source map fetch needed)
- **Keyboard navigation** — Arrow Up/Down, Enter, Escape in hierarchy menu

## 0.1.0 (2025-02-08)

### Features

- Alt+Click to open source files in editor
- React 19 `_debugStack` support
- Turbopack sections source map format
- VLQ source map decoder
- Multi-editor support (VS Code, Cursor, WebStorm, Zed, VS Code Insiders)
- Configurable modifier key, highlight color, and project root
- Zero external dependencies
- Production tree-shaking (completely removed in production builds)
