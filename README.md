# Chronos — Browser State Version Control System

Chronos captures the initial DOM snapshot, console logs, network activity, storage state, and subsequent mutation deltas of a browser test session, allowing deterministic reconstruction of full page states at any timestamp $T$.

---

## Project Structure

```text
Chronos/
├── agent-js/       # Browser-side JavaScript instrumentation agent (TypeScript + Rollup)
├── recorder/       # Java 24 / Spring Boot command line service for CDP capturing & packaging
├── replay-engine/  # Java library containing state reconstruction, diffing, and AI integration
├── cli/            # Picocli command-line app containing CLI subcommands and local HTTP server
├── desktop/        # Tauri 2 + React desktop timeline UI
├── schema/         # SQLite schema definitions for the timeline database
├── samples/        # Test scripts, trigger scripts, Playwright fixtures, and sample recordings
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

### 2. Build the Whole Project
Run gradle build from the project root:
```powershell
.\recorder\gradlew.bat clean assemble
```
*Compiles the recorder, replay engine, and builds the CLI fat JAR at `cli/build/libs/cli-1.0.0.jar`.*

### 3. Start Headless Chrome
Launch Chrome with remote debugging active on port `9222`:
```powershell
Start-Process -FilePath "C:\Program Files\Google\Chrome\Application\chrome.exe" -ArgumentList "--remote-debugging-port=9222 --headless=new --disable-gpu --user-data-dir=$env:TEMP\chrome-profile-spike"
```

---

## CLI Features & Subcommands

Run subcommands using the fat JAR: `java -jar cli/build/libs/cli-1.0.0.jar [COMMAND] [ARGS]`

### 1. E2E Recorder Wrapper (`record`)
Wrap test suites and conditionally save container only on failures (saves disk space):
```powershell
java -jar cli/build/libs/cli-1.0.0.jar record --on-failure-only --out samples/ci_failure.crn -- node samples/trigger_failure.cjs
```

### 2. State Reconstruction (`replay`)
Reconstruct page DOM HTML at any timestamp:
```powershell
java -jar cli/build/libs/cli-1.0.0.jar replay samples/ci_failure.crn --at 12187 --out state.html
```

### 3. Timeline Diffing (`diff`)
Show all events and modifications between two timestamps:
```powershell
java -jar cli/build/libs/cli-1.0.0.jar diff samples/ci_failure.crn --from 10000 --to 13000
```

### 4. Event Querying (`search`)
Perform timeline queries directly using SQLite search arguments:
```powershell
java -jar cli/build/libs/cli-1.0.0.jar search samples/ci_failure.crn --query "console.level = 'error'"
```

### 5. Gemini AI Root-Cause Analysis (`analyze`)
Diagnose timelines using generative AI, grounded in events (requires `GEMINI_API_KEY`):
```powershell
$env:GEMINI_API_KEY="YOUR_KEY"
java -jar cli/build/libs/cli-1.0.0.jar analyze samples/ci_failure.crn --from 9000 --to 13000
```

### 6. Cross-Session Comparison (`compare`)
Compare DOM, console, network, and storage states between a passing run and a failing run:
```powershell
java -jar cli/build/libs/cli-1.0.0.jar compare samples/session.crn samples/ci_failure.crn
```

### 7. Replay Server (`server`)
Spin up the local HTTP data backend for the desktop GUI:
```powershell
java -jar cli/build/libs/cli-1.0.0.jar server samples/ci_failure.crn --port 8085
```

---

## Playwright Integration

Chronos includes a first-class Playwright test runner fixture. To use it in Playwright tests:
1. Import `test` from [chronos-playwright.cjs](file:///C:/Users/priya/OneDrive/Desktop/Chronos/samples/chronos-playwright.cjs).
2. Use the custom `chronosPage` fixture inside your tests. On test failures, a `.crn` container named after the test is saved to the output directory automatically; on passing runs, it is silently discarded.
