package com.chronos.replay;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

public class SerializedNode {
    public int id;
    public int nodeType;
    public String tagName;
    public Map<String, String> attributes = new HashMap<>();
    public String nodeValue = "";
    public List<Integer> childNodes = new ArrayList<>();

    public SerializedNode() {}

    public SerializedNode(int id, int nodeType) {
        this.id = id;
        this.nodeType = nodeType;
    }
}
