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
