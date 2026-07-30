# Chronos — Browser State Version Control System

Chronos captures the initial DOM snapshot, console logs, network activity, storage state, and subsequent mutation deltas of a browser test session, allowing deterministic reconstruction of full page states at any timestamp $T$.

---

## 🚀 Quick Startup Guide (Step-by-Step)

Follow these step-by-step instructions to set up, build, record, and run Chronos on your machine:

### Step 1: Clone & Install Dependencies
Ensure you have **Node.js (v18+)**, **Java 21/24 (JDK)**, and **Google Chrome** installed.

```bash
# Clone the repository
git clone https://github.com/JayeshWani7/Chronos.git
cd Chronos

# Create local environment configuration from template
copy .env.example .env
```

---

### Step 2: Build the JavaScript Browser Agent (`agent-js`)
Compile the browser-side DOM/Network/Console instrumentation agent script:
```powershell
cd agent-js
npm install
npm run build
cd ..
```
*Creates the bundled agent at `agent-js/dist/chronos-agent.js`.*

---

### Step 3: Build Java Modules & CLI Fat JAR (`cli`)
Compile the recorder, replay engine, and CLI Fat JAR:
```powershell
.\recorder\gradlew.bat assemble
```
*Generates the executable Fat JAR at `cli/build/libs/cli-1.0.0.jar`.*

---

### Step 4: Start Headless Chrome with CDP Enabled
Launch Chrome with Chrome DevTools Protocol (CDP) listening on port `9222`:

- **Windows (PowerShell)**:
  ```powershell
  Start-Process -FilePath "C:\Program Files\Google\Chrome\Application\chrome.exe" -ArgumentList "--remote-debugging-port=9222 --headless=new --disable-gpu --user-data-dir=$env:TEMP\chrome-profile-ci"
  ```
- **Linux / macOS**:
  ```bash
  google-chrome --remote-debugging-port=9222 --headless=new --disable-gpu --user-data-dir=/tmp/chrome-profile-ci &
  ```

---

### Step 5: Record a Session Container (`.crn`)
Record a browser script or test suite execution and package it into a compressed `.crn` container:
```powershell
java -jar cli/build/libs/cli-1.0.0.jar record --out samples/new_session.crn -- node samples/trigger.js
```
*Creates `samples/new_session.crn` containing timeline databases, deltas, and snapshots.*

---

### Step 6: Start the Desktop Time-Travel Debugger UI (`desktop`)
Launch the React + Vite desktop debugging application:
```powershell
cd desktop
npm install
npm run dev
```

1. Open `http://localhost:5173` in your browser.
2. In the top path bar, enter the absolute path to your `.crn` file (e.g. `C:\Users\priya\OneDrive\Desktop\Chronos\samples\new_session.crn`).
3. Click **Open Session** to start time-travel debugging!

---

### Step 7 (Optional): Run Backend Replay Server Directly
If you want to spin up the local HTTP replay backend standalone without the desktop app:
```powershell
# Recommended (runs directly via Gradle to bypass JAR packaging restrictions):
.\recorder\gradlew.bat :cli:runCli -PcliArgs="server samples/new_session.crn --port 8085"

# Alternative (runs the packaged Fat JAR):
java -jar cli/build/libs/cli-1.0.0.jar server samples/new_session.crn --port 8085
```

---

## 📁 Project Structure

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

## 📦 Core Container Architecture (`.crn`)

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

## 🛠️ CLI Features & Subcommands

Commands can be run either directly via the packaged fat JAR or through the Gradle `runCli` execution task:

* **Using Gradle (Recommended for Local Dev)**: `.\recorder\gradlew.bat :cli:runCli -PcliArgs="[COMMAND] [ARGS]"`
* **Using packaged Fat JAR**: `java -jar cli/build/libs/cli-1.0.0.jar [COMMAND] [ARGS]`

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

## 🎭 Playwright Integration

Chronos includes a first-class Playwright test runner fixture. To use it in Playwright tests:
1. Import `test` from [chronos-playwright.cjs](file:///C:/Users/priya/OneDrive/Desktop/Chronos/samples/chronos-playwright.cjs).
2. Use the custom `chronosPage` fixture inside your tests. On test failures, a `.crn` container named after the test is saved to the output directory automatically; on passing runs, it is silently discarded.
