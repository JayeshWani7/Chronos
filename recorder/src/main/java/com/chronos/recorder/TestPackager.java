package com.chronos.recorder;

import com.chronos.recorder.storage.CrnPackager;
import java.io.File;

public class TestPackager {
    public static void main(String[] args) {
        String path = "session.crn";
        if (args.length > 0) {
            path = args[0];
        }
        System.out.println("Target CRN: " + path);
        File db = new File("session-temp/timeline.sqlite");
        File deltas = new File("session-temp/deltas.bin");
        File meta = new File("session-temp/metadata.json");
        File out = new File(path);

        try {
            CrnPackager.packageSession(
                out.toPath(),
                db.toPath(),
                deltas.toPath(),
                meta.toPath()
            );
            System.out.println("Success! Out file size: " + out.length() + ", Absolute path: " + out.getAbsolutePath());
        } catch (Exception e) {
            e.printStackTrace();
        }
    }
}
