import XCTest
import UIKit
import Darwin

final class PresentationDeviceTests: XCTestCase {
    override func setUpWithError() throws {
        continueAfterFailure = false
    }

    @MainActor
    private func button(_ app: XCUIApplication, _ title: String) -> XCUIElement {
        app.webViews.buttons[title].firstMatch
    }

    @MainActor
    private func tap(_ app: XCUIApplication, _ title: String, timeout: TimeInterval = 30) {
        let target = button(app, title)
        XCTAssertTrue(target.waitForExistence(timeout: timeout), "Missing test control: \(title)")
        target.tap()
    }

    @MainActor
    private func ready(_ app: XCUIApplication, _ index: Int, timeout: TimeInterval) {
        XCTAssertTrue(button(app, "QA ready \(index)").waitForExistence(timeout: timeout), "Action \(index) did not complete")
    }

    @MainActor
    private func scenePlaybackReady(_ app: XCUIApplication) {
        let scene = app.webViews.descendants(matching: .any).matching(NSPredicate(format: "label == %@", "QA scene ready")).firstMatch
        XCTAssertTrue(scene.waitForExistence(timeout: 15), "Neither video nor its bounded fallback became usable")
    }

    @MainActor
    private func timedGame(_ app: XCUIApplication, _ phase: String, completedAction: Int) {
        tap(app, "QA timed game \(phase)")
        let canvas = button(app, "QA timed game canvas")
        XCTAssertTrue(canvas.waitForExistence(timeout: 25), "Timed game did not start")
        for _ in 0..<20 {
            canvas.tap()
            Thread.sleep(forTimeInterval: 0.15)
        }
        ready(app, completedAction, timeout: 45)
    }

    @MainActor
    private func deviceSnapshot() -> [String: Any] {
        var system = utsname()
        uname(&system)
        let capacity = MemoryLayout.size(ofValue: system.machine)
        let hardware = withUnsafePointer(to: &system.machine) { pointer in
            pointer.withMemoryRebound(to: CChar.self, capacity: capacity) { String(cString: $0) }
        }
        UIDevice.current.isBatteryMonitoringEnabled = true
        #if targetEnvironment(simulator)
        let physical = false
        #else
        let physical = !ProcessInfo.processInfo.isiOSAppOnMac && !ProcessInfo.processInfo.isMacCatalystApp
        #endif
        return [
            "actualPhysicalDevice": physical,
            "hardwareIdentifier": hardware,
            "deviceModel": UIDevice.current.model,
            "operatingSystem": UIDevice.current.systemVersion,
            "thermalState": ProcessInfo.processInfo.thermalState.rawValue,
            "batteryLevel": UIDevice.current.batteryLevel,
            "batteryState": UIDevice.current.batteryState.rawValue,
            "capturedAtEpochSeconds": Date().timeIntervalSince1970,
        ]
    }

    @MainActor
    private func report(_ app: XCUIApplication, family: String, invocation: Int, before: [String: Any]) throws {
        tap(app, "QA finish recording")
        let report = app.webViews.textViews["QA performance report"].firstMatch
        XCTAssertTrue(report.waitForExistence(timeout: 15), "The device report is missing")
        guard let text = report.value as? String, let data = text.data(using: .utf8),
              let captured = try JSONSerialization.jsonObject(with: data) as? [String: Any] else {
            XCTFail("The device report is not valid JSON")
            return
        }
        let envelope: [String: Any] = [
            "reportKind": "xctest-device-presentation-capture",
            "family": family,
            "invocationIndex": invocation,
            "deviceBefore": before,
            "deviceAfter": deviceSnapshot(),
            "capture": captured,
            "nativeMetrics": "Application CPU, memory and clock measurements are stored in the accompanying xcresult, not fabricated in this JSON.",
            "limitations": "XCTest controls measurement warm-up. Raw JavaScript invocations are retained separately from recorded native iterations. Per-process WebContent/GPU attribution and decoder selection need separate OS/Instruments evidence. Charging state must be considered before interpreting battery changes.",
        ]
        let attachment = XCTAttachment(data: try JSONSerialization.data(withJSONObject: envelope, options: [.sortedKeys]), uniformTypeIdentifier: "public.json")
        attachment.name = "presentation-\(family)-invocation-\(invocation).json"
        attachment.lifetime = .keepAlways
        add(attachment)
        let failures = captured["failures"] as? [String] ?? ["Missing failure list"]
        XCTAssertTrue(failures.isEmpty, failures.joined(separator: "; "))
        let cycles = captured["cycles"] as? [[String: Any]] ?? []
        XCTAssertEqual(cycles.count, 20, "Each measured invocation needs twenty full-duration/Skip cycles")
        XCTAssertEqual(cycles.filter { $0["outcome"] as? String == "skip" }.count, 10)
        let metadata = captured["metadata"] as? [String: Any] ?? [:]
        if metadata["variant"] as? String == "candidate" {
            XCTAssertTrue(cycles.allSatisfy { $0["decoded"] as? Bool == true })
            XCTAssertTrue(cycles.allSatisfy { $0["sourceReleased"] as? Bool == true })
        }
        let summary = captured["summary"] as? [String: Any] ?? [:]
        let resources = summary["endResources"] as? [String: Any] ?? [:]
        for field in ["activePresentationRoots", "activePresentationVideos", "attachedPresentationVideoSources", "pendingMediaPreparation"] {
            XCTAssertEqual(resources[field] as? Int, 0, "Presentation resource survived: \(field)")
        }
        let segments = captured["segments"] as? [[String: Any]] ?? []
        for name in ["gameplay-before", "gameplay-after"] {
            let segment = segments.first { $0["label"] as? String == name }
            XCTAssertNotNil(segment)
            XCTAssertGreaterThanOrEqual(segment?["inputResponseSamples"] as? Int ?? 0, 20)
        }

    }

    @MainActor
    private func measureFamily(_ family: String) {
        let app = XCUIApplication()
        let options = XCTMeasureOptions()
        options.iterationCount = 7
        options.invocationOptions = [.manuallyStart, .manuallyStop]
        var invocation = 0
        measure(metrics: [XCTClockMetric(), XCTCPUMetric(application: app), XCTMemoryMetric(application: app)], options: options) {
            invocation += 1
            app.terminate()
            app.launch()
            XCTAssertTrue(button(app, "QA start recording").waitForExistence(timeout: 45))
            let before = deviceSnapshot()
            tap(app, "QA start recording")
            startMeasuring()
            timedGame(app, "before", completedAction: 1)
            for cycle in 0..<20 {
                let title = family == "credits" ? "QA credits" : cycle % 2 == 0 ? "QA Twin combined" : "QA Twin Ali enters"
                tap(app, title)
                if cycle % 4 >= 2 {
                    scenePlaybackReady(app)
                    // XCUITest taps the real app's Skip control. No media seek
                    // or elapsed-time acceleration is used in these captures.
                    tap(app, family == "credits" ? "Skip credits" : "Skip", timeout: 15)
                }
                ready(app, cycle + 2, timeout: family == "credits" ? 75 : 40)
            }
            timedGame(app, "after", completedAction: 22)
            stopMeasuring()
            do { try report(app, family: family, invocation: invocation, before: before) }
            catch { XCTFail("Could not retain device evidence: \(error)") }
            app.terminate()
        }
    }

    @MainActor
    func testTwinPerformance() {
        measureFamily("twin")
    }

    @MainActor
    func testCreditsPerformance() {
        measureFamily("credits")
    }

    @MainActor
    func testDeviceFixtureSmoke() {
        let app = XCUIApplication()
        app.launch()
        defer { app.terminate() }
        tap(app, "QA start recording", timeout: 45)
        tap(app, "QA credits")
        scenePlaybackReady(app)
        tap(app, "Skip credits", timeout: 15)
        ready(app, 1, timeout: 20)
        tap(app, "QA Twin combined")
        scenePlaybackReady(app)
        tap(app, "Skip", timeout: 15)
        ready(app, 2, timeout: 20)
        let screenshot = XCTAttachment(screenshot: app.screenshot())
        screenshot.name = "device-fixture-smoke"
        screenshot.lifetime = .keepAlways
        add(screenshot)
    }

    @MainActor
    func testTwinVerdictsOnDevice() {
        let app = XCUIApplication()
        app.launch()
        defer { app.terminate() }
        tap(app, "QA start recording", timeout: 45)
        for (index, entry) in [("QA Twin combined", "Lia & Ali play as one."), ("QA Twin Ali enters", "Ali enters the House.")].enumerated() {
            tap(app, entry.0)
            let verdict = app.webViews.descendants(matching: .any).matching(NSPredicate(format: "label == %@", entry.1)).firstMatch
            XCTAssertTrue(verdict.waitForExistence(timeout: 20), "Wrong or missing live verdict")
            Thread.sleep(forTimeInterval: 0.6)
            let screenshot = XCTAttachment(screenshot: app.screenshot())
            screenshot.name = "twin-live-verdict-\(index)"
            screenshot.lifetime = .keepAlways
            add(screenshot)
            ready(app, index + 1, timeout: 30)
        }
    }

    @MainActor
    func testBackgroundResumeAndRouteExit() throws {
        let app = XCUIApplication()
        app.launch()
        defer { app.terminate() }
        let before = deviceSnapshot()
        tap(app, "QA start recording", timeout: 45)
        for (index, title) in ["QA Twin combined", "QA credits"].enumerated() {
            tap(app, title)
            scenePlaybackReady(app)
            XCUIDevice.shared.press(.home)
            Thread.sleep(forTimeInterval: 2)
            app.activate()
            scenePlaybackReady(app)
            tap(app, "QA exit scene")
            ready(app, index + 1, timeout: 25)
        }
        tap(app, "QA finish recording")
        let report = app.webViews.textViews["QA performance report"].firstMatch
        XCTAssertTrue(report.waitForExistence(timeout: 15))
        guard let text = report.value as? String, let data = text.data(using: .utf8),
              let capture = try JSONSerialization.jsonObject(with: data) as? [String: Any] else {
            XCTFail("Missing interruption report")
            return
        }
        XCTAssertTrue((capture["failures"] as? [String] ?? ["Missing failures"]).isEmpty)
        let cycles = capture["cycles"] as? [[String: Any]] ?? []
        XCTAssertEqual(cycles.count, 2)
        XCTAssertTrue(cycles.allSatisfy { $0["outcome"] as? String == "route-exit" && $0["sourceReleased"] as? Bool == true })
        let summary = capture["summary"] as? [String: Any] ?? [:]
        XCTAssertGreaterThanOrEqual(summary["backgroundTransitions"] as? Int ?? 0, 2)
        XCTAssertGreaterThanOrEqual(summary["foregroundTransitions"] as? Int ?? 0, 2)
        let resources = summary["endResources"] as? [String: Any] ?? [:]
        for field in ["activePresentationRoots", "activePresentationVideos", "attachedPresentationVideoSources", "pendingMediaPreparation"] {
            XCTAssertEqual(resources[field] as? Int, 0)
        }
        let envelope: [String: Any] = ["reportKind": "xctest-native-interruption-capture", "deviceBefore": before, "deviceAfter": deviceSnapshot(), "capture": capture]
        let attachment = XCTAttachment(data: try JSONSerialization.data(withJSONObject: envelope, options: [.sortedKeys]), uniformTypeIdentifier: "public.json")
        attachment.name = "native-background-resume-route-exit.json"
        attachment.lifetime = .keepAlways
        add(attachment)
    }
}
