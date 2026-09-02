import Foundation

enum RootineScenePhase: Sendable, Equatable {
    case active
    case inactive
    case background
}

enum RootineSyncTrigger: String, Sendable, Equatable {
    case bootstrap
    case localMutation
    case realtime
    case realtimeReconnect
    case foreground
    case networkRecovery
    case manual
    case background
    case polling
    case backgroundTask
}

enum RootineSyncCoordinatorStatus: Equatable, Sendable {
    case ready
    case syncing
    case degraded
    case stopped
}

/// Closure adapters are the seam for B05/B06. The current app supplies
/// WorkspaceSyncEngine-backed implementations; the normalized remote client
/// can replace these closures without changing lifecycle or Realtime code.
struct RootineSyncOperations: Sendable {
    let pull: @MainActor @Sendable () async throws -> Void
    let push: @MainActor @Sendable () async throws -> Void
    let pendingPushCount: @MainActor @Sendable () async -> Int

    init(
        pull: @escaping @MainActor @Sendable () async throws -> Void,
        push: @escaping @MainActor @Sendable () async throws -> Void,
        pendingPushCount: @escaping @MainActor @Sendable () async -> Int = { 0 }
    ) {
        self.pull = pull
        self.push = push
        self.pendingPushCount = pendingPushCount
    }
}

actor RootineSyncCoordinator {
    typealias Sleep = @Sendable (Duration) async throws -> Void
    typealias StatusHandler = @Sendable (RootineSyncCoordinatorStatus) async -> Void

    private enum OperationResult: Sendable {
        case success
        case failure(String)
    }

    private let operations: RootineSyncOperations
    private let pollingInterval: Duration
    private let sleep: Sleep
    private let onStatus: StatusHandler?
    private let observability: RootineObservability

    private var pullTask: Task<OperationResult, Never>?
    private var pushTask: Task<OperationResult, Never>?
    private var pullStartedAt: Date?
    private var pushStartedAt: Date?
    private var pollingTask: Task<Void, Never>?
    private var needsAnotherPullValue = false
    private var needsAnotherPush = false
    private var isStarted = false
    private var hasBeenStopped = false
    private var isForeground = true
    private var pollWhileBackground = false
    private var statusValue: RootineSyncCoordinatorStatus = .ready

    init(
        operations: RootineSyncOperations,
        pollingInterval: Duration = .seconds(30),
        sleep: @escaping Sleep = { duration in
            try await Task.sleep(for: duration)
        },
        onStatus: StatusHandler? = nil,
        observability: RootineObservability = .shared
    ) {
        self.operations = operations
        self.pollingInterval = pollingInterval
        self.sleep = sleep
        self.onStatus = onStatus
        self.observability = observability
    }

    var status: RootineSyncCoordinatorStatus {
        statusValue
    }

    var needsAnotherPull: Bool {
        needsAnotherPullValue
    }

    var isPullInFlight: Bool {
        pullTask != nil
    }

    var isPushInFlight: Bool {
        pushTask != nil
    }

    func start() {
        guard !isStarted else { return }
        isStarted = true
        hasBeenStopped = false
        isForeground = true
        setStatus(.ready)
        startPollingIfNeeded()
    }

    func stop() {
        isStarted = false
        hasBeenStopped = true
        pollingTask?.cancel()
        pollingTask = nil
        pullTask?.cancel()
        pushTask?.cancel()
        pullTask = nil
        pushTask = nil
        needsAnotherPullValue = false
        needsAnotherPush = false
        pollWhileBackground = false
        setStatus(.stopped)
    }

    /// Requests are deliberately non-blocking. If a pull is already active,
    /// one follow-up is coalesced in `needsAnotherPull` rather than starting a
    /// second read. This is important for bursts of Realtime events.
    func requestPull(reason: RootineSyncTrigger) {
        guard !hasBeenStopped else { return }
        guard pullTask == nil else {
            needsAnotherPullValue = true
            return
        }
        let task = Task { [operations] in
            do {
                try await operations.pull()
                return OperationResult.success
            } catch {
                return OperationResult.failure(String(describing: error))
            }
        }
        pullTask = task
        pullStartedAt = Date()
        setStatus(.syncing)
        Task { [weak self, task] in
            let result = await task.value
            await self?.finishPull(result, reason: reason)
        }
    }

    /// Pushes share the same lifecycle gate but remain independent from pull:
    /// at most one of each may be active, while a pull and push can overlap.
    func requestPush(reason: RootineSyncTrigger) {
        guard !hasBeenStopped else { return }
        guard pushTask == nil else {
            needsAnotherPush = true
            return
        }
        let task = Task { [operations] in
            do {
                try await operations.push()
                return OperationResult.success
            } catch {
                return OperationResult.failure(String(describing: error))
            }
        }
        pushTask = task
        pushStartedAt = Date()
        setStatus(.syncing)
        Task { [weak self, task] in
            let result = await task.value
            await self?.finishPush(result, reason: reason)
        }
    }

    func requestSync(reason: RootineSyncTrigger) {
        requestPull(reason: reason)
        requestPush(reason: reason)
    }

    /// Used by BGAppRefreshTask and the manual sync action when the caller
    /// needs to know that the currently coalesced work has finished. A newer
    /// event may still schedule one follow-up after these tasks complete.
    @discardableResult
    func syncNow(reason: RootineSyncTrigger) async -> Bool {
        requestSync(reason: reason)
        let currentPull = pullTask
        let currentPush = pushTask
        var succeeded = true
        if let currentPull {
            if case .failure = await currentPull.value { succeeded = false }
        }
        if let currentPush {
            if case .failure = await currentPush.value { succeeded = false }
        }
        return succeeded
    }

    func scenePhaseChanged(_ phase: RootineScenePhase) async {
        switch phase {
        case .active:
            isForeground = true
            pollWhileBackground = false
            startPollingIfNeeded()
            requestSync(reason: .foreground)
        case .inactive:
            // Keep the polling task alive for a short inactive transition;
            // SwiftUI commonly emits inactive immediately before active.
            isForeground = true
        case .background:
            isForeground = false
            // Best effort only. iOS may suspend this work at any point.
            requestSync(reason: .background)
            pollWhileBackground = await operations.pendingPushCount() > 0
            if !pollWhileBackground {
                pollingTask?.cancel()
                pollingTask = nil
            } else {
                startPollingIfNeeded()
            }
        }
    }

    func networkPathChanged(isReachable: Bool) {
        guard isReachable else { return }
        requestSync(reason: .networkRecovery)
    }

    func pendingPushCount() async -> Int {
        await operations.pendingPushCount()
    }

    private func startPollingIfNeeded() {
        guard isStarted, (isForeground || pollWhileBackground), pollingTask == nil else { return }
        pollingTask = Task { [weak self] in
            await self?.pollingLoop()
        }
    }

    private func pollingLoop() async {
        while !Task.isCancelled {
            do {
                try await sleep(pollingInterval)
            } catch {
                return
            }
            guard !Task.isCancelled, isStarted, (isForeground || pollWhileBackground) else { return }
            requestPull(reason: .polling)
        }
    }

    private func finishPull(_ result: OperationResult, reason: RootineSyncTrigger) {
        pullTask = nil
        let (outcome, error): (RootineTelemetryOutcome, String?) = switch result {
        case .success: (.success, nil)
        case let .failure(message): (.failure, message)
        }
        observability.recordSync(
            endpoint: "pull",
            outcome: outcome,
            duration: pullStartedAt.map { Date().timeIntervalSince($0) },
            trigger: reason.rawValue,
            error: error
        )
        pullStartedAt = nil
        guard !hasBeenStopped else { return }
        switch result {
        case .success:
            if pushTask == nil { setStatus(.ready) }
        case .failure:
            setStatus(.degraded)
        }
        if needsAnotherPullValue {
            needsAnotherPullValue = false
            requestPull(reason: reason)
        }
    }

    private func finishPush(_ result: OperationResult, reason: RootineSyncTrigger) {
        pushTask = nil
        let (outcome, error): (RootineTelemetryOutcome, String?) = switch result {
        case .success: (.success, nil)
        case let .failure(message): (.failure, message)
        }
        observability.recordSync(
            endpoint: "push",
            outcome: outcome,
            duration: pushStartedAt.map { Date().timeIntervalSince($0) },
            trigger: reason.rawValue,
            error: error
        )
        pushStartedAt = nil
        guard !hasBeenStopped else { return }
        switch result {
        case .success:
            if pullTask == nil { setStatus(.ready) }
        case .failure:
            setStatus(.degraded)
        }
        if needsAnotherPush {
            needsAnotherPush = false
            requestPush(reason: reason)
        }
    }

    private func setStatus(_ status: RootineSyncCoordinatorStatus) {
        statusValue = status
        guard let onStatus else { return }
        Task { await onStatus(status) }
    }
}
