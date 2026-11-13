# Final QA and demo plan

Use a brand-new Figma file containing only invented copy. This is the last manual gate before recording the demo and calling version 1 complete.

## Build checkpoint

From the repository:

```bash
npm ci
npm test
npm run build
```

Import `manifest.json` as a development plugin if the fresh Figma file cannot already see Copy Check.

## Fresh-file fixture

Create one frame named `Copy Check QA` with these text layers:

| Layer name | Text | Expected purpose |
| --- | --- | --- |
| `Primary button` | `SIGN IN NOW!` | Sentence-case finding |
| `Account link` | `Click here` | Descriptive-link finding |
| `Next button` | `Continue` | Custom-guideline finding after adding the rule below |
| `Billing link` | `View billing details` | Clean comparison copy |
| `Error message` | `Payment failed. Try again.` | Clean error-message comparison |

In **Guidelines**, add: `Button labels must not use the word "Continue". Suggest "Next" instead.` Save, close the plugin, reopen it, and confirm the ninth rule remains.

## Core regression

- [x] With the QA frame selected, the counter reports 5 text layers.
- [x] With nothing selected, the plugin scans the current page.
- [x] **Check copy** reaches a result rather than an error.
- [x] The three deliberately problematic strings produce sensible findings.
- [x] Clean comparison copy is not given an obviously invented rule violation.
- [x] Clicking a finding selects and zooms to the correct Figma layer.
- [x] **Apply** changes one layer on the canvas.
- [x] Figma's **Undo** reverses that single edit.
- [x] **Apply all** changes every remaining editable finding.
- [x] One Figma **Undo** reverses the entire Apply-all batch.
- [x] Saved guidelines survive closing and reopening the plugin.
- [x] Turning the network off before an audit shows the intentional retry state; turning it back on makes **Try again** recover.

## Post-review regression

- [x] Run an audit, manually change a flagged layer on the canvas, then click **Apply**. Confirm Copy Check preserves the newer text and asks for a refresh.
- [x] Run an audit, delete a flagged layer, then click its finding header. Confirm the findings stay visible and the missing-layer message appears inline rather than replacing the audit with a scan error.
- [x] Focus the **Audit** tab and use Left/Right Arrow, Home, and End. Confirm focus and the visible panel move together.

## 50-layer scan check

For the higher-volume document test, create ten simple text layers inside a frame, then duplicate that set four times so the frame contains 50 text nodes total. Select the outer frame and confirm:

- [x] the plugin reports 50 text layers;
- [x] the panel remains responsive;
- [x] clicking a listed layer navigates to the matching node; and
- [x] an audit completes without exceeding the 100-layer request cap.

Do not use employer, client, or production text in this fixture.

## Demo storyboard (60 seconds maximum)

Record only the Figma canvas and plugin panel. Keep the QA frame selected and the plugin open before recording.

| Time | Action |
| --- | --- |
| 0–5s | Show the invented QA frame and Copy Check panel. |
| 5–12s | Click **Check copy** and briefly show the loading state. |
| 12–24s | Scroll through the findings and their suggested rewrites. |
| 24–32s | Click one finding to jump to its canvas layer. |
| 32–40s | Click **Apply** and show the canvas text change. |
| 40–49s | Click **Apply all** for the remaining findings. |
| 49–57s | Press **Command–Z** once and show the Apply-all batch reverse. |
| 57–60s | End on the Copy Check title and completed UI. |

On macOS, press **Command–Shift–5**, choose **Record Selected Portion**, and frame the capture around Figma. No narration is required; concise cursor movement is more important. Export or trim the result to 60 seconds or less before adding it near the top of the README.

## Recorded result

The final 46.6-second demo uses three original Moss & Mile mobile screens and 50 text layers. It shows the saved custom guideline, three controlled findings, navigation to affected canvas layers, one individual rewrite, **Apply all**, a clean recheck, and the corrected design. Native single-edit and Apply-all undo behavior was verified separately during the regression pass.
