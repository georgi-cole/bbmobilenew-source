package com.georgicole.thebigeye;

import android.content.ComponentName;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.os.Build;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.util.ArrayList;
import java.util.List;

@CapacitorPlugin(name = "StoryIconRotation")
public final class StoryIconRotationPlugin extends Plugin {
    private static final String PREFERENCES_NAME = "story_icon_rotation_v2";
    private static final String STAGE_KEY = "stage";
    private static final int STAGE_COUNT = 8;

    @PluginMethod
    public void applyLaunchRotation(PluginCall call) {
        boolean enabled = call.getBoolean("enabled", true);
        SharedPreferences preferences =
            getContext().getSharedPreferences(PREFERENCES_NAME, android.content.Context.MODE_PRIVATE);
        int previousStage = preferences.getInt(STAGE_KEY, 0);
        int nextStage = enabled ? (previousStage % STAGE_COUNT) + 1 : 1;

        try {
            setEnabledLauncherAlias(nextStage);
            preferences.edit().putInt(STAGE_KEY, nextStage).commit();
            resolve(call, nextStage);
        } catch (RuntimeException error) {
            call.reject("Unable to update the launcher icon.", error);
        }
    }

    private void setEnabledLauncherAlias(int selectedStage) {
        PackageManager packageManager = getContext().getPackageManager();

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            List<PackageManager.ComponentEnabledSetting> settings = new ArrayList<>();
            for (int stage = 1; stage <= STAGE_COUNT; stage++) {
                settings.add(
                    new PackageManager.ComponentEnabledSetting(
                        aliasComponent(stage),
                        stage == selectedStage
                            ? PackageManager.COMPONENT_ENABLED_STATE_ENABLED
                            : PackageManager.COMPONENT_ENABLED_STATE_DISABLED,
                        PackageManager.DONT_KILL_APP
                    )
                );
            }
            packageManager.setComponentEnabledSettings(settings);
            return;
        }

        packageManager.setComponentEnabledSetting(
            aliasComponent(selectedStage),
            PackageManager.COMPONENT_ENABLED_STATE_ENABLED,
            PackageManager.DONT_KILL_APP
        );
        for (int stage = 1; stage <= STAGE_COUNT; stage++) {
            if (stage == selectedStage) continue;
            packageManager.setComponentEnabledSetting(
                aliasComponent(stage),
                PackageManager.COMPONENT_ENABLED_STATE_DISABLED,
                PackageManager.DONT_KILL_APP
            );
        }
    }

    private ComponentName aliasComponent(int stage) {
        String aliasName = getContext().getPackageName() + ".StoryIconStage" + String.format("%02d", stage);
        return new ComponentName(getContext(), aliasName);
    }

    private void resolve(PluginCall call, int stage) {
        JSObject result = new JSObject();
        result.put("stage", stage);
        call.resolve(result);
    }
}
