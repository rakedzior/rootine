import Foundation

/// A clock is a deliberately tiny dependency boundary. Production uses the
/// wall clock, while contract and lifecycle tests can freeze time without
/// mutating the process-wide calendar or timezone.
protocol RootineClock: Sendable {
    var now: Date { get }
}

struct SystemRootineClock: RootineClock, Sendable {
    var now: Date { Date() }
}

struct FixedRootineClock: RootineClock, Sendable {
    let now: Date

    init(_ now: Date) {
        self.now = now
    }
}

/// The settings that affect local-day interpretation are kept together so a
/// profile can later provide them as one validated value. The default is the
/// current device configuration; no language, currency, or timezone is
/// silently forced by the native client.
struct RootineLocaleSettings: Codable, Equatable, Sendable {
    var localeIdentifier: String
    var timezoneIdentifier: String
    var calendarIdentifier: Calendar.Identifier
    var currencyCode: String?
    var usesMetricSystem: Bool

    init(
        localeIdentifier: String = Locale.autoupdatingCurrent.identifier,
        timezoneIdentifier: String = TimeZone.autoupdatingCurrent.identifier,
        calendarIdentifier: Calendar.Identifier = Calendar.autoupdatingCurrent.identifier,
        currencyCode: String? = Locale.autoupdatingCurrent.currency?.identifier,
        usesMetricSystem: Bool = Locale.autoupdatingCurrent.measurementSystem == .metric
    ) {
        self.localeIdentifier = localeIdentifier
        self.timezoneIdentifier = timezoneIdentifier
        self.calendarIdentifier = calendarIdentifier
        self.currencyCode = currencyCode
        self.usesMetricSystem = usesMetricSystem
    }

    static var device: RootineLocaleSettings { RootineLocaleSettings() }

    var locale: Locale {
        Locale(identifier: localeIdentifier)
    }

    var timeZone: TimeZone {
        TimeZone(identifier: timezoneIdentifier) ?? .autoupdatingCurrent
    }

    var calendar: Calendar {
        var calendar = Calendar(identifier: calendarIdentifier)
        calendar.locale = locale
        calendar.timeZone = timeZone
        return calendar
    }
}

enum RootineEnvironment: String, Codable, CaseIterable, Sendable {
    case development
    case staging
    case production
}
enum RootineFeatureFlag: String, Codable, CaseIterable, Hashable, Sendable {
    case normalizedSyncEnabled = "normalized_sync_enabled"
    case normalizedReadEnabled = "normalized_read_enabled"
    case notificationsEnabled = "notifications_enabled"
}

enum RootineFeatureFlagSource: String, Codable, Sendable {
    case account
    case environment
    case bundle
    case `default`
}

struct RootineFeatureFlagValue: Codable, Equatable, Sendable {
    var enabled: Bool
    var source: RootineFeatureFlagSource
}

/// Deployment configuration is a safe local default only. A server response
/// with account/environment sources must replace it before a normalized path is
/// used; no user ID or remote flag is accepted from a client request body.
struct RootineFeatureFlags: Codable, Equatable, Sendable {
    var environment: RootineEnvironment
    var values: [RootineFeatureFlag: RootineFeatureFlagValue]

    init(
        environment: RootineEnvironment = .development,
        values: [RootineFeatureFlag: RootineFeatureFlagValue] = RootineFeatureFlags.disabledValues
    ) {
        self.environment = environment
        self.values = values
    }

    static let disabled = RootineFeatureFlags()

    static var disabledValues: [RootineFeatureFlag: RootineFeatureFlagValue] {
        Dictionary(uniqueKeysWithValues: RootineFeatureFlag.allCases.map {
            ($0, RootineFeatureFlagValue(enabled: false, source: .default))
        })
    }

    func isEnabled(_ flag: RootineFeatureFlag) -> Bool {
        values[flag]?.enabled == true
    }

    func value(for flag: RootineFeatureFlag) -> RootineFeatureFlagValue {
        values[flag] ?? RootineFeatureFlagValue(enabled: false, source: .default)
    }

    static func fromBundle(_ bundle: Bundle = .main) -> RootineFeatureFlags {
        func string(_ key: String) -> String {
            (bundle.object(forInfoDictionaryKey: key) as? String)?
                .trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        }
        func boolean(_ key: String) -> Bool {
            ["1", "true", "yes", "on"].contains(string(key).lowercased())
        }
        let environment = RootineEnvironment(rawValue: string("ROOTINE_ENVIRONMENT")) ?? .development
        let configured: [(RootineFeatureFlag, String)] = [
            (.normalizedSyncEnabled, "ROOTINE_NORMALIZED_SYNC_ENABLED"),
            (.normalizedReadEnabled, "ROOTINE_NORMALIZED_READ_ENABLED"),
            (.notificationsEnabled, "ROOTINE_NOTIFICATIONS_ENABLED")
        ]
        let values = Dictionary(uniqueKeysWithValues: configured.map { flag, key in
            (
                flag,
                RootineFeatureFlagValue(
                    enabled: boolean(key),
                    source: string(key).isEmpty ? .default : .bundle
                )
            )
        })
        return RootineFeatureFlags(environment: environment, values: values)
    }
}
