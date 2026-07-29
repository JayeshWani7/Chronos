package com.chronos.recorder;

public class Chronos {
    public static ChronosSession record(RecordOptions options) throws Exception {
        return new ChronosSession(options);
    }
}
