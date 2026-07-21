# Chronos — Browser State Version Control System

Chronos captures the initial DOM snapshot and subsequent mutation deltas of a browser test session, allowing deterministic reconstruction of full page states at any timestamp.

## Project Structure

```
Chronos/
├── recorder/                # Java 21 / Spring Boot service
├── agent-js/                 # Injected browser bundle, Rollup-built
├── replay-engine/            # Shared Java lib used by CLI & Tauri
├── cli/                      # Command line interface
├── desktop/                  # Tauri 2 Desktop app shell
├── schema/                   # SQL schemas for timeline.sqlite
└── samples/                  # Static HTML files and scripts for testing/spikes
```

## Setup & Running (Docker Development)

To start the Chrome container and file observers:
```bash
docker compose up
```
This exposes:
- WebDriver port: `4444`
- CDP debugging port: `9222`
