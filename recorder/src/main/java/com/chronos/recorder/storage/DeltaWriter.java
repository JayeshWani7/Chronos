package com.chronos.recorder.storage;

import java.io.BufferedOutputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.OutputStream;
import java.nio.file.Path;

public class DeltaWriter implements AutoCloseable {
    private final BufferedOutputStream out;
    private long currentOffset = 0;

    public DeltaWriter(Path deltasPath) throws IOException {
        this.out = new BufferedOutputStream(new FileOutputStream(deltasPath.toFile()));
    }

    /**
     * Writes a binary delta record: [varint length][1-byte op][varint node_ref][payload bytes]
     * @return the byte offset where this delta starts.
     */
    public synchronized long writeDelta(byte op, int nodeRef, byte[] payload) throws IOException {
        long offset = currentOffset;

        // Calculate record length: 1 byte (op) + varint length of nodeRef + payload length
        int nodeRefVarintLen = getVarintSize(nodeRef);
        int payloadLen = (payload != null) ? payload.length : 0;
        int recordLen = 1 + nodeRefVarintLen + payloadLen;

        // Write [varint length of record]
        writeVarInt(recordLen, out);
        currentOffset += getVarintSize(recordLen);

        // Write [1-byte op]
        out.write(op);
        currentOffset += 1;

        // Write [varint node_ref]
        writeVarInt(nodeRef, out);
        currentOffset += nodeRefVarintLen;

        // Write [payload bytes]
        if (payload != null && payload.length > 0) {
            out.write(payload);
            currentOffset += payload.length;
        }

        return offset;
    }

    private void writeVarInt(int value, OutputStream out) throws IOException {
        while ((value & 0xFFFFFF80) != 0L) {
            out.write((value & 0x7F) | 0x80);
            value >>>= 7;
        }
        out.write(value & 0x7F);
    }

    private int getVarintSize(int value) {
        int size = 0;
        do {
            size++;
            value >>>= 7;
        } while (value != 0);
        return size;
    }

    public synchronized void flush() throws IOException {
        out.flush();
    }

    @Override
    public void close() throws Exception {
        out.close();
    }
}
