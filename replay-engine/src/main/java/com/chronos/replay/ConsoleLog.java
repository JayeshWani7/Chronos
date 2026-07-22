package com.chronos.replay;

public class ConsoleLog {
    public int id;
    public long tsMs;
    public String level;
    public String message;
    public String stack;

    public ConsoleLog() {}

    public ConsoleLog(int id, long tsMs, String level, String message, String stack) {
        this.id = id;
        this.tsMs = tsMs;
        this.level = level;
        this.message = message;
        this.stack = stack;
    }
}
