package com.chronos.replay;

import java.io.IOException;
import java.io.RandomAccessFile;
import java.nio.ByteBuffer;
import java.nio.channels.FileChannel;
import java.nio.file.Path;

public class DeltaReader implements AutoCloseable {
    private final RandomAccessFile file;
    private final FileChannel channel;

    public DeltaReader(Path path) throws IOException {
        this.file = new RandomAccessFile(path.toFile(), "r");
        this.channel = file.getChannel();
    }

    public static class DeltaRecord {
        public byte op;
        public int nodeRef;
        public byte[] payload;
    }

    public synchronized DeltaRecord readDelta(long offset) throws IOException {
        channel.position(offset);
        
        // Read varint record length
        // A varint takes at most 5 bytes for standard integers
        ByteBuffer buf = ByteBuffer.allocate(5);
        channel.read(buf);
        buf.flip();
        if (buf.remaining() == 0) {
            return null;
        }
        
        // Read varint
        int value = 0;
        int shift = 0;
        int varintBytesRead = 0;
        while (buf.hasRemaining()) {
            byte b = buf.get();
            varintBytesRead++;
            value |= (b & 0x7F) << shift;
            if ((b & 0x80) == 0) {
                break;
            }
            shift += 7;
        }
        
        int recordLen = value;
        
        // Reposition channel to start of record content (offset + varintBytesRead)
        channel.position(offset + varintBytesRead);
        ByteBuffer recordBuf = ByteBuffer.allocate(recordLen);
        channel.read(recordBuf);
        recordBuf.flip();
        
        DeltaRecord record = new DeltaRecord();
        record.op = recordBuf.get();
        
        // Read varint nodeRef from recordBuf
        int nodeRef = 0;
        int nodeRefShift = 0;
        while (recordBuf.hasRemaining()) {
            byte b = recordBuf.get();
            nodeRef |= (b & 0x7F) << nodeRefShift;
            if ((b & 0x80) == 0) {
                break;
            }
            nodeRefShift += 7;
        }
        record.nodeRef = nodeRef;
        
        // Remaining bytes is payload
        byte[] payload = new byte[recordBuf.remaining()];
        recordBuf.get(payload);
        record.payload = payload;
        
        return record;
    }

    @Override
    public void close() throws IOException {
        channel.close();
        file.close();
    }
}
