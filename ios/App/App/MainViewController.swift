import Capacitor
import StoreKit
import UIKit

class MainViewController: CAPBridgeViewController {
    private var gameplayActive = false
    private var allowsLandscape = false

    override func capacitorDidLoad() {
        bridge?.registerPluginInstance(GameDisplayPlugin())
        bridge?.registerPluginInstance(CinematicPackPlugin())
        bridge?.registerPluginInstance(AppDistributionPlugin())
    }

    override var supportedInterfaceOrientations: UIInterfaceOrientationMask {
        if UIDevice.current.userInterfaceIdiom == .pad {
            return .all
        }

        return allowsLandscape ? .allButUpsideDown : .portrait
    }

    override var preferredScreenEdgesDeferringSystemGestures: UIRectEdge {
        gameplayActive ? .bottom : []
    }

    func updateGameDisplay(active: Bool, allowLandscape: Bool) {
        gameplayActive = active
        setNeedsUpdateOfScreenEdgesDeferringSystemGestures()

        if allowsLandscape != allowLandscape {
            allowsLandscape = allowLandscape
            if #available(iOS 16.0, *) {
                setNeedsUpdateOfSupportedInterfaceOrientations()
                view.window?.windowScene?.requestGeometryUpdate(
                    .iOS(interfaceOrientations: supportedInterfaceOrientations)
                )
            } else {
                UIViewController.attemptRotationToDeviceOrientation()
            }
        }
        publishSafeArea()
    }

    override func viewSafeAreaInsetsDidChange() {
        super.viewSafeAreaInsetsDidChange()
        publishSafeArea()
    }

    private func publishSafeArea() {
        // Preserve the camera cutout even with the status bar hidden, and retire
        // the web startup estimate when UIKit has measured the actual window.
        let insets = view.safeAreaInsets
        webView?.evaluateJavaScript("""
            (() => {
                const style = document.documentElement.style;
                style.setProperty('--safe-area-inset-top', '\(insets.top)px');
                style.setProperty('--safe-area-inset-right', '\(insets.right)px');
                style.setProperty('--safe-area-inset-bottom', '\(insets.bottom)px');
                style.setProperty('--safe-area-inset-left', '\(insets.left)px');
                style.setProperty('--app-safe-area-top-fallback', '0px');
                window.dispatchEvent(new Event('resize'));
            })();
            """, completionHandler: nil)
    }
}

@objc(AppDistributionPlugin)
public class AppDistributionPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "AppDistributionPlugin"
    public let jsName = "AppDistribution"
    public let pluginMethods = [
        CAPPluginMethod(name: "getDistribution", returnType: CAPPluginReturnPromise)
    ]

    @objc func getDistribution(_ call: CAPPluginCall) {
        Task {
            let bundle = Bundle.main
            var channel = "unknown"
            var source = "storekit_unavailable"

            if #available(iOS 16.0, *) {
                do {
                    if case .verified(let transaction) = try await AppTransaction.shared {
                        switch transaction.environment {
                        case .production: channel = "app_store"
                        case .sandbox: channel = "testflight"
                        case .xcode: channel = "development"
                        default: break
                        }
                        source = "storekit_app_transaction"
                    }
                } catch {
                    // No account prompt or forced refresh is needed for analytics.
                }
            }
            call.resolve([
                "channel": channel,
                "source": source,
                "version": bundle.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "unknown",
                "build": bundle.object(forInfoDictionaryKey: "CFBundleVersion") as? String ?? "unknown"
            ])
        }
    }
}

@objc(GameDisplayPlugin)
public class GameDisplayPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "GameDisplayPlugin"
    public let jsName = "GameDisplay"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "setState", returnType: CAPPluginReturnPromise)
    ]

    private var active = false
    private var observers: [NSObjectProtocol] = []

    override public func load() {
        let center = NotificationCenter.default
        observers.append(center.addObserver(
            forName: UIApplication.willResignActiveNotification, object: nil, queue: .main
        ) { _ in
            UIApplication.shared.isIdleTimerDisabled = false
        })
        observers.append(center.addObserver(
            forName: UIApplication.didBecomeActiveNotification, object: nil, queue: .main
        ) { [weak self] _ in
            UIApplication.shared.isIdleTimerDisabled = self?.active ?? false
        })
    }

    @objc func setState(_ call: CAPPluginCall) {
        let active = call.getBool("active", false)
        let allowLandscape = call.getBool("allowLandscape", false)
        DispatchQueue.main.async {
            self.active = active
            UIApplication.shared.isIdleTimerDisabled = active && UIApplication.shared.applicationState == .active
            (self.bridge?.viewController as? MainViewController)?.updateGameDisplay(
                active: active, allowLandscape: allowLandscape
            )
            call.resolve()
        }
    }

    deinit {
        for observer in observers {
            NotificationCenter.default.removeObserver(observer)
        }
    }
}
