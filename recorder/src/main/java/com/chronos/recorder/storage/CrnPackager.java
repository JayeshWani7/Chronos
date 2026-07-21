package com.chronos.recorder.storage;

import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;

public class CrnPackager {

    public static void packageSession(Path outputCrn, Path sqliteDb, Path deltasBin, Path metadataJson) throws IOException {
        // Ensure parent directories exist
        if (outputCrn.getParent() != null) {
            Files.createDirectories(outputCrn.getParent());
        }

        try (ZipOutputStream zos = new ZipOutputStream(new FileOutputStream(outputCrn.toFile()))) {
            addToZip(zos, sqliteDb, "timeline.sqlite");
            addToZip(zos, deltasBin, "deltas.bin");
            addToZip(zos, metadataJson, "metadata.json");

            // Write standard manifest.json
            Path manifestPath = Files.createTempFile("manifest", ".json");
            String manifestJson = "{\n  \"schema_version\": \"1.0\",\n  \"files\": [\"timeline.sqlite\", \"deltas.bin\", \"metadata.json\"]\n}";
            Files.writeString(manifestPath, manifestJson);
            addToZip(zos, manifestPath, "manifest.json");
            try {
                Files.delete(manifestPath);
            } catch (Exception e) {}
        }
    }

    private static void addToZip(ZipOutputStream zos, Path file, String zipPath) throws IOException {
        if (!Files.exists(file)) {
            return;
        }

        ZipEntry entry = new ZipEntry(zipPath);
        zos.putNextEntry(entry);

        try (FileInputStream fis = new FileInputStream(file.toFile())) {
            byte[] buffer = new byte[4096];
            int len;
            while ((len = fis.read(buffer)) > 0) {
                zos.write(buffer, 0, len);
            }
        }
        zos.closeEntry();
    }
}
