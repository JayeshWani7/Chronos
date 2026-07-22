package com.chronos.replay;

public class QueryResultRow {
    public long tsMs;
    public String category;
    public String details;

    public QueryResultRow() {}

    public QueryResultRow(long tsMs, String category, String details) {
        this.tsMs = tsMs;
        this.category = category;
        this.details = details;
    }
}
