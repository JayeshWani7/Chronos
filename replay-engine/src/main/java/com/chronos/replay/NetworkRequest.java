package com.chronos.replay;

public class NetworkRequest {
    public int id;
    public long tsStartMs;
    public long tsEndMs;
    public String method;
    public String url;
    public int status;
    public String requestHeaders;
    public String responseHeaders;
    public String bodyRef;
    public String timingJson;
    public String initiator;
    public int sizeBytes;

    public NetworkRequest() {}
}
