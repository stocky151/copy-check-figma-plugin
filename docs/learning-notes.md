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

React builds the panel interface from components. `App.tsx` stores connection status as state, renders a button, and updates the interface when a message arrives.

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
