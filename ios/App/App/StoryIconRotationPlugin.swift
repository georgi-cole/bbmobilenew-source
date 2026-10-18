import Capacitor
import UIKit

@objc(StoryIconRotationPlugin)
public class StoryIconRotationPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "StoryIconRotationPlugin"
    public let jsName = "StoryIconRotation"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "applyLaunchRotation", returnType: CAPPluginReturnPromise)
    ]

    private let stageKey = "storyIconStageV2"
    private let stageCount = 8

    @objc func applyLaunchRotation(_ call: CAPPluginCall) {
        let enabled = call.getBool("enabled", true)

        DispatchQueue.main.async {
            guard UIApplication.shared.supportsAlternateIcons else {
                call.resolve(["stage": 1])
                return
            }

            let defaults = UserDefaults.standard
            let previousStage = defaults.integer(forKey: self.stageKey)
            let stage = enabled ? (previousStage % self.stageCount) + 1 : 1
            let iconName = stage == 1 ? nil : String(format: "StoryIconStage%02d", stage)

            if UIApplication.shared.alternateIconName == iconName {
                defaults.set(stage, forKey: self.stageKey)
                call.resolve(["stage": stage])
                return
            }

            UIApplication.shared.setAlternateIconName(iconName) { error in
                if let error {
                    call.reject("Unable to update the app icon.", nil, error)
                    return
                }

                defaults.set(stage, forKey: self.stageKey)
                call.resolve(["stage": stage])
            }
        }
    }
}
