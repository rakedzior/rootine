import AuthenticationServices
import Combine
import CryptoKit
import Foundation
import Security
import UIKit

enum AuthInputValidator {
    static func normalizedEmail(_ value: String) -> String {
        value.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
    }

    static func isValidEmail(_ value: String) -> Bool {
        let email = normalizedEmail(value)
        let parts = email.split(separator: "@", omittingEmptySubsequences: false)
        guard parts.count == 2,
              !parts[0].isEmpty,
              !parts[0].hasPrefix("."),
              !parts[0].hasSuffix("."),
              !parts[0].contains(".."),
              parts[1].contains("."),
              !parts[1].hasPrefix("."),
              !parts[1].hasSuffix("."),
              !parts[1].contains(".."),
              !email.contains(where: { $0.isWhitespace }) else { return false }
        return true
    }

    static func passwordError(_ value: String) -> String? {
        value.count >= 8 ? nil : "Hasło musi mieć co najmniej 8 znaków."
    }
}

/// Safe, payload-free destinations accepted by the native app. Authentication
/// callbacks are represented without their URL so access and refresh tokens
/// can never be retained in navigation state, logs, or view diagnostics.
enum RootineDeepLinkTab: String, Equatable, Sendable {
    case today
    case tasks
    case calendar
    case nutrition
}

enum RootineDeepLink: Equatable, Sendable {
    case authCallback
    case today
    case tasks(taskID: Int?)
    case calendar
    case reminder(entity: RootineNotificationEntity, entityID: String?)
    case nutrition
    case nutritionProduct(identifier: String)
    case nutritionBarcode(code: String)

    var tab: RootineDeepLinkTab {
        switch self {
        case .authCallback, .today: return .today
        case .tasks: return .tasks
        case .calendar: return .calendar
        case .reminder: return .tasks
        case .nutrition, .nutritionProduct, .nutritionBarcode: return .nutrition
        }
    }

    /// Parses both the private `rootine://` scheme and a configured HTTPS
    /// universal-link host. Only known routes and bounded identifiers are
    /// accepted; query/fragment contents are intentionally ignored.
    static func parse(_ url: URL, configuration: RootineConfiguration) -> RootineDeepLink? {
        guard let scheme = url.scheme?.lowercased() else { return nil }
        let callbackScheme = configuration.authCallbackScheme.lowercased()
        if scheme == callbackScheme, url.host?.lowercased() == "auth-callback" {
            return .authCallback
        }

        let segments = pathSegments(url.path)
        let route: [String]
        if scheme == "https" {
            guard let expectedHost = configuration.backendURL?.host?.lowercased(),
                  url.host?.lowercased() == expectedHost else { return nil }
            route = segments
        } else {
            guard scheme == callbackScheme else { return nil }
            route = [url.host].compactMap { $0 } + segments
        }

        guard let first = route.first?.lowercased() else { return nil }
        switch first {
        case "today", "dzisiaj":
            return .today
        case "calendar", "kalendarz":
            return .calendar
        case "tasks", "task", "zadania":
            guard route.count <= 2 else { return nil }
            guard route.count == 1 else {
                guard let id = positiveInteger(route[1]) else { return nil }
                return .tasks(taskID: id)
            }
            return .tasks(taskID: nil)
        case "reminder", "reminders", "przypomnienie", "przypomnienia":
            guard route.count <= 3 else { return nil }
            guard route.count > 1,
                  let entity = notificationEntity(route[1]) else { return nil }
            let entityID = route.count == 3 ? boundedIdentifier(route[2]) : nil
            guard route.count < 3 || entityID != nil else { return nil }
            return .reminder(entity: entity, entityID: entityID)
        case "nutrition", "odzywianie":
            guard route.count <= 3 else { return nil }
            guard route.count > 1 else { return .nutrition }
            switch route[1].lowercased() {
            case "product", "produkt":
                guard route.count == 3, let identifier = boundedIdentifier(route[2]) else { return nil }
                return .nutritionProduct(identifier: identifier)
            case "barcode", "kod":
                guard route.count == 3, let code = boundedIdentifier(route[2]) else { return nil }
                return .nutritionBarcode(code: code)
            default:
                return nil
            }
        default:
            return nil
        }
    }

    /// Converts the metadata emitted by local notifications into the same
    /// destination contract as URL deep links. Unknown or malformed payloads
    /// are ignored rather than opening a broad module surface.
    static func fromNotificationUserInfo(_ userInfo: [AnyHashable: Any]) -> RootineDeepLink? {
        guard let version = userInfo["rootine_schema_version"] as? Int, version == 1,
              let rawEntity = userInfo["rootine_entity"] as? String,
              let entity = notificationEntity(rawEntity),
              let rawID = userInfo["rootine_entity_id"] as? String,
              let entityID = boundedIdentifier(rawID) else { return nil }
        return .reminder(entity: entity, entityID: entityID)
    }

    private static func pathSegments(_ path: String) -> [String] {
        path.split(separator: "/", omittingEmptySubsequences: true).compactMap {
            let value = String($0).removingPercentEncoding ?? String($0)
            return boundedIdentifier(value)
        }
    }

    private static func boundedIdentifier(_ value: String) -> String? {
        let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty,
              trimmed.count <= 256,
              !trimmed.contains(where: { $0.isWhitespace || $0.isNewline }),
              !trimmed.unicodeScalars.contains(where: { scalar in
                  scalar.value < 0x20 || (0x7F...0x9F).contains(scalar.value)
              }) else { return nil }
        return trimmed
    }

    private static func positiveInteger(_ value: String) -> Int? {
        guard let number = Int(value), number > 0 else { return nil }
        return number
    }

    private static func notificationEntity(_ value: String) -> RootineNotificationEntity? {
        switch value.lowercased() {
        case "task", "tasks", "zadanie", "zadania": return .task
        case "habit", "habits", "nawyk", "nawyki": return .habit
        default: return nil
        }
    }
}

enum AuthNonce {
    static func random(length: Int = 32) throws -> String {
        guard length > 0 else { throw RootineAPIError.invalidResponse }
        let characters = Array("0123456789ABCDEFGHIJKLMNOPQRSTUVXYZabcdefghijklmnopqrstuvwxyz-._")
        var result = ""
        var remaining = length

        while remaining > 0 {
            var bytes = [UInt8](repeating: 0, count: 16)
            guard SecRandomCopyBytes(kSecRandomDefault, bytes.count, &bytes) == errSecSuccess else {
                throw RootineAPIError.invalidResponse
            }
            for byte in bytes where remaining > 0 {
                guard Int(byte) < characters.count else { continue }
                result.append(characters[Int(byte)])
                remaining -= 1
            }
        }
        return result
    }

    static func hashed(_ value: String) -> String {
        SHA256.hash(data: Data(value.utf8)).map { String(format: "%02x", $0) }.joined()
    }
}

enum AuthProtocolValidator {
    /// Apple signs the identity token and Supabase verifies its signature. The
    /// client still validates the protocol envelope before sending a bearer
    /// token onward, so malformed, wrong-audience, expired, or
    /// nonce-mismatched credentials never reach the account API. Replay
    /// prevention remains the responsibility of Apple's nonce and Supabase's
    /// server-side token verification; this validator intentionally does not
    /// claim to verify the Apple signing key locally.
    static func validateAppleIdentityToken(
        _ token: String,
        rawNonce: String,
        expectedAudience: String?,
        now: Date = Date()
    ) throws {
        guard !rawNonce.isEmpty else { throw RootineAPIError.invalidResponse }
        let parts = token.split(separator: ".", omittingEmptySubsequences: false)
        guard parts.count == 3,
              parts.allSatisfy({ !$0.isEmpty }),
              decodeBase64URL(String(parts[2])) != nil,
              let header = decodeJSONObject(String(parts[0])),
              let payload = decodeJSONObject(String(parts[1])) else {
            throw RootineAPIError.invalidResponse
        }

        guard header["alg"] as? String == "RS256",
              (payload["iss"] as? String) == "https://appleid.apple.com",
              let subject = payload["sub"] as? String,
              !subject.isEmpty,
              let nonce = payload["nonce"] as? String,
              nonce == AuthNonce.hashed(rawNonce),
              let expiration = payload["exp"] as? NSNumber,
              expiration.doubleValue > now.timeIntervalSince1970 else {
            throw RootineAPIError.invalidResponse
        }

        if let expectedAudience, !expectedAudience.isEmpty {
            let audienceMatches: Bool
            if let audience = payload["aud"] as? String {
                audienceMatches = audience == expectedAudience
            } else if let audiences = payload["aud"] as? [String] {
                audienceMatches = audiences.contains(expectedAudience)
            } else {
                audienceMatches = false
            }
            guard audienceMatches else { throw RootineAPIError.invalidResponse }
        }
    }

    private static func decodeJSONObject(_ value: String) -> [String: Any]? {
        guard let data = decodeBase64URL(value),
              let object = try? JSONSerialization.jsonObject(with: data),
              let dictionary = object as? [String: Any] else { return nil }
        return dictionary
    }

    private static func decodeBase64URL(_ value: String) -> Data? {
        var encoded = value.replacingOccurrences(of: "-", with: "+")
            .replacingOccurrences(of: "_", with: "/")
        encoded += String(repeating: "=", count: (4 - encoded.count % 4) % 4)
        return Data(base64Encoded: encoded)
    }
}

@MainActor
final class OAuthWebSession: NSObject, ObservableObject, ASWebAuthenticationPresentationContextProviding {
    private var activeSession: ASWebAuthenticationSession?

    func start(url: URL, callbackScheme: String) async throws -> URL {
        guard activeSession == nil else { throw RootineAPIError.invalidResponse }

        return try await withTaskCancellationHandler {
            try await withCheckedThrowingContinuation { continuation in
                let session = ASWebAuthenticationSession(
                    url: url,
                    callbackURLScheme: callbackScheme
                ) { [weak self] callbackURL, error in
                    Task { @MainActor in
                        self?.activeSession = nil
                        if let authError = error as? ASWebAuthenticationSessionError,
                           authError.code == .canceledLogin {
                            continuation.resume(throwing: RootineAPIError.cancelled)
                        } else if error != nil {
                            continuation.resume(throwing: RootineAPIError.providerUnavailable)
                        } else if let callbackURL {
                            continuation.resume(returning: callbackURL)
                        } else {
                            continuation.resume(throwing: RootineAPIError.invalidResponse)
                        }
                    }
                }
                session.presentationContextProvider = self
                session.prefersEphemeralWebBrowserSession = false
                activeSession = session
                guard session.start() else {
                    activeSession = nil
                    continuation.resume(throwing: RootineAPIError.providerUnavailable)
                    return
                }
            }
        } onCancel: {
            Task { @MainActor [weak self] in
                self?.activeSession?.cancel()
            }
        }
    }

    func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
        let scenes = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }
        guard let scene = scenes.first(where: { $0.activationState == .foregroundActive }) ?? scenes.first else {
            // Authentication can be requested while the app is transitioning
            // between scenes. Returning a detached anchor lets the system
            // finish the request without crashing the process; the session
            // callback will surface the provider error to the caller.
            return UIWindow(frame: .zero)
        }
        return ASPresentationAnchor(windowScene: scene)
    }
}
