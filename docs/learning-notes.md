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

### Build output

Vite bundles React, application code, and CSS into one `dist/index.html` file. esbuild bundles the plugin main thread into `dist/code.js`. The Figma manifest points to those two generated files.
