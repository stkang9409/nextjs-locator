# nextjs-locator

**Alt+Click any React component to open its source in your editor.**

Zero-config for Next.js 15/16 with Turbopack. No Babel plugin, no browser extension, no setup.

<!-- TODO: Add demo GIF here -->
<!-- ![Demo](./assets/demo.gif) -->

## Features

- **Zero config** — Drop a single component into your layout, done
- **React 19 ready** — Uses `_debugStack` (not the removed `_debugSource`)
- **Turbopack native** — Decodes Turbopack's sectioned source map format
- **Webpack compatible** — Also works with Next.js webpack builds
- **Multi-editor** — VS Code, Cursor, WebStorm, Zed, VS Code Insiders
- **Zero dependencies** — Only requires `react` as a peer dependency
- **Production safe** — Tree-shaken completely from production builds
- **Configurable** — Modifier key, highlight color, editor choice via props

## How It Works

1. Listens for **modifier key + mousemove** to find the DOM element under cursor
2. Traverses the **React Fiber tree** via `__reactFiber$` internal key
3. Reads **`_debugStack`** (React 19) to get the compiled chunk URL and position
4. **Fetches the `.map` source map** file (supports Turbopack sections format)
5. **Decodes VLQ mappings** to resolve the original file path, line, and column
6. Opens `vscode://file/path:line:column` (or your editor's protocol)

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

### Usage

Hold **Alt** (or **Option** on Mac) and hover over any element — you'll see a red highlight with the component name. **Click** to open the source file in your editor.

## Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `editor` | `EditorProtocol` | `'vscode'` | Editor to open files in |
| `modifier` | `'alt' \| 'ctrl' \| 'meta' \| 'shift'` | `'alt'` | Modifier key to activate |
| `highlightColor` | `string` | `'#ef4444'` | CSS color for the overlay border |
| `projectRoot` | `string` | — | Absolute project root path |
| `enabled` | `boolean` | `true` in dev | Force enable/disable |

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
| Turbopack support | Yes | No | No | No |
| Setup | Drop-in component | Babel plugin | Browser extension + Babel | Babel/SWC plugin |
| Dependencies | 0 | Small | Extension | Plugin |
| Next.js App Router | Native | Needs config | Partial | Needs config |
| Multi-editor | 5 editors | VS Code only | VS Code + others | VS Code + others |

## Requirements

- **React** >= 18.0.0
- **Next.js** 13+ (App Router recommended)
- **Development mode** only (completely removed in production)

## How is this different?

### vs [click-to-react-component](https://github.com/ericclemmons/click-to-component)

Requires `@babel/plugin-transform-react-jsx-source` which injects `_debugSource` into every JSX element at compile time. React 19 removed `_debugSource` in favor of `_debugStack`, breaking this approach. `nextjs-locator` reads `_debugStack` directly — no build plugin needed.

### vs [LocatorJS](https://www.locatorjs.com/)

Requires a browser extension or Babel plugin to inject `data-locator` attributes. Doesn't support Turbopack's sectioned source map format. `nextjs-locator` works by decoding source maps at runtime — zero build-time setup.

### vs [react-dev-inspector](https://github.com/nicknisi/react-dev-inspector)

Requires SWC/Babel plugin configuration. `nextjs-locator` achieves the same result with zero config by leveraging React's built-in debug information and runtime source map resolution.

## TypeScript

Full TypeScript support with exported types:

```typescript
import type { LocatorProps, EditorProtocol } from 'nextjs-locator';
```

## License

MIT
