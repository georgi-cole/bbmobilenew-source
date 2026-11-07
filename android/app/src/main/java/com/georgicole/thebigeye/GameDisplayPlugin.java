package com.georgicole.thebigeye;

import android.content.pm.ActivityInfo;
import android.view.Window;
import android.view.WindowManager;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/** Native display policy; the OS and player retain control of performance Game Mode. */
@CapacitorPlugin(name = "GameDisplay")
public final class GameDisplayPlugin extends Plugin {
    private boolean active;
    private boolean allowLandscape;

    @PluginMethod
    public void setState(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            active = call.getBoolean("active", false);
            allowLandscape = call.getBoolean("allowLandscape", false);
            applyState();
            call.resolve();
        });
    }

    private void applyState() {
        Window window = getActivity().getWindow();
        if (active) {
            window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        } else {
            window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        }

        int orientation = allowLandscape
            ? ActivityInfo.SCREEN_ORIENTATION_USER
            : ActivityInfo.SCREEN_ORIENTATION_PORTRAIT;
        if (getActivity().getRequestedOrientation() != orientation) {
            getActivity().setRequestedOrientation(orientation);
        }

        WindowInsetsControllerCompat controller = WindowCompat.getInsetsController(window, window.getDecorView());
        controller.setSystemBarsBehavior(WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
        if (active) {
            controller.hide(WindowInsetsCompat.Type.systemBars());
        } else {
            controller.show(WindowInsetsCompat.Type.systemBars());
        }
    }

    @Override
    protected void handleOnResume() {
        applyState();
    }

    @Override
    protected void handleOnPause() {
        getActivity().getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
    }

    @Override
    protected void handleOnDestroy() {
        getActivity().getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
    }
}
