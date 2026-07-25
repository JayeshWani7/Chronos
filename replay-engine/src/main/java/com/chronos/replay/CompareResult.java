package com.chronos.replay;

import java.util.ArrayList;
import java.util.List;

public class CompareResult {
    public List<String> domDifferences = new ArrayList<>();
    public List<String> consoleAnomalies = new ArrayList<>();
    public List<String> networkDifferences = new ArrayList<>();
    public List<String> storageDifferences = new ArrayList<>();

    public CompareResult() {}
}
