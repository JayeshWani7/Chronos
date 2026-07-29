package com.chronos.recorder;

import org.junit.jupiter.api.Test;
import java.io.File;
import static org.junit.jupiter.api.Assertions.*;

public class ChronosEmbeddedTest {

    @Test
    public void testProgrammaticRecording() {
        String testOutputCrn = "samples/embedded_test.crn";
        File crnFile = new File(testOutputCrn);
        if (crnFile.exists()) {
            crnFile.delete();
        }

        RecordOptions options = RecordOptions.builder()
            .outputCrn(testOutputCrn)
            .agentJsPath("../agent-js/dist/chronos-agent.js")
            .cdpUrl("http://127.0.0.1:9222")
            .build();

        try (ChronosSession session = Chronos.record(options)) {
            assertNotNull(session);
            System.out.println("E2E recording active inside programmatic unit test. Simulating test delay...");
            Thread.sleep(2000); // Simulate test execution
        } catch (Exception e) {
            fail("Chronos session failed to record programmatically: " + e.getMessage());
        }

        assertTrue(crnFile.exists(), "The output CRN file was not created on close.");
        assertTrue(crnFile.length() > 0, "The packaged CRN file is empty.");
        System.out.println("Programmatic E2E test capture successfully completed. CRN size: " + crnFile.length() + " bytes");
    }
}
