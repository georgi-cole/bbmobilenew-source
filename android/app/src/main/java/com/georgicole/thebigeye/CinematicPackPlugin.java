package com.georgicole.thebigeye;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import org.json.JSONArray;
import org.json.JSONObject;
import java.io.*;
import java.net.HttpURLConnection;
import java.net.URL;
import java.security.MessageDigest;
import java.util.UUID;
import java.util.concurrent.Executors;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.atomic.AtomicBoolean;

/** Private, durable, non-backup media. No save data or billing state is stored here. */
@CapacitorPlugin(name = "CinematicPack")
public class CinematicPackPlugin extends Plugin {
    private final ExecutorService work = Executors.newSingleThreadExecutor();
    private final AtomicBoolean busy = new AtomicBoolean(false);
    private final AtomicBoolean cancelled = new AtomicBoolean(false);
    private volatile HttpURLConnection connection;

    private static class Plan {
        final String revision;
        final long total;
        final JSONArray files;
        Plan(PluginCall call) throws Exception {
            JSONObject manifest = call.getObject("manifest");
            if (manifest == null) throw new IOException("Missing manifest");
            revision = manifest.getString("revision");
            files = manifest.getJSONArray("files");
            total = manifest.getLong("totalBytes");
            if (!revision.matches("[a-f0-9]{64}") || files.length() == 0 || files.length() > 10000 || total <= 0 || total > 1024L * 1024 * 1024) throw new IOException("Invalid manifest");
            long sum = 0;
            java.util.HashSet<String> paths = new java.util.HashSet<>();
            for (int i = 0; i < files.length(); i++) {
                JSONObject file = files.getJSONObject(i);
                String name = file.getString("path");
                long bytes = file.getLong("bytes");
                if (!name.matches("assets/ceremonies/[A-Za-z0-9_./ -]+\\.(webp|png|jpg|jpeg|avif)") || name.contains("..") || !paths.add(name) || bytes <= 0 || bytes > 64 * 1024 * 1024 || !file.getString("sha256").matches("[a-f0-9]{64}")) throw new IOException("Invalid media entry");
                sum += bytes;
            }
            if (sum != total) throw new IOException("Invalid media size");
        }
    }

    private File root() throws IOException {
        File directory = new File(getContext().getNoBackupFilesDir(), "vip-cinematics");
        if (!directory.isDirectory() && !directory.mkdirs()) throw new IOException("Storage unavailable");
        return directory;
    }
    private void checkCancelled() throws IOException {
        if (cancelled.get()) throw new IOException("Download cancelled");
    }
    private String hash(File file) throws Exception {
        MessageDigest digest = MessageDigest.getInstance("SHA-256");
        try (InputStream input = new FileInputStream(file)) {
            byte[] buffer = new byte[65536];
            int length;
            while ((length = input.read(buffer)) != -1) digest.update(buffer, 0, length);
        }
        StringBuilder text = new StringBuilder();
        for (byte value : digest.digest()) text.append(String.format(java.util.Locale.ROOT, "%02x", value & 255));
        return text.toString();
    }
    private JSObject inspect(Plan plan) throws Exception {
        File directory = new File(root(), plan.revision);
        JSObject result = new JSObject();
        result.put("installed", false);
        if (!directory.isDirectory()) return result;
        JSONArray proof = new JSONArray();
        for (int i = 0; i < plan.files.length(); i++) {
            JSONObject entry = plan.files.getJSONObject(i);
            File file = new File(directory, entry.getString("path"));
            if (!file.isFile() || file.length() != entry.getLong("bytes") || !hash(file).equals(entry.getString("sha256"))) return result;
            JSONObject local = new JSONObject(entry.toString());
            local.put("uri", android.net.Uri.fromFile(file).toString());
            proof.put(local);
        }
        result.put("installed", true);
        result.put("files", proof);
        return result;
    }
    private void removeTree(File file) throws IOException {
        String prefix = root().getCanonicalPath() + File.separator;
        if (!file.getCanonicalPath().startsWith(prefix)) throw new IOException("Invalid storage path");
        File[] children = file.listFiles();
        if (children != null) for (File child : children) removeTree(child);
        if (file.exists() && !file.delete()) throw new IOException("Could not remove media");
    }
    private void progress(long bytes, boolean verifying) {
        JSObject event = new JSObject();
        event.put("bytes", bytes);
        event.put("verifying", verifying);
        notifyListeners("progress", event);
    }

    @PluginMethod public void inspect(PluginCall call) {
        work.execute(() -> {
            try {
                if (!busy.get()) {
                    File[] entries = root().listFiles();
                    if (entries != null) for (File entry : entries) {
                        if (entry.getName().startsWith(".partial-") || entry.getName().startsWith(".download-")) removeTree(entry);
                    }
                }
                call.resolve(inspect(new Plan(call)));
            }
            catch (Exception error) { call.reject("Cinematic installation could not be checked", error); }
        });
    }
    @PluginMethod public void download(PluginCall call) {
        if (!busy.compareAndSet(false, true)) { call.reject("A cinematic download is already running"); return; }
        cancelled.set(false);
        work.execute(() -> {
            File staging = null;
            File archive = null;
            try {
                Plan plan = new Plan(call);
                String expected = "https://github.com/georgi-cole/bbmobilenew-source/releases/download/vip-cinematics-" + plan.revision + "/vip-cinematics.pack";
                if (!expected.equals(call.getString("url"))) throw new IOException("Invalid download location");
                JSObject existing = inspect(plan);
                if (existing.getBoolean("installed")) { call.resolve(existing); return; }
                if (root().getUsableSpace() < plan.total * 2 + 10 * 1024 * 1024) throw new IOException("Not enough storage");
                staging = new File(root(), ".partial-" + UUID.randomUUID());
                if (!staging.mkdirs()) throw new IOException("Storage unavailable");
                archive = new File(root(), ".download-" + UUID.randomUUID());
                connection = (HttpURLConnection) new URL(expected).openConnection();
                connection.setConnectTimeout(15000);
                connection.setReadTimeout(30000);
                connection.setRequestProperty("Accept-Encoding", "identity");
                if (connection.getResponseCode() != 200) throw new IOException("Download unavailable");
                long received = 0;
                long lastProgress = 0;
                try (InputStream input = connection.getInputStream(); OutputStream output = new FileOutputStream(archive)) {
                    byte[] buffer = new byte[65536]; int length;
                    while ((length = input.read(buffer)) != -1) {
                        checkCancelled(); received += length;
                        if (received > plan.total) throw new IOException("Unexpected download size");
                        output.write(buffer, 0, length);
                        long now = System.currentTimeMillis();
                        if (now - lastProgress >= 100) { progress(received, false); lastProgress = now; }
                    }
                }
                if (received != plan.total) throw new IOException("Incomplete download");
                progress(received, true);
                try (InputStream input = new BufferedInputStream(new FileInputStream(archive))) {
                    byte[] buffer = new byte[65536];
                    for (int i = 0; i < plan.files.length(); i++) {
                        checkCancelled();
                        JSONObject entry = plan.files.getJSONObject(i);
                        File file = new File(staging, entry.getString("path"));
                        if (!file.getParentFile().isDirectory() && !file.getParentFile().mkdirs()) throw new IOException("Storage unavailable");
                        long remaining = entry.getLong("bytes");
                        try (OutputStream output = new FileOutputStream(file)) {
                            while (remaining > 0) {
                                int length = input.read(buffer, 0, (int) Math.min(buffer.length, remaining));
                                if (length < 0) throw new IOException("Incomplete image");
                                output.write(buffer, 0, length); remaining -= length;
                            }
                        }
                        if (!hash(file).equals(entry.getString("sha256"))) throw new IOException("Damaged image");
                    }
                    if (input.read() != -1) throw new IOException("Unexpected media data");
                }
                checkCancelled();
                File destination = new File(root(), plan.revision);
                if (destination.exists()) removeTree(destination);
                if (!staging.renameTo(destination)) throw new IOException("Could not install media");
                call.resolve(inspect(plan));
            } catch (Exception error) { call.reject("Cinematic download could not be completed", error); }
            finally {
                if (connection != null) { connection.disconnect(); connection = null; }
                try { if (staging != null && staging.exists()) removeTree(staging); if (archive != null && archive.exists()) removeTree(archive); } catch (IOException ignored) { /* Recoverable private staging files. */ }
                busy.set(false);
            }
        });
    }
    @PluginMethod public void cancel(PluginCall call) {
        cancelled.set(true);
        HttpURLConnection current = connection;
        if (current != null) current.disconnect();
        call.resolve();
    }
    @PluginMethod public void remove(PluginCall call) {
        if (busy.get()) { call.reject("A download is running"); return; }
        work.execute(() -> {
            try { removeTree(new File(root(), new Plan(call).revision)); call.resolve(); }
            catch (Exception error) { call.reject("Cinematic download could not be removed", error); }
        });
    }
}
