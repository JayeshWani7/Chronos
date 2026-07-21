# Chronos — Browser State Version Control System

Chronos captures the initial DOM snapshot, console logs, network activity, storage state, and subsequent mutation deltas of a browser test session, allowing deterministic reconstruction of full page states at any timestamp $T$.

---

## Project Structure

```text
Chronos/
├── agent-js/       # Browser-side JavaScript instrumentation agent (TypeScript + Rollup)
├── recorder/       # Java 24 / Spring Boot command line service for CDP capturing & packaging
├── schema/         # SQLite schema definitions for the timeline database
├── samples/        # Test scripts, trigger scripts, and static HTML test pages
└── README.md       # Project guide and documentation
```

---

## Core Container Architecture (`.crn`)

Chronos compiles recorded sessions into a single compressed `.crn` (Chronos Recording Network) container file. A `.crn` file is a ZIP archive containing:

1. **`timeline.sqlite`**: SQLite database storing structured timeline details:
   - **`session_meta`**: Metadata like schema versions, start/end timestamps.
   - **`console_logs`**: Captured page console logs (log levels, stack traces).
   - **`network_requests`**: Network transaction logs (URLs, statuses, response bodies).
   - **`storage_states`**: Cookie and Local/Session storage updates.
   - **`dom_snapshots`**: Compressed full DOM snapshots (basepoints).
2. **`deltas.bin`**: Custom delta-compressed binary mutation stream (compressed via LZ4) mapping DOM node increments over time.
3. **`metadata.json`**: Session config details (start time, schema version, test suite name).
4. **`manifest.json`**: Index of files packaged in the container.

---

## Build & Testing Guide

### 1. Compile the JavaScript Agent
The browser agent monitors DOM changes, console logs, network calls, and input events. Build the bundled script first:
```bash
cd agent-js
npm install
npm run build
```
*Outputs compiled JS to `agent-js/dist/chronos-agent.js`*

### 2. Start Headless Chrome
Launch Chrome with remote debugging active on port `9222`:
```powershell
Start-Process -FilePath "C:\Program Files\Google\Chrome\Application\chrome.exe" -ArgumentList "--remote-debugging-port=9222 --headless=new --disable-gpu --user-data-dir=$env:TEMP\chrome-profile-spike"
```

### 3. Build and Package the Java Recorder
Navigate to the `recorder` directory and compile the fat executable JAR:
```powershell
cd ../recorder
.\gradlew.bat clean bootJar
```
*Outputs compiled binary to `recorder/build/libs/recorder-1.0.0.jar`*

### 4. Run the Recorder Service
Attach the recorder to the active Chrome instance:
```powershell
$env:CHROME_CDP_URL="http://127.0.0.1:9222"
$env:PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD="1"
$env:AGENT_JS_PATH="../agent-js/dist/chronos-agent.js"
java -jar build/libs/recorder-1.0.0.jar ../samples/session.crn
```
*Wait for the console to output: `Recorder is running. Press Enter or Ctrl+C to stop...`*

### 5. Generate Test Browser Actions
In a new terminal window, run the test trigger page simulation script:
```powershell
cd samples
node trigger.js
```
*This loads the sample page, simulates element clicks/color transitions, and generates event logs intercepted by the recorder.*

### 6. Package Session
Go back to the terminal running the recorder and press **`Enter`** (or press **`Ctrl+C`**).
The recorder will stop, write metadata, package the SQLite and delta binary into `samples/session.crn`, and delete the temp directory automatically.
