package com.georgicole.thebigeye;

import android.app.Activity;
import android.content.Intent;
import android.os.Bundle;

/** Launches the game in its own task so rotating the launcher alias cannot close it. */
public final class LauncherEntryActivity extends Activity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        Intent launch = new Intent(this, MainActivity.class);
        launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        startActivity(launch);
        finish();
        overridePendingTransition(0, 0);
    }
}
