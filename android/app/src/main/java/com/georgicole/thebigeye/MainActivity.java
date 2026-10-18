package com.georgicole.thebigeye;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(android.os.Bundle savedInstanceState) {
        registerPlugin(StoryIconRotationPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
