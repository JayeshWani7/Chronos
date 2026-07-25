const { test: base } = require('@playwright/test');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const test = base.extend({
  chronosPage: async ({ page }, use, testInfo) => {
    const testCleanName = testInfo.title.replace(/[^a-z0-9]/gi, '_').toLowerCase();
    const outCrnPath = path.resolve(testInfo.outputDir || './test-results', `${testCleanName}.crn`);
    
    // Ensure output directory exists
    fs.mkdirSync(path.dirname(outCrnPath), { recursive: true });

    console.log(`[Chronos] Starting recorder for test: "${testInfo.title}" -> ${outCrnPath}`);

    const recorderJar = path.resolve(__dirname, '../recorder/build/libs/recorder-1.0.0.jar');
    const agentJs = path.resolve(__dirname, '../agent-js/dist/chronos-agent.js');

    const env = { ...process.env, AGENT_JS_PATH: agentJs };
    
    const recProc = spawn('java', ['-jar', recorderJar, outCrnPath], {
      env,
      stdio: ['pipe', 'pipe', 'inherit']
    });

    // Wait for the recorder to fully initialize and connect to CDP
    await new Promise((resolve) => {
      let output = '';
      recProc.stdout.on('data', (data) => {
        const str = data.toString();
        output += str;
        if (str.includes('CdpManager initialized') || str.includes('Recorder is running')) {
          resolve();
        }
      });
      // Safety timeout after 5 seconds
      setTimeout(resolve, 5000);
    });

    // Execute the actual test block
    await use(page);

    // Send Stop signal (Enter key) to clean shutdown the recorder
    console.log(`[Chronos] Finalizing recording for test: "${testInfo.title}"`);
    try {
      recProc.stdin.write('\n');
    } catch (e) {
      // Ignore if process already terminated
    }
    
    await new Promise((resolve) => {
      recProc.on('exit', resolve);
    });

    // Conditional persistence: if test succeeded, delete the crn file to save space
    if (testInfo.status === 'passed' || testInfo.status === 'skipped') {
      if (fs.existsSync(outCrnPath)) {
        fs.unlinkSync(outCrnPath);
        console.log(`[Chronos] Discarded recording for passing/skipped test: "${testInfo.title}"`);
      }
    } else {
      console.log(`[Chronos] Preserved failure recording at: ${outCrnPath}`);
    }
  }
});

module.exports = { test };
