import dns from 'dns';
dns.setDefaultResultOrder('ipv4first');
import puppeteer from 'puppeteer-core';

async function run() {
  console.log("Connecting to browser...");
  const b = await puppeteer.connect({ browserURL: 'http://127.0.0.1:9222' });
  const pg = await b.newPage();
  
  console.log("Navigating to index.html...");
  await pg.goto('file:///C:/Users/priya/OneDrive/Desktop/Chronos/samples/index.html');
  
  console.log("Clicking buttons...");
  await pg.click('#btn-add');
  await new Promise(r => setTimeout(r, 100));
  await pg.click('#btn-color');
  await new Promise(r => setTimeout(r, 100));
  await pg.click('#btn-add');
  await new Promise(r => setTimeout(r, 100));
  
  console.log("Closing page...");
  await pg.close();
  await b.disconnect();
  console.log("Finished generating events.");
}

run().catch(console.error);
