package com.chronos.replay;

import java.io.File;
import java.nio.file.Files;
import java.util.HashMap;
import java.util.Map;

public class DotEnvLoader {
    private static final Map<String, String> envMap = new HashMap<>();
    private static boolean loaded = false;

    public static synchronized void ensureLoaded() {
        if (loaded) return;
        loaded = true;

        String[] possibleEnvFiles = {
            ".env",
            "../.env",
            "../../.env",
            "../../../.env",
            "C:\\Users\\priya\\OneDrive\\Desktop\\Chronos\\.env"
        };

        for (String path : possibleEnvFiles) {
            File f = new File(path);
            if (f.exists()) {
                try {
                    for (String line : Files.readAllLines(f.toPath())) {
                        String trimmed = line.trim();
                        if (trimmed.isEmpty() || trimmed.startsWith("#")) continue;
                        int idx = trimmed.indexOf('=');
                        if (idx > 0) {
                            String key = trimmed.substring(0, idx).trim();
                            String val = trimmed.substring(idx + 1).trim();
                            if ((val.startsWith("\"") && val.endsWith("\"")) || (val.startsWith("'") && val.endsWith("'"))) {
                                val = val.substring(1, val.length() - 1);
                            }
                            envMap.putIfAbsent(key, val);
                        }
                    }
                } catch (Exception e) {
                    // Ignore reading errors
                }
            }
        }
    }

    public static String get(String key) {
        return get(key, null);
    }

    public static String get(String key, String defaultValue) {
        ensureLoaded();
        String sysVal = System.getenv(key);
        if (sysVal != null && !sysVal.isEmpty()) {
            return sysVal;
        }
        return envMap.getOrDefault(key, defaultValue);
    }
}
