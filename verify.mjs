import { chromium } from "/Users/robertengels/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs";

const browser = await chromium.launch({
  executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: true,
});
const page = await browser.newPage({ viewport: { width: 1440, height: 950 } });
const errors = [];

page.on("pageerror", (error) => errors.push(error.message));
page.on("console", (message) => {
  if (message.type() === "error") errors.push(message.text());
});
page.on("response", (response) => {
  if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`);
});

try {
  await page.goto("http://127.0.0.1:5173", { waitUntil: "networkidle", timeout: 30000 });
  await page.getByText("Investment Horizon Refill Strategy").waitFor({ timeout: 15000 });
  await page.getByRole("button", { name: "Next" }).click();
  await page.getByText(/withdrawn from Income|Income withdrawal/).waitFor({ timeout: 5000 });
  console.log("Rendered and interaction smoke test passed.");
} catch (error) {
  console.log(`Smoke test failed: ${error.message}`);
  console.log(`Page URL: ${page.url()}`);
  console.log(`Body text: ${(await page.locator("body").innerText()).slice(0, 1000)}`);
  process.exitCode = 1;
}

if (errors.length) {
  console.log("Console errors:");
  for (const error of errors) console.log(`- ${error}`);
}

await browser.close();
