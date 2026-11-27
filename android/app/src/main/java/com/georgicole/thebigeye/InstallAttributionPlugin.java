package com.georgicole.thebigeye;

import android.content.SharedPreferences;
import android.content.pm.InstallSourceInfo;
import android.content.pm.PackageManager;
import android.content.pm.PackageInfo;
import android.os.Build;
import android.net.Uri;
import android.text.TextUtils;
import com.android.installreferrer.api.InstallReferrerClient;
import com.android.installreferrer.api.InstallReferrerStateListener;
import com.android.installreferrer.api.ReferrerDetails;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "InstallAttribution")
public class InstallAttributionPlugin extends Plugin {
    private static final String PREFERENCES = "big_eye_install_attribution";
    private static final String RESULT_KEY = "sanitized_result";

    @PluginMethod
    public void getAttribution(PluginCall call) {
        SharedPreferences preferences = getContext().getSharedPreferences(PREFERENCES, 0);
        String cached = preferences.getString(RESULT_KEY, null);
        if (cached != null) {
            try {
                call.resolve(new JSObject(cached));
            } catch (Exception error) {
                preferences.edit().remove(RESULT_KEY).apply();
                readFromPlayStore(call, preferences);
            }
            return;
        }
        readFromPlayStore(call, preferences);
    }

    @PluginMethod
    public void getDistribution(PluginCall call) {
        String installer = null;
        try {
            PackageManager packageManager = getContext().getPackageManager();
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                InstallSourceInfo sourceInfo = packageManager.getInstallSourceInfo(
                    getContext().getPackageName()
                );
                installer = sourceInfo.getInstallingPackageName();
            } else {
                installer = packageManager.getInstallerPackageName(getContext().getPackageName());
            }
        } catch (Exception ignored) {
            // Installer metadata can be absent for restored, sideloaded, or older installs.
        }

        String channel;
        if ("com.android.vending".equals(installer)) {
            channel = "google_play";
        } else if (!TextUtils.isEmpty(installer)) {
            channel = "sideloaded";
        } else {
            channel = "unknown";
        }

        JSObject result = new JSObject();
        result.put("channel", channel);
        result.put("source", "android_installer");
        try {
            PackageInfo info = getContext().getPackageManager()
                .getPackageInfo(getContext().getPackageName(), 0);
            result.put("version", info.versionName);
            long build = Build.VERSION.SDK_INT >= Build.VERSION_CODES.P
                ? info.getLongVersionCode() : info.versionCode;
            result.put("build", Long.toString(build));
        } catch (PackageManager.NameNotFoundException ignored) {
            // The native version is optional.
        }
        call.resolve(result);
    }

    private void readFromPlayStore(PluginCall call, SharedPreferences preferences) {
        InstallReferrerClient client = InstallReferrerClient.newBuilder(getContext()).build();
        client.startConnection(new InstallReferrerStateListener() {
            @Override
            public void onInstallReferrerSetupFinished(int responseCode) {
                if (responseCode != InstallReferrerClient.InstallReferrerResponse.OK) {
                    client.endConnection();
                    call.resolve(new JSObject().put("available", false));
                    return;
                }

                try {
                    ReferrerDetails details = client.getInstallReferrer();
                    JSObject result = sanitizeReferrer(details.getInstallReferrer());
                    preferences.edit().putString(RESULT_KEY, result.toString()).apply();
                    call.resolve(result);
                } catch (Exception error) {
                    call.resolve(new JSObject().put("available", false));
                } finally {
                    client.endConnection();
                }
            }

            @Override
            public void onInstallReferrerServiceDisconnected() {
                client.endConnection();
                call.resolve(new JSObject().put("available", false));
            }
        });
    }

    private JSObject sanitizeReferrer(String referrer) {
        String value = referrer == null ? "" : referrer;
        Uri query = Uri.parse("https://install-referrer.invalid/?" + value);
        String source = safeValue(query.getQueryParameter("utm_source"));
        String medium = safeValue(query.getQueryParameter("utm_medium"));
        String campaign = safeValue(firstNonEmpty(
            query.getQueryParameter("utm_campaign"),
            query.getQueryParameter("campaign")
        ));
        String campaignId = safeValue(firstNonEmpty(
            query.getQueryParameter("utm_id"),
            query.getQueryParameter("campaign_id")
        ));
        boolean gclidPresent = !TextUtils.isEmpty(query.getQueryParameter("gclid"));
        boolean gbraidPresent = !TextUtils.isEmpty(query.getQueryParameter("gbraid"));
        if (source == null && (gclidPresent || gbraidPresent)) source = "google_ads";

        JSObject result = new JSObject();
        result.put("available", true);
        result.put("referrer_present", !TextUtils.isEmpty(value));
        if (source != null) result.put("source", source);
        if (medium != null) result.put("medium", medium);
        if (campaign != null) result.put("campaign", campaign);
        if (campaignId != null) result.put("campaign_id", campaignId);
        result.put("gclid_present", gclidPresent);
        result.put("gbraid_present", gbraidPresent);
        return result;
    }

    private String firstNonEmpty(String first, String second) {
        return !TextUtils.isEmpty(first) ? first : second;
    }

    private String safeValue(String value) {
        if (TextUtils.isEmpty(value)) return null;
        String sanitized = value.trim().replaceAll("[^a-zA-Z0-9_./#-]", "_");
        return sanitized.length() > 80 ? sanitized.substring(0, 80) : sanitized;
    }
}
