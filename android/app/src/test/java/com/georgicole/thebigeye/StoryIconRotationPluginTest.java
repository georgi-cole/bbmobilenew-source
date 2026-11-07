package com.georgicole.thebigeye;

import static org.junit.Assert.assertEquals;

import java.util.Locale;
import org.junit.Test;

public final class StoryIconRotationPluginTest {
    @Test
    public void launcherAliasUsesManifestDigitsInEveryLocale() {
        Locale original = Locale.getDefault();
        try {
            Locale.setDefault(Locale.forLanguageTag("ar-EG"));
            assertEquals(".StoryIconStage02", StoryIconRotationPlugin.stageAliasSuffix(2));
            assertEquals(".StoryIconStage08", StoryIconRotationPlugin.stageAliasSuffix(8));
        } finally {
            Locale.setDefault(original);
        }
    }
}
