# Copy Check

Copy Check is a Figma plugin that finds inconsistent or unclear UI copy across selected designs and helps a designer fix it without leaving Figma.

## Project status

The plugin can scan non-empty text layers from the current selection, or from the current page when nothing is selected. Results appear in the React panel, and clicking a result selects and zooms to its Figma layer.

## Local development

Requirements:

- Node.js 26 LTS
- npm 11 or later
- Figma desktop app

Install dependencies and create the files Figma runs:

```bash
npm install
npm run build
```

The build creates:

- `dist/code.js` for the Figma plugin main thread
- `dist/index.html` for the React panel

Import `manifest.json` as a development plugin in the Figma desktop app.

## Architecture

The plugin main thread can read and edit the Figma document, but it cannot use browser APIs. The React panel can use browser APIs, but it cannot directly access the document. They communicate through typed messages.

The Cloudflare Worker and Gemini audit will be added after the local scan workflow is verified.

## Source specification

The working scope is documented in [Copy Check Figma plugin spec.md](./Copy%20Check%20Figma%20plugin%20spec.md).
