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
        case cancelled
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
    private var isNetworkReachable = true
    private var runGeneration = 0
    private var pollingGeneration = 0

    init(
        operations: RootineSyncOperations,
        pollingInterval: Duration = .seconds(30),
        sleep: @escaping Sleep = { duration in
            try await Task.sleep(for: duration)
        },
        onStatus: StatusHandler? = nil
    ) {
        self.operations = operations
        self.pollingInterval = pollingInterval.bounded(
            minimum: .milliseconds(100),
            maximum: .seconds(300)
        )
        self.sleep = sleep
        self.onStatus = onStatus
        self.observability = .shared
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
        runGeneration += 1
        isStarted = true
        hasBeenStopped = false
        isForeground = true
        setStatus(.ready)
        startPollingIfNeeded()
    }

    func stop() {
        runGeneration += 1
        isStarted = false
        hasBeenStopped = true
        stopPolling()
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
        guard isStarted, !hasBeenStopped, isNetworkReachable else { return }
        guard pullTask == nil else {
            needsAnotherPullValue = true
            return
        }
        let generation = runGeneration
        let task = Task { [operations] in
            do {
                try await operations.pull()
                return OperationResult.success
            } catch is CancellationError {
                return OperationResult.cancelled
            } catch {
                return OperationResult.failure(String(describing: error))
            }
        }
        pullTask = task
        pullStartedAt = Date()
        setStatus(.syncing)
        Task { [weak self, task] in
            let result = await task.value
            await self?.finishPull(result, reason: reason, generation: generation)
        }
    }

    /// Pushes share the same lifecycle gate but remain independent from pull:
    /// at most one of each may be active, while a pull and push can overlap.
    func requestPush(reason: RootineSyncTrigger) {
        guard isStarted, !hasBeenStopped, isNetworkReachable else { return }
        guard pushTask == nil else {
            needsAnotherPush = true
            return
        }
        let generation = runGeneration
        let task = Task { [operations] in
            do {
                try await operations.push()
                return OperationResult.success
            } catch is CancellationError {
                return OperationResult.cancelled
            } catch {
                return OperationResult.failure(String(describing: error))
            }
        }
        pushTask = task
        pushStartedAt = Date()
        setStatus(.syncing)
        Task { [weak self, task] in
            let result = await task.value
            await self?.finishPush(result, reason: reason, generation: generation)
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
        guard isStarted, !hasBeenStopped, isNetworkReachable else { return false }
        requestSync(reason: reason)
        let currentPull = pullTask
        let currentPush = pushTask
        var succeeded = true
        if let currentPull {
            let result = await withTaskCancellationHandler(operation: {
                await currentPull.value
            }, onCancel: { [weak self] in
                Task { await self?.cancelInFlight() }
            })
            if case .success = result {} else { succeeded = false }
        }
        if let currentPush {
            let result = await withTaskCancellationHandler(operation: {
                await currentPush.value
            }, onCancel: { [weak self] in
                Task { await self?.cancelInFlight() }
            })
            if case .success = result {} else { succeeded = false }
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
            requestPush(reason: .background)
            pollWhileBackground = await operations.pendingPushCount() > 0
            if !pollWhileBackground {
                stopPolling()
            } else {
                startPollingIfNeeded()
            }
        }
    }

    func networkPathChanged(isReachable: Bool) {
        let wasReachable = self.isNetworkReachable
        self.isNetworkReachable = isReachable
        guard isReachable else {
            stopPolling()
            cancelInFlight()
            return
        }
        guard !wasReachable else { return }
        startPollingIfNeeded()
        if isForeground {
            requestSync(reason: .networkRecovery)
        } else {
            requestPush(reason: .networkRecovery)
        }
    }

    /// Cancels currently running work when iOS expires a background task or
    /// the owner is tearing down the runtime. The durable local queue remains
    /// intact and a later foreground/network event can retry it.
    func cancelInFlight() {
        runGeneration += 1
        needsAnotherPullValue = false
        needsAnotherPush = false
        let pullTask = self.pullTask
        let pushTask = self.pushTask
        self.pullTask = nil
        self.pushTask = nil
        pullTask?.cancel()
        pushTask?.cancel()
    }

    /// Background task expiration also ends the coordinator's best-effort
    /// polling loop. The next foreground or network recovery event recreates
    /// it when work is still pending.
    func cancelBackgroundWork() {
        stopPolling()
        cancelInFlight()
    }

    func pendingPushCount() async -> Int {
        await operations.pendingPushCount()
    }

    private func startPollingIfNeeded() {
        guard isStarted, isNetworkReachable, (isForeground || pollWhileBackground), pollingTask == nil else { return }
        pollingGeneration += 1
        let generation = pollingGeneration
        pollingTask = Task { [weak self] in
            await self?.pollingLoop(generation: generation)
        }
    }

    private func stopPolling() {
        pollingGeneration += 1
        pollingTask?.cancel()
        pollingTask = nil
    }

    private func finishPolling(generation: Int) {
        guard pollingGeneration == generation else { return }
        pollingTask = nil
    }

    private func pollingLoop(generation: Int) async {
        defer { finishPolling(generation: generation) }
        while !Task.isCancelled {
            do {
                try await sleep(pollingInterval)
            } catch {
                return
            }
            guard !Task.isCancelled, generation == pollingGeneration,
                  isStarted, isNetworkReachable,
                  (isForeground || pollWhileBackground) else { return }
            if isForeground {
                // Polling is also the recovery path for a launch that
                // happened offline: NWPathMonitor may not emit a false->true
                // transition when its first callback already reports an
                // available path. Retry pending writes together with the
                // authoritative pull.
                requestSync(reason: .polling)
            } else {
                requestPush(reason: .polling)
                if await operations.pendingPushCount() == 0 {
                    pollWhileBackground = false
                    return
                }
            }
        }
    }

    private func finishPull(_ result: OperationResult, reason: RootineSyncTrigger, generation: Int) {
        guard generation == runGeneration else { return }
        pullTask = nil
        guard !hasBeenStopped else { return }
        switch result {
        case .success:
            if pushTask == nil { setStatus(.ready) }
        case .failure:
            setStatus(.degraded)
        case .cancelled:
            if pushTask == nil { setStatus(.ready) }
        }
        if needsAnotherPullValue {
            needsAnotherPullValue = false
            requestPull(reason: reason)
        }
    }

    private func finishPush(_ result: OperationResult, reason: RootineSyncTrigger, generation: Int) {
        guard generation == runGeneration else { return }
        pushTask = nil
        guard !hasBeenStopped else { return }
        switch result {
        case .success:
            if pullTask == nil { setStatus(.ready) }
        case .failure:
            setStatus(.degraded)
        case .cancelled:
            if pullTask == nil { setStatus(.ready) }
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

private extension Duration {
    var timeInterval: TimeInterval {
        let components = components
        return TimeInterval(components.seconds)
            + TimeInterval(components.attoseconds) / 1_000_000_000_000_000_000
    }

    func bounded(minimum: Duration, maximum: Duration) -> Duration {
        let value = timeInterval
        let lower = minimum.timeInterval
        let upper = maximum.timeInterval
        guard value.isFinite else { return maximum }
        let bounded = Swift.max(lower, Swift.min(value, upper))
        return .milliseconds(Int64((bounded * 1_000).rounded(.up)))
    }
}
