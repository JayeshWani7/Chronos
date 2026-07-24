const puppeteer = require('puppeteer-core');

(async () => {
  console.log("Starting E2E failing test trigger using puppeteer-core...");
  let browser;
  try {
    browser = await puppeteer.connect({
      browserURL: 'http://127.0.0.1:9222',
      defaultViewport: null
    });
    const pages = await browser.pages();
    const page = pages[0] || await browser.newPage();

    console.log("Navigating page...");
    const testPageUrl = `file:///C:/Users/priya/OneDrive/Desktop/Chronos/samples/index.html`;
    await page.goto(testPageUrl);
    await new Promise(r => setTimeout(r, 1000));

    console.log("Triggering click mutations...");
    await page.click('#btn-add');
    await new Promise(r => setTimeout(r, 500));
    await page.click('#btn-color');
    await new Promise(r => setTimeout(r, 500));

    // Print console logs
    await page.evaluate(() => {
      console.log("AI Analyzer verification trigger loaded.");
      console.warn("Simulated warning: Deprecated session cookie warning.");
      console.error("Simulated error: API request to /api/checkout failed with status 500.");
    });
    await new Promise(r => setTimeout(r, 1000));

    console.log("Exiting with non-zero code to simulate failure...");
    process.exit(1);
  } catch (err) {
    console.error("Test execution encountered an error:", err);
    process.exit(2);
  } finally {
    if (browser) {
      await browser.disconnect().catch(() => {});
    }
  }
})();
