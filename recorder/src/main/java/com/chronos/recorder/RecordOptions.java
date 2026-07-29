package com.chronos.recorder;

public class RecordOptions {
    private String cdpUrl = "http://127.0.0.1:9222";
    private String outputCrn = "./session.crn";
    private String agentJsPath = "../agent-js/dist/chronos-agent.js";
    private int snapshotInterval = 100;
    private boolean captureScreenshots = false;
    private String targetTabUrl = "";

    public RecordOptions() {}

    public static Builder builder() {
        return new Builder();
    }

    public String getCdpUrl() {
        return cdpUrl;
    }

    public String getOutputCrn() {
        return outputCrn;
    }

    public String getAgentJsPath() {
        return agentJsPath;
    }

    public int getSnapshotInterval() {
        return snapshotInterval;
    }

    public boolean isCaptureScreenshots() {
        return captureScreenshots;
    }

    public String getTargetTabUrl() {
        return targetTabUrl;
    }

    public static class Builder {
        private final RecordOptions options = new RecordOptions();

        public Builder cdpUrl(String cdpUrl) {
            options.cdpUrl = cdpUrl;
            return this;
        }

        public Builder outputCrn(String outputCrn) {
            options.outputCrn = outputCrn;
            return this;
        }

        public Builder agentJsPath(String agentJsPath) {
            options.agentJsPath = agentJsPath;
            return this;
        }

        public Builder snapshotInterval(int snapshotInterval) {
            options.snapshotInterval = snapshotInterval;
            return this;
        }

        public Builder captureScreenshots(boolean captureScreenshots) {
            options.captureScreenshots = captureScreenshots;
            return this;
        }

        public Builder targetTabUrl(String targetTabUrl) {
            options.targetTabUrl = targetTabUrl;
            return this;
        }

        public RecordOptions build() {
            return options;
        }
    }
}
