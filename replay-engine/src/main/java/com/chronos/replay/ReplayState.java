package com.chronos.replay;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

public class ReplayState {
    public String html = "";
    public Map<String, String> localStorage = new HashMap<>();
    public Map<String, String> sessionStorage = new HashMap<>();
    public Map<String, String> cookies = new HashMap<>();
    public List<ConsoleLog> consoleLogs = new ArrayList<>();
    public List<NetworkRequest> networkRequests = new ArrayList<>();

    public ReplayState() {}
}
