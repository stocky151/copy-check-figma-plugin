# Copy Check learning notes

This document records the concepts behind the implementation so the code can be explained, not merely demonstrated.

## Foundation checkpoint

### Node.js

Node.js runs JavaScript outside a browser. In this project, Node does not run inside the finished Figma plugin. It runs the local tools that check TypeScript and build the plugin files.

### npm

npm installs the open-source packages listed in `package.json` and runs the commands under `scripts`. Installed package code lives in `node_modules`, which is generated locally and is not committed to Git.

### TypeScript

TypeScript adds type checking to JavaScript. The types are removed during the build, leaving JavaScript that Figma and browsers can run. Separate TypeScript configurations keep Figma's sandbox types away from browser-only DOM types.

### React

React builds the panel interface from components. `App.tsx` stores scan, audit, editing, and guideline states, then updates the interface when user actions, Worker responses, or plugin messages arrive.

### The two Figma plugin environments

`src/plugin/code.ts` runs in Figma's sandbox. It can use `figma.*` APIs and inspect the document, but it has no DOM and cannot call `fetch`.

`src/ui/` runs in an iframe. It can render HTML, use React, and eventually call the Cloudflare Worker, but it cannot directly inspect or edit Figma layers.

The two environments exchange messages. Those message shapes live in `src/shared/messages.ts` so both sides agree on the contract.

### Scanning document nodes

Every visible object or layer in a Figma file is represented by a node. The plugin starts from the selected nodes and recursively visits their children to find text nodes. If the selection is empty, it starts from the current page instead.

The plugin sends serializable `TextItem` objects to React rather than sending Figma nodes themselves. Each item contains a node ID, layer name, characters, and an `editable` flag. Clicking a result sends the node ID back to the main thread, which retrieves the node asynchronously, selects it, and asks Figma to zoom it into view.

Mixed-font or missing-font layers are marked as not editable. Reading their text is safe, but changing text requires every relevant font to be available and loaded first.

### Build output

Vite bundles React, application code, and CSS into one `dist/index.html` file. esbuild bundles the plugin main thread into `dist/code.js`. The Figma manifest points to those two generated files.

## Worker foundation

### Cloudflare Workers and Wrangler

A Cloudflare Worker is server-side JavaScript that runs on Cloudflare's network. Wrangler is the command-line tool that runs the Worker locally, manages secrets, and deploys it. The Worker protects the Gemini key because the React panel never receives that secret.

### HTTP routes

`GET /health` returns a small response proving that the Worker is available. `POST /audit` accepts JSON containing text items and guidelines. `OPTIONS /audit` answers the browser's CORS preflight request.

### Runtime validation with Zod

TypeScript checks our source code but cannot prove that network data is valid at runtime. Zod defines executable schemas for requests and model responses. The Worker rejects oversized or malformed requests before calling Gemini and rejects malformed Gemini output before returning it to Figma.

### Gemini structured output

The Worker asks Gemini's Interactions API for JSON matching a specific schema. Structured output makes the response more predictable, but the Worker still validates it. Findings with node or guideline IDs absent from the original request are dropped before they can reach the plugin.

Two unedited starter rules can also be checked deterministically: whether a label exceeds three words, and whether error or warning copy contains an exclamation mark. The Worker uses named checks keyed by the complete rule text to reject model claims contradicted by the submitted copy. An edited rule no longer matches that exact text and remains model-driven.

## Connected product workflow

### React state and asynchronous requests

The panel keeps the scan, audit, apply, and guideline-editor states in React. Network calls are asynchronous: the interface enters a loading state, waits for the Worker, validates the reply, and then renders either findings, a clean result, or a recoverable error. React re-renders from state instead of manually editing the DOM after each event.

### Applying copy safely

Figma text cannot be changed until its font is loaded. The main thread first confirms that the layer still contains the exact text that was audited, preventing a stale suggestion from overwriting a newer manual edit. It then checks that the layer uses one available font, loads it with `figma.loadFontAsync`, and only then replaces `characters`. Apply-all prepares every valid change before committing them together and calls `figma.commitUndo()` once, so Figma can reverse the batch with one native Undo command.

### Guideline persistence

Guidelines are saved through `figma.clientStorage`, not browser local storage. The main thread owns persistence because it is part of the Figma plugin environment. Incoming guideline messages are validated for count, length, shape, and unique IDs before anything is stored.

### Protecting a public endpoint

The Worker URL has to be visible to the plugin, so obscurity cannot protect it. Protection happens in layers: a 64 KiB body cap, Zod request limits, a Cloudflare rate-limiting binding, Gemini response validation, and a free-tier provider account with no paid billing enabled. The rate limiter allows ten audit calls per client IP per minute at each Cloudflare location.
