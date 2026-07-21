import puppeteer from 'puppeteer-core';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dns from 'dns';

dns.setDefaultResultOrder('ipv4first');

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function run() {
  console.log("Connecting to Chrome at http://127.0.0.1:9222 ...");
  const browser = await puppeteer.connect({
    browserURL: 'http://127.0.0.1:9222',
    defaultViewport: { width: 1280, height: 720 }
  });

  const page = await browser.newPage();

  page.on('console', msg => console.log('PAGE LOG:', msg.text()));
  page.on('pageerror', err => console.log('PAGE ERROR:', err.message));
  
  // Read and inject agent-spike.js on load
  const agentCode = fs.readFileSync(path.join(__dirname, 'agent-spike.js'), 'utf8');
  await page.evaluateOnNewDocument(agentCode);

  // Load the test HTML page
  const htmlPath = path.join(__dirname, 'index.html');
  const fileUrl = `file:///${htmlPath.replace(/\\/g, '/')}`;
  console.log(`Navigating to ${fileUrl}`);
  await page.goto(fileUrl);

  // Wait for initial load
  await new Promise(r => setTimeout(r, 500));

  // Let's click buttons to trigger mutations
  console.log("Triggering dynamic child additions...");
  await page.click('#btn-add');
  await page.click('#btn-add');
  await page.click('#btn-add');

  console.log("Triggering style mutations (color)...");
  await page.click('#btn-color');

  console.log("Triggering removal mutations...");
  await page.click('#btn-remove');

  // Wait a moment for observers to flush
  await new Promise(r => setTimeout(r, 500));

  // Retrieve initial DOM and mutations array from the page context
  const initialDom = await page.evaluate(() => window.chronos_initial_dom);
  const mutations = await page.evaluate(() => window.chronos_mutations);
  const finalLiveHtml = await page.evaluate(() => document.documentElement.outerHTML);

  console.log(`Captured ${mutations.length} mutations.`);

  // Save raw timeline data for debugging
  fs.writeFileSync(path.join(__dirname, 'spike-results.json'), JSON.stringify({
    initialDom,
    mutations
  }, null, 2));

  // Close the page and browser connection
  await page.close();
  await browser.disconnect();

  console.log("Saved raw recording to spike-results.json.");

  // Replay Phase: Let's reconstruct the DOM from initialDom + mutations
  console.log("Starting Replay reconstruction...");
  const reconstructedHtml = replay(initialDom, mutations);
  
  fs.writeFileSync(path.join(__dirname, 'reconstructed.html'), reconstructedHtml);
  console.log("Saved reconstructed HTML to reconstructed.html.");

  // Simple validation: Let's see if reconstructed HTML matches the final live page DOM.
  console.log("Reconstructed HTML Length:", reconstructedHtml.length);
  console.log("Live HTML Length:", finalLiveHtml.length);
  
  const hasDynamicChild = reconstructedHtml.includes('child-3');
  const hasNoBox = !reconstructedHtml.includes('id="target-box"');

  if (hasDynamicChild && hasNoBox) {
    console.log("SUCCESS: Replayed DOM state matches expected live state! Dynamic Child #3 is present and Target Box is removed.");
  } else {
    console.log(`FAILURE: Replay state does not match! hasDynamicChild=${hasDynamicChild}, hasNoBox=${hasNoBox}`);
  }
}

// Replay helper function
function replay(initialDom, mutations) {
  // Let's implement a simple DOM-like tree class to perform operations
  class VirtualNode {
    constructor(serialized) {
      this.id = serialized.id;
      this.nodeType = serialized.nodeType;
      this.tagName = serialized.tagName;
      this.nodeValue = serialized.nodeValue;
      this.attributes = { ...serialized.attributes };
      this.childNodes = [];
      this.parentNode = null;

      if (serialized.childNodes) {
        for (let child of serialized.childNodes) {
          const childNode = new VirtualNode(child);
          this.appendChild(childNode);
        }
      }
    }

    appendChild(child) {
      if (child.parentNode) {
        child.parentNode.removeChild(child);
      }
      child.parentNode = this;
      this.childNodes.push(child);
    }

    insertBefore(child, reference) {
      if (child.parentNode) {
        child.parentNode.removeChild(child);
      }
      child.parentNode = this;
      const idx = this.childNodes.indexOf(reference);
      if (idx !== -1) {
        this.childNodes.splice(idx, 0, child);
      } else {
        this.childNodes.push(child);
      }
    }

    removeChild(child) {
      const idx = this.childNodes.indexOf(child);
      if (idx !== -1) {
        this.childNodes.splice(idx, 1);
        child.parentNode = null;
      }
    }

    setAttribute(name, value) {
      this.attributes[name] = value;
    }

    removeAttribute(name) {
      delete this.attributes[name];
    }
  }

  // Build ID index
  const nodeMap = new Map();
  function indexNode(node) {
    nodeMap.set(node.id, node);
    for (let child of node.childNodes) {
      indexNode(child);
    }
  }

  const root = new VirtualNode(initialDom);
  indexNode(root);

  // Function to build virtual node tree from serialization
  function buildVirtualTree(serialized) {
    const vNode = new VirtualNode(serialized);
    indexNode(vNode);
    return vNode;
  }

  // Play mutations
  for (let mut of mutations) {
    const target = nodeMap.get(mut.target);
    if (!target) {
      continue;
    }

    if (mut.type === 'childList') {
      // Remove nodes
      for (let removed of mut.removedNodes) {
        const id = typeof removed === 'number' ? removed : removed.id;
        const node = nodeMap.get(id);
        if (node) {
          target.removeChild(node);
        }
      }
      // Add nodes
      for (let added of mut.addedNodes) {
        const node = buildVirtualTree(added);
        const refNode = mut.nextSibling ? nodeMap.get(mut.nextSibling) : null;
        if (refNode) {
          target.insertBefore(node, refNode);
        } else {
          target.appendChild(node);
        }
      }
    } else if (mut.type === 'attributes') {
      if (mut.attributeValue === null) {
        target.removeAttribute(mut.attributeName);
      } else {
        target.setAttribute(mut.attributeName, mut.attributeValue);
      }
    } else if (mut.type === 'characterData') {
      target.nodeValue = mut.nodeValue;
    }
  }

  // Serialize VirtualNode back to HTML string
  function toHtml(node) {
    if (node.nodeType === 3) {
      return node.nodeValue;
    }
    if (node.nodeType === 1) {
      let attrs = Object.entries(node.attributes)
        .map(([name, val]) => ` ${name}="${val}"`)
        .join('');
      let html = `<${node.tagName}${attrs}>`;
      // Don't close self-closing tags
      if (['img', 'br', 'hr', 'input', 'link', 'meta'].includes(node.tagName)) {
        return html;
      }
      html += node.childNodes.map(toHtml).join('');
      html += `</${node.tagName}>`;
      return html;
    }
    return '';
  }

  return toHtml(root);
}

run().catch(console.error);
