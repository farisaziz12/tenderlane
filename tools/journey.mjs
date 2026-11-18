// Drive the example checkout in a real browser, against the demo provider, and capture
// evidence. Fails (exit 1) if a step does not behave as the docs say it does.
//
//   pnpm example                     # in another terminal
//   pnpm test:journey [base-url]     # default http://localhost:3000
//
// Output: .evidence/journey_*.png, and .evidence/journey.webm where Playwright's ffmpeg is
// installed. CHROME=/path/to/chromium overrides the browser binary.
import { mkdirSync, renameSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium } from 'playwright';

const baseUrl = (process.argv[2] ?? 'http://localhost:3000').replace(/\/$/, '');
const outputDirectory = resolve('.evidence');
mkdirSync(outputDirectory, { recursive: true });

const viewport = { width: 1280, height: 800 };
const browser = await chromium.launch(
  process.env.CHROME ? { executablePath: process.env.CHROME } : {},
);

/** A recording is a bonus: without ffmpeg the journey still runs and still asserts. */
async function openPage() {
  try {
    const context = await browser.newContext({
      viewport,
      recordVideo: { dir: outputDirectory, size: viewport },
    });
    return { context, page: await context.newPage(), recording: true };
  } catch {
    const context = await browser.newContext({ viewport });
    return { context, page: await context.newPage(), recording: false };
  }
}

const steps = [];
function expectThat(condition, description) {
  steps.push(`${condition ? 'ok  ' : 'FAIL'} ${description}`);
  if (!condition) throw new Error(description);
}

const { context, page, recording } = await openPage();
const pageErrors = [];
page.on('pageerror', (error) => pageErrors.push(error.message));
const shot = (name) => page.screenshot({ path: resolve(outputDirectory, `journey_${name}.png`) });
const routePanel = async () => (await page.locator('dl').first().innerText()).replace(/\s+/g, ' ');

let failure;
try {
  // 1. The default country routes to the demo provider.
  await page.goto(`${baseUrl}/`, { waitUntil: 'networkidle' });
  expectThat(/provider demo flow hosted/.test(await routePanel()), 'GB routes to demo / hosted');
  await shot('1_route_demo');

  // 2. Changing app state re-routes the checkout, without a request to the server.
  const requests = [];
  page.on('request', (request) => requests.push(request.url()));
  await page.selectOption('#country', 'CH');
  await page.waitForFunction(() => document.querySelector('dl')?.textContent?.includes('ch-inline'));
  expectThat(/provider stripe flow inline/.test(await routePanel()), 'CH routes to stripe / inline');
  expectThat((await page.locator('.price').textContent())?.includes('CHF'), 'the price follows the country');
  expectThat(
    !requests.some((url) => url.includes('/api/')),
    'routing happened in the browser, with no API call',
  );
  await shot('2_route_stripe_inline');

  // 3. Paying sends what is being bought, never a price.
  await page.selectOption('#country', 'GB');
  const [checkoutRequest] = await Promise.all([
    page.waitForRequest((request) => request.url().endsWith('/api/payments')),
    page.getByRole('button', { name: /^Pay/ }).click(),
  ]);
  const body = checkoutRequest.postData() ?? '';
  expectThat(body.includes('"sku":"pro-plan"'), 'the request names the SKU');
  expectThat(!/amount|price/i.test(body), 'the request carries no amount');

  // 4. The provider's page shows the price the server chose.
  await page.waitForURL(/\/demo-psp\/checkout/);
  const checkoutId = new URL(page.url()).searchParams.get('session') ?? '';
  expectThat((await page.locator('.price').textContent())?.includes('29.00'), 'the hosted page shows the server price');
  await shot('3_hosted_page');

  // 5. Returning without paying is not treated as a payment.
  const visitor = await context.newPage();
  await visitor.goto(`${baseUrl}/success?checkout=${checkoutId}`);
  expectThat(
    (await visitor.locator('h1').textContent())?.includes('not confirmed'),
    'an unpaid checkout is not reported as paid',
  );
  await visitor.close();

  // 6. Paying confirms the order by webhook and again on return.
  await page.getByRole('button', { name: 'Pay' }).click();
  await page.waitForURL(/\/success/);
  expectThat((await page.locator('h1').textContent())?.includes('confirmed'), 'a paid checkout is confirmed');
  const sources = (await page.getByTestId('sources').textContent()) ?? '';
  expectThat(sources.includes('webhook: complete'), 'the webhook recorded the payment');
  expectThat(sources.includes('return: complete'), 'the lookup on return agrees');
  await shot('4_confirmed');

  expectThat(pageErrors.length === 0, `no uncaught page errors (${pageErrors.join('; ') || 'none'})`);
} catch (error) {
  failure = error;
  await shot('failure').catch(() => undefined);
} finally {
  const video = recording ? page.video() : null;
  await context.close();
  if (video) renameSync(await video.path(), resolve(outputDirectory, 'journey.webm'));
  await browser.close();
}

console.log(steps.join('\n'));
console.log(recording ? 'recorded .evidence/journey.webm' : 'no recording: Playwright ffmpeg is not installed');
if (failure) {
  console.error(`\nJourney failed: ${failure.message}`);
  process.exit(1);
}
