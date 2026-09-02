import Foundation
import XCTest
@testable import Rootine

final class RootineRealtimeLifecycleTests: XCTestCase {
    func testSyncAvailableSignalIsMinimalAndCodable() throws {
        let signal = RootineSyncAvailableEvent(
            userID: "user-1",
            cursor: 1842,
            workspaceHint: "tasks"
        )
        let data = try JSONEncoder().encode(signal)
        let object = try XCTUnwrap(
            JSONSerialization.jsonObject(with: data) as? [String: Any]
        )

        XCTAssertEqual(object["type"] as? String, "rootine_sync_available")
        XCTAssertEqual(object["user_id"] as? String, "user-1")
        XCTAssertEqual(object["cursor"] as? Int, 1842)
        XCTAssertEqual(object["workspace_hint"] as? String, "tasks")
        XCTAssertNil(object["payload"])
        XCTAssertNil(object["record"])
    }

    func testCoordinatorCoalescesRealtimePullsWithoutStartingAnotherPush() async {
        let probe = SyncLifecycleProbe()
        let operations = RootineSyncOperations(
            pull: { @MainActor in await probe.pull() },
            push: { @MainActor in await probe.push() }
        )
        let coordinator = RootineSyncCoordinator(operations: operations)
        await coordinator.start()

        await coordinator.requestPull(reason: .realtime)
        await waitUntil { await probe.pullCount() == 1 }
        await coordinator.requestPull(reason: .realtime)
        let needsAnotherPull = await coordinator.needsAnotherPull
        let pushCount = await probe.pushCount()
        XCTAssertTrue(needsAnotherPull)
        XCTAssertEqual(pushCount, 0)

        await probe.releasePull()
        await waitUntil { await probe.pullCount() == 2 }
        let maxConcurrentPulls = await probe.maxConcurrentPulls()
        XCTAssertEqual(maxConcurrentPulls, 1)
        await coordinator.stop()
    }

    func testCoordinatorRunsOnlyOnePushAtATimeAndCoalescesFollowUp() async {
        let probe = SyncLifecycleProbe()
        let operations = RootineSyncOperations(
            pull: { @MainActor in await probe.pull() },
            push: { @MainActor in await probe.push() }
        )
        let coordinator = RootineSyncCoordinator(operations: operations)
        await coordinator.start()

        await coordinator.requestPush(reason: .localMutation)
        await waitUntil { await probe.pushCount() == 1 }
        await coordinator.requestPush(reason: .localMutation)
        await probe.releasePush()
        await waitUntil { await probe.pushCount() == 2 }
        let maxConcurrentPushes = await probe.maxConcurrentPushes()
        XCTAssertEqual(maxConcurrentPushes, 1)
        await coordinator.stop()
    }

    func testRealtimeConfigurationDefaultsToUserFilteredSupabaseChannel() {
        let configuration = RootineRealtimeConfiguration(
            supabaseURL: URL(string: "https://example.supabase.co"),
            publishableKey: "publishable",
            userID: "user-42",
            accessToken: "access"
        )

        XCTAssertEqual(configuration.topic, "realtime:rootine-sync:user-42")
        XCTAssertEqual(configuration.table, "rootine_sync_changes")
        XCTAssertEqual(configuration.reconnectDelays, [.seconds(1), .seconds(2), .seconds(5), .seconds(15), .seconds(30)])
    }

    func testRealtimeClientEmitsOnlyMatchingMinimalSignal() async throws {
        let matchingSignal = Data("{\"type\":\"rootine_sync_available\",\"user_id\":\"user-42\",\"cursor\":1842,\"workspace_hint\":\"tasks\"}".utf8)
        let otherUserSignal = Data("{\"type\":\"rootine_sync_available\",\"user_id\":\"other-user\",\"cursor\":1843}".utf8)
        let socket = ScriptedRealtimeSocket(messages: [matchingSignal, otherUserSignal])
        let received = expectation(description: "matching signal")
        let eventProbe = RealtimeEventProbe()
        let client = RootineRealtimeClient(
            configuration: RootineRealtimeConfiguration(
                supabaseURL: URL(string: "https://example.supabase.co"),
                publishableKey: "publishable",
                userID: "user-42",
                accessToken: "access"
            ),
            socketFactory: { request in
                socket.set(request: request)
                return socket
            },
            onEvent: { signal in
                if case .syncAvailable = signal {
                    await eventProbe.set(signal)
                    received.fulfill()
                }
            }
        )

        await client.start()
        await fulfillment(of: [received], timeout: 2)
        await client.stop()

        let event = await eventProbe.value()
        guard case .syncAvailable(let signal) = event else {
            return XCTFail("Expected one matching sync signal")
        }
        XCTAssertEqual(signal.userID, "user-42")
        XCTAssertEqual(signal.cursor, 1842)
        let request = try XCTUnwrap(socket.request())
        XCTAssertEqual(request.url?.scheme, "wss")
        let join = try XCTUnwrap(JSONSerialization.jsonObject(with: socket.sentMessages().first ?? Data()) as? [String: Any])
        let payload = try XCTUnwrap(join["payload"] as? [String: Any])
        let config = try XCTUnwrap(payload["config"] as? [String: Any])
        let changes = try XCTUnwrap(config["postgres_changes"] as? [[String: Any]])
        XCTAssertEqual(changes.first?["filter"] as? String, "user_id=eq.user-42")
    }

    func testRealtimeClientReportsSocketErrorAndUsesFirstReconnectBackoff() async {
        let reconnecting = expectation(description: "reconnect backoff")
        let statusProbe = RealtimeStatusProbe()
        let client = RootineRealtimeClient(
            configuration: RootineRealtimeConfiguration(
                supabaseURL: URL(string: "https://example.supabase.co"),
                publishableKey: "publishable",
                userID: "user-42",
                accessToken: "access",
                reconnectDelays: [.milliseconds(2), .milliseconds(4)],
                heartbeatInterval: .seconds(3_600)
            ),
            socketFactory: { _ in ImmediateFailureRealtimeSocket() },
            onStatus: { status in
                if case .reconnecting(attempt: 1, delay: let delay) = status {
                    await statusProbe.recordReconnectDelay(delay)
                    reconnecting.fulfill()
                }
            }
        )

        await client.start()
        await fulfillment(of: [reconnecting], timeout: 2)
        await client.stop()
        let delay = await statusProbe.reconnectDelay()
        XCTAssertEqual(delay ?? -1, 0.002, accuracy: 0.0001)
    }

    private func waitUntil(
        timeout: Duration = .seconds(2),
        condition: @escaping @Sendable () async -> Bool
    ) async {
        let deadline = ContinuousClock.now + timeout
        while !(await condition()), ContinuousClock.now < deadline {
            await Task.yield()
        }
    }
}

private actor RealtimeEventProbe {
    private var event: RootineRealtimeEvent?

    func set(_ event: RootineRealtimeEvent) {
        self.event = event
    }

    func value() -> RootineRealtimeEvent? {
        event
    }
}

private actor RealtimeStatusProbe {
    private var value: TimeInterval?

    func recordReconnectDelay(_ delay: TimeInterval) {
        value = delay
    }

    func reconnectDelay() -> TimeInterval? {
        value
    }
}

private final class ScriptedRealtimeSocket: RootineRealtimeSocket, @unchecked Sendable {
    private let lock = NSLock()
    private var incoming: [Data]
    private var outgoing: [Data] = []
    private var lastRequest: URLRequest?
    private var isCancelled = false

    init(messages: [Data]) {
        incoming = messages
    }

    func connect() async throws {}

    func send(_ message: Data) async throws {
        try appendOutgoing(message)
    }

    private func appendOutgoing(_ message: Data) throws {
        lock.lock()
        defer { lock.unlock() }
        guard !isCancelled else { throw RootineRealtimeSocketError.cancelled }
        outgoing.append(message)
    }

    func receive() async throws -> Data {
        try nextIncoming()
    }

    private func nextIncoming() throws -> Data {
        lock.lock()
        defer { lock.unlock() }
        guard !isCancelled else { throw RootineRealtimeSocketError.cancelled }
        guard !incoming.isEmpty else { throw RootineRealtimeSocketError.cancelled }
        return incoming.removeFirst()
    }

    func cancel() {
        lock.lock()
        isCancelled = true
        lock.unlock()
    }

    func set(request: URLRequest) {
        lock.lock()
        lastRequest = request
        lock.unlock()
    }

    func request() -> URLRequest? {
        lock.lock()
        defer { lock.unlock() }
        return lastRequest
    }

    func sentMessages() -> [Data] {
        lock.lock()
        defer { lock.unlock() }
        return outgoing
    }
}

private final class ImmediateFailureRealtimeSocket: RootineRealtimeSocket, @unchecked Sendable {
    func connect() async throws {}

    func send(_ message: Data) async throws {}

    func receive() async throws -> Data {
        throw RootineRealtimeSocketError.cancelled
    }

    func cancel() {}
}

private actor SyncLifecycleProbe {
    private var pullCalls = 0
    private var pushCalls = 0
    private var activePulls = 0
    private var activePushes = 0
    private var highestPulls = 0
    private var highestPushes = 0
    private var pullContinuation: CheckedContinuation<Void, Never>?
    private var pushContinuation: CheckedContinuation<Void, Never>?

    func pull() async {
        pullCalls += 1
        activePulls += 1
        highestPulls = max(highestPulls, activePulls)
        if pullCalls == 1 {
            await withCheckedContinuation { continuation in
                pullContinuation = continuation
            }
        }
        activePulls -= 1
    }

    func push() async {
        pushCalls += 1
        activePushes += 1
        highestPushes = max(highestPushes, activePushes)
        if pushCalls == 1 {
            await withCheckedContinuation { continuation in
                pushContinuation = continuation
            }
        }
        activePushes -= 1
    }

    func releasePull() {
        pullContinuation?.resume()
        pullContinuation = nil
    }

    func releasePush() {
        pushContinuation?.resume()
        pushContinuation = nil
    }

    func pullCount() -> Int { pullCalls }
    func pushCount() -> Int { pushCalls }
    func maxConcurrentPulls() -> Int { highestPulls }
    func maxConcurrentPushes() -> Int { highestPushes }
}
