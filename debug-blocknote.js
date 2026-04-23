const puppeteer = require("puppeteer");

(async () => {
  const browser = await puppeteer.launch({ headless: "new" });
  const page = await browser.newPage();
  
  // Navigate to the local dev server
  await page.goto("http://localhost:5173", { waitUntil: "networkidle0" });
  
  // Find a way to get to the wiki editor. 
  // Wait, if it requires wallet connection, we can't easily do it in puppeteer without mocking.
  // Let's see if we can just render the editor in a test page?
  
  await browser.close();
})();
