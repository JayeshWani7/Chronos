package com.chronos.replay;

import java.util.ArrayList;
import java.util.List;

public class DiffResult {
    public List<String> domChanges = new ArrayList<>();
    public List<String> consoleLogsAdded = new ArrayList<>();
    public List<String> networkRequestsAdded = new ArrayList<>();
    public List<String> storageChanges = new ArrayList<>();

    public DiffResult() {}
}
