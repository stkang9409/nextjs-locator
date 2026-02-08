# nextjs-locator

**Alt+Click any React component to open its source in your editor.**

Zero-config for Next.js 15/16 with Turbopack. No Babel plugin, no browser extension, no setup.

<!-- TODO: Add demo GIF here -->
https://github.com/user-attachments/assets/4aa73a8c-ff03-4017-8950-14b70417cea2

## Features

- **Zero config** — Drop a single component into your layout, done
- **React 18 + 19** — Uses `_debugStack` (React 19) with `_debugSource` fallback (React 18)
- **Turbopack native** — Decodes Turbopack's sectioned source map format
- **Webpack compatible** — Also works with Next.js webpack builds
- **File path tooltip** — Shows resolved source file path and line on hover
- **Props/State preview** — Hover shows component props, hook state, and render count
- **Component hierarchy** — Right-click to see the full React component ancestry
- **Source map prefetch** — Prefetches source maps on modifier key press for instant resolution
- **Compile-time fast path** — Optional `nextjs-locator-swc` companion for instant resolution via build-time attributes
- **Multi-editor** — VS Code, Cursor, WebStorm, Zed, VS Code Insiders
- **Zero dependencies** — Only requires `react` as a peer dependency
- **Production safe** — Tree-shaken completely from production builds
- **Configurable** — Modifier key, highlight color, editor choice, preview toggle via props

## How It Works

1. Listens for **modifier key + mousemove** to find the DOM element under cursor
2. Traverses the **React Fiber tree** via `__reactFiber$` internal key
3. Source resolution priority:
   - **`data-locator-source`** attribute (instant, if `nextjs-locator-swc` is used)
   - **`_debugSource`** (React 18, synchronous)
   - **`_debugStack`** + source map (React 19, async with prefetch)
4. **Prefetches `.map` source maps** when modifier key is pressed (Turbopack sections format)
5. **Decodes VLQ mappings** to resolve the original file path, line, and column
6. Displays **file path in tooltip** and **props/state preview panel**
7. Opens `vscode://file/path:line:column` (or your editor's protocol)

## Installation

```bash
npm install nextjs-locator
# or
yarn add nextjs-locator
# or
pnpm add nextjs-locator
```

## Quick Start

### Next.js App Router

```tsx
// app/layout.tsx
import { Locator } from 'nextjs-locator';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html>
      <body>
        {children}
        <Locator />
      </body>
    </html>
  );
}
```

### Next.js Pages Router

```tsx
// pages/_app.tsx
import { Locator } from 'nextjs-locator';
import type { AppProps } from 'next/app';

export default function App({ Component, pageProps }: AppProps) {
  return (
    <>
      <Component {...pageProps} />
      <Locator />
    </>
  );
}
```

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| **Alt + Hover** | Highlight component with name and source file path |
| **Alt + Click** | Open component source in editor |
| **Alt + Right-click** | Show component hierarchy menu |
| **Arrow Up/Down** | Navigate hierarchy menu |
| **Enter** | Open selected component source |
| **Escape** | Dismiss hierarchy menu |

> On Mac, use **Option** instead of Alt.

## Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `editor` | `EditorProtocol` | `'vscode'` | Editor to open files in |
| `modifier` | `'alt' \| 'ctrl' \| 'meta' \| 'shift'` | `'alt'` | Modifier key to activate |
| `highlightColor` | `string` | `'#ef4444'` | CSS color for the overlay border |
| `projectRoot` | `string` | — | Absolute project root path |
| `enabled` | `boolean` | `true` in dev | Force enable/disable |
| `showPreview` | `boolean` | `true` | Show props/state preview panel on hover |

### Editor Support

| Editor | `editor` value | Protocol |
|--------|----------------|----------|
| VS Code | `'vscode'` | `vscode://file` |
| Cursor | `'cursor'` | `cursor://file` |
| VS Code Insiders | `'vscode-insiders'` | `vscode-insiders://file` |
| WebStorm | `'webstorm'` | `webstorm://open?file=` |
| Zed | `'zed'` | `zed://file` |

```tsx
<Locator editor="cursor" />
```

## Configuration

### Project Root

If source map paths don't resolve correctly (e.g., in monorepos or custom setups), set the project root:

**Option 1: Via prop**
```tsx
<Locator projectRoot="/Users/you/projects/my-app" />
```

**Option 2: Via environment variable**
```bash
# .env.local
NEXT_PUBLIC_PROJECT_ROOT=/Users/you/projects/my-app
```

### Custom Modifier Key

```tsx
<Locator modifier="ctrl" />    {/* Ctrl+Click */}
<Locator modifier="meta" />    {/* Cmd+Click (Mac) / Win+Click */}
<Locator modifier="shift" />   {/* Shift+Click */}
```

### Custom Highlight Color

```tsx
<Locator highlightColor="#3b82f6" />   {/* Blue */}
<Locator highlightColor="#10b981" />   {/* Green */}
```

## Comparison with Alternatives

| Feature | nextjs-locator | click-to-react-component | LocatorJS | react-dev-inspector |
|---------|---------------|--------------------------|-----------|---------------------|
| React 19 support | Yes | No | Partial | No |
| React 18 support | Yes (_debugSource) | Yes | Yes | Yes |
| Turbopack support | Yes | No | No | No |
| Setup | Drop-in component | Babel plugin | Browser ext + Babel | Babel/SWC plugin |
| File path tooltip | Yes | No | No | No |
| Props/State preview | Yes | No | No | No |
| Component hierarchy | Yes (right-click) | Yes | No | No |
| Source map prefetch | Yes | N/A | N/A | N/A |
| Compile-time fast path | Yes (optional) | N/A | N/A | N/A |
| Dependencies | 0 | Small | Extension | Plugin |
| Next.js App Router | Native | Needs config | Partial | Needs config |
| Multi-editor | 5 editors | VS Code only | VS Code + others | VS Code + others |

## Requirements

- **React** >= 18.0.0
- **Next.js** 13+ (App Router recommended)
- **Development mode** only (completely removed in production)

## How is this different?

### vs [click-to-react-component](https://github.com/ericclemmons/click-to-component)

Requires `@babel/plugin-transform-react-jsx-source` which injects `_debugSource` into every JSX element at compile time. React 19 removed `_debugSource` in favor of `_debugStack`, breaking this approach. `nextjs-locator` reads `_debugStack` natively and falls back to `_debugSource` for React 18 — no build plugin needed.

### vs [LocatorJS](https://www.locatorjs.com/)

Requires a browser extension or Babel plugin to inject `data-locator` attributes. Doesn't support Turbopack's sectioned source map format. `nextjs-locator` works by decoding source maps at runtime — zero build-time setup.

### vs [react-dev-inspector](https://github.com/nicknisi/react-dev-inspector)

Requires SWC/Babel plugin configuration. `nextjs-locator` achieves the same result with zero config by leveraging React's built-in debug information and runtime source map resolution. Plus, it offers component hierarchy navigation and file path preview that others don't.

## Props/State Preview

When hovering a component with the modifier key held, a preview panel appears showing:
- **Props** — Current prop values (max 10, excluding `children`)
- **Hook state** — `useState`, `useReducer`, `useMemo`, `useRef` values
- **Render count** — How many times the component has been inspected

Disable with:
```tsx
<Locator showPreview={false} />
```

## Compile-Time Source Resolution (Optional)

For instant source resolution without runtime source map fetching, install the companion package:

```bash
npm install nextjs-locator-swc
```

```js
// next.config.js
const { withLocator } = require('nextjs-locator-swc');
module.exports = withLocator({ /* your config */ });
```

This injects `data-locator-source` attributes at build time, which `nextjs-locator` reads directly for zero-latency clicks. See [nextjs-locator-swc](https://github.com/stkang9409/nextjs-locator-swc) for details.

## TypeScript

Full TypeScript support with exported types:

```typescript
import type { LocatorProps, EditorProtocol, FiberInspection } from 'nextjs-locator';
```

## License

MIT
