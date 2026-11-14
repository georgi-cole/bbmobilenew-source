import Capacitor
import CryptoKit
import Foundation

@objc(CinematicPackPlugin)
public class CinematicPackPlugin: CAPPlugin, CAPBridgedPlugin, URLSessionDownloadDelegate, @unchecked Sendable {
    public let identifier = "CinematicPackPlugin"
    public let jsName = "CinematicPack"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "inspect", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "download", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "cancel", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "remove", returnType: CAPPluginReturnPromise)
    ]
    private let work = DispatchQueue(label: "big-eye.cinematic-pack")
    private var task: URLSessionDownloadTask?
    private var activeCall: CAPPluginCall?
    private var activePlan: Plan?
    private var session: URLSession?
    private var cancelled = false
    private let fm = FileManager.default

    private struct Entry {
        let path: String
        let bytes: Int
        let sha256: String
    }
    private struct Plan {
        let revision: String
        let total: Int
        let files: [Entry]
    }
    private func failure(_ message: String) -> NSError {
        NSError(domain: "CinematicPack", code: 1, userInfo: [NSLocalizedDescriptionKey: message])
    }
    private func plan(_ call: CAPPluginCall) throws -> Plan {
        guard let manifest = call.getObject("manifest"),
              let revision = manifest["revision"] as? String, revision.range(of: "^[a-f0-9]{64}$", options: .regularExpression) != nil,
              let total = manifest["totalBytes"] as? Int, total > 0, total <= 1024 * 1024 * 1024,
              let raw = manifest["files"] as? [[String: Any]], !raw.isEmpty, raw.count <= 10000 else { throw failure("Invalid manifest") }
        var files: [Entry] = []
        var paths = Set<String>()
        for file in raw {
            guard let path = file["path"] as? String,
                  path.range(of: "^assets/ceremonies/[A-Za-z0-9_./ -]+\\.(webp|png|jpg|jpeg|avif)$", options: .regularExpression) != nil,
                  !path.contains(".."), paths.insert(path).inserted,
                  let bytes = file["bytes"] as? Int, bytes > 0, bytes <= 64 * 1024 * 1024,
                  let hash = file["sha256"] as? String, hash.range(of: "^[a-f0-9]{64}$", options: .regularExpression) != nil else { throw failure("Invalid image entry") }
            files.append(Entry(path: path, bytes: bytes, sha256: hash))
        }
        guard files.reduce(0, { $0 + $1.bytes }) == total else { throw failure("Invalid media size") }
        return Plan(revision: revision, total: total, files: files)
    }
    private func root() throws -> URL {
        var url = try fm.url(for: .applicationSupportDirectory, in: .userDomainMask, appropriateFor: nil, create: true).appendingPathComponent("vip-cinematics", isDirectory: true)
        try fm.createDirectory(at: url, withIntermediateDirectories: true)
        var values = URLResourceValues()
        values.isExcludedFromBackup = true
        try url.setResourceValues(values)
        return url
    }
    private func digest(_ data: Data) -> String {
        SHA256.hash(data: data).map { String(format: "%02x", $0) }.joined()
    }
    private func cleanInterruptedDownloads() throws {
        for url in try fm.contentsOfDirectory(at: root(), includingPropertiesForKeys: nil) {
            if url.lastPathComponent.hasPrefix(".partial-") { try fm.removeItem(at: url) }
        }
    }
    private func inspect(_ plan: Plan) throws -> [String: Any] {
        let directory = try root().appendingPathComponent(plan.revision, isDirectory: true)
        guard fm.fileExists(atPath: directory.path) else { return ["installed": false] }
        var proof: [[String: Any]] = []
        for file in plan.files {
            let url = directory.appendingPathComponent(file.path)
            guard let data = try? Data(contentsOf: url), data.count == file.bytes, digest(data) == file.sha256 else { return ["installed": false] }
            proof.append(["path": file.path, "bytes": file.bytes, "sha256": file.sha256, "uri": url.absoluteString])
        }
        return ["installed": true, "files": proof]
    }
    @objc func inspect(_ call: CAPPluginCall) {
        work.async {
            do {
                if self.activeCall == nil { try self.cleanInterruptedDownloads() }
                call.resolve(try self.inspect(self.plan(call)))
            }
            catch { call.reject("Cinematic installation could not be checked", nil, error) }
        }
    }
    @objc func download(_ call: CAPPluginCall) {
        work.async {
            do {
                guard self.activeCall == nil else { throw self.failure("A download is already running") }
                let plan = try self.plan(call)
                let expected = "https://github.com/georgi-cole/bbmobilenew-source/releases/download/vip-cinematics-\(plan.revision)/vip-cinematics.pack"
                guard call.getString("url") == expected, let url = URL(string: expected) else { throw self.failure("Invalid download location") }
                let existing = try self.inspect(plan)
                if existing["installed"] as? Bool == true { call.resolve(existing); return }
                let storage = try self.fm.attributesOfFileSystem(forPath: self.root().path)
                guard let free = storage[.systemFreeSize] as? NSNumber, free.int64Value >= Int64(plan.total * 2 + 10 * 1024 * 1024) else { throw self.failure("Not enough storage") }
                self.activeCall = call
                self.activePlan = plan
                self.cancelled = false
                let queue = OperationQueue()
                queue.maxConcurrentOperationCount = 1
                queue.underlyingQueue = self.work
                let configuration = URLSessionConfiguration.default
                configuration.timeoutIntervalForRequest = 30
                configuration.timeoutIntervalForResource = 15 * 60
                self.session = URLSession(configuration: configuration, delegate: self, delegateQueue: queue)
                self.task = self.session?.downloadTask(with: url)
                self.task?.resume()
            } catch { call.reject("Cinematic download could not be started", nil, error) }
        }
    }
    public func urlSession(_ session: URLSession, downloadTask: URLSessionDownloadTask, didWriteData bytesWritten: Int64, totalBytesWritten: Int64, totalBytesExpectedToWrite: Int64) {
        guard let plan = activePlan else { return }
        if totalBytesWritten > Int64(plan.total) { cancelled = true; downloadTask.cancel(); return }
        notifyListeners("progress", data: ["bytes": totalBytesWritten, "verifying": false])
    }
    public func urlSession(_ session: URLSession, downloadTask: URLSessionDownloadTask, didFinishDownloadingTo location: URL) {
        guard let plan = activePlan, let call = activeCall else { return }
        var staging: URL?
        do {
            guard !cancelled, let response = downloadTask.response as? HTTPURLResponse, response.statusCode == 200 else { throw failure("Download unavailable") }
            let attributes = try fm.attributesOfItem(atPath: location.path)
            guard (attributes[.size] as? NSNumber)?.intValue == plan.total else { throw failure("Incomplete download") }
            notifyListeners("progress", data: ["bytes": plan.total, "verifying": true])
            let directory = try root().appendingPathComponent(".partial-\(UUID().uuidString)", isDirectory: true)
            staging = directory
            try fm.createDirectory(at: directory, withIntermediateDirectories: true)
            let input = try FileHandle(forReadingFrom: location)
            defer { try? input.close() }
            for file in plan.files {
                var data = Data()
                while data.count < file.bytes {
                    guard !cancelled, let chunk = try input.read(upToCount: min(65536, file.bytes - data.count)), !chunk.isEmpty else { throw failure("Incomplete image") }
                    data.append(chunk)
                }
                guard digest(data) == file.sha256 else { throw failure("Damaged image") }
                let output = directory.appendingPathComponent(file.path)
                try fm.createDirectory(at: output.deletingLastPathComponent(), withIntermediateDirectories: true)
                try data.write(to: output)
            }
            guard (try input.read(upToCount: 1))?.isEmpty != false else { throw failure("Unexpected media data") }
            let destination = try root().appendingPathComponent(plan.revision, isDirectory: true)
            if fm.fileExists(atPath: destination.path) { try fm.removeItem(at: destination) }
            try fm.moveItem(at: directory, to: destination)
            call.resolve(try inspect(plan))
        } catch { call.reject("Cinematic download could not be completed", nil, error) }
        if let staging = staging, fm.fileExists(atPath: staging.path) { try? fm.removeItem(at: staging) }
        finishSession()
    }
    public func urlSession(_ session: URLSession, task: URLSessionTask, didCompleteWithError error: Error?) {
        if let error = error, let call = activeCall { call.reject("Cinematic download interrupted", nil, error); finishSession() }
    }
    private func finishSession() {
        activeCall = nil
        activePlan = nil
        task = nil
        session?.finishTasksAndInvalidate()
        session = nil
    }
    @objc func cancel(_ call: CAPPluginCall) {
        work.async { self.cancelled = true; self.task?.cancel(); call.resolve() }
    }
    @objc func remove(_ call: CAPPluginCall) {
        work.async {
            do {
                guard self.activeCall == nil else { throw self.failure("A download is running") }
                let directory = try self.root().appendingPathComponent(self.plan(call).revision)
                if self.fm.fileExists(atPath: directory.path) { try self.fm.removeItem(at: directory) }
                call.resolve()
            } catch { call.reject("Cinematic download could not be removed", nil, error) }
        }
    }
}
