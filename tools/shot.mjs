// Capture PR evidence: desktop and phone screenshots of one URL, and optionally a recording.
//
//   node tools/shot.mjs http://localhost:4321/playground before_playground
//   node tools/shot.mjs http://localhost:4321/playground currency_switch --record
//
// Output: .evidence/<name>_desktop.png, .evidence/<name>_phone.png, .evidence/<name>.webm
// With --record, the page stays open for RECORD_MS (default 8000) while the recording runs;
// pass a script to drive it: --script ./my-flow.mjs (default export: async (page) => {}).
// CHROME=/path/to/chromium overrides the browser binary.
import { mkdirSync, renameSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';

const argumentsList = process.argv.slice(2);
const flags = new Set(argumentsList.filter((argument) => argument.startsWith('--')));
const scriptIndex = argumentsList.indexOf('--script');
const scriptPath = scriptIndex === -1 ? undefined : argumentsList[scriptIndex + 1];
const [url, name] = argumentsList.filter(
  (argument, index) =>
    !argument.startsWith('--') && (scriptIndex === -1 || index !== scriptIndex + 1),
);
if (!url || !name) {
  console.error('usage: node tools/shot.mjs <url> <name> [--record] [--script flow.mjs]');
  process.exit(1);
}

const outputDirectory = resolve('.evidence');
mkdirSync(outputDirectory, { recursive: true });

const viewports = {
  desktop: { width: 1280, height: 800 },
  phone: { width: 390, height: 844 },
};

const browser = await chromium.launch(
  process.env.CHROME ? { executablePath: process.env.CHROME } : {},
);
try {
  for (const [label, viewport] of Object.entries(viewports)) {
    const context = await browser.newContext({ viewport, deviceScaleFactor: 2 });
    const page = await context.newPage();
    page.on('pageerror', (error) => console.error(`[${label}] page error: ${error.message}`));
    await page.goto(url, { waitUntil: 'networkidle' });
    const file = resolve(outputDirectory, `${name}_${label}.png`);
    await page.screenshot({ path: file });
    console.log(`wrote ${file}`);
    await context.close();
  }

  if (flags.has('--record')) {
    const context = await browser.newContext({
      viewport: viewports.desktop,
      recordVideo: { dir: outputDirectory, size: viewports.desktop },
    });
    const page = await context.newPage();
    await page.goto(url, { waitUntil: 'networkidle' });
    if (scriptPath) {
      const flow = await import(pathToFileURL(resolve(scriptPath)).href);
      await flow.default(page);
    } else {
      await page.waitForTimeout(Number(process.env.RECORD_MS ?? 8000));
    }
    const video = page.video();
    await context.close();
    const file = resolve(outputDirectory, `${name}.webm`);
    renameSync(await video.path(), file);
    console.log(`wrote ${file}`);
  }
} finally {
  await browser.close();
}
