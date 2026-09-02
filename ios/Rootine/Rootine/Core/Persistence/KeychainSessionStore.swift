import Foundation
import Security

final class KeychainSessionStore {
    private let service: String
    private let account = "supabase-session"

    init(bundleIdentifier: String = Bundle.main.bundleIdentifier ?? "app.rootine.ios") {
        service = "\(bundleIdentifier).auth"
    }

    func load() -> SupabaseSession? {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
            kSecAttrSynchronizable as String: kCFBooleanFalse as Any,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne
        ]
        var result: CFTypeRef?
        guard SecItemCopyMatching(query as CFDictionary, &result) == errSecSuccess,
              let data = result as? Data else { return nil }
        do {
            let session = try JSONDecoder().decode(SupabaseSession.self, from: data)
            guard Self.isUsable(session) else { throw RootineAPIError.invalidResponse }
            return session
        } catch {
            // A stale/corrupt session must not be retried forever at launch.
            // Tokens are secrets, so discard the Keychain item rather than
            // copying its bytes into a diagnostic/recovery file.
            clear()
            return nil
        }
    }

    func save(_ session: SupabaseSession) throws {
        guard Self.isUsable(session) else { throw RootineAPIError.invalidResponse }
        let data = try JSONEncoder().encode(session)
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
            kSecAttrSynchronizable as String: kCFBooleanFalse as Any
        ]
        let attributes: [String: Any] = [
            kSecValueData as String: data,
            kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        ]
        let status = SecItemUpdate(query as CFDictionary, attributes as CFDictionary)
        if status == errSecItemNotFound {
            var insertion = query
            attributes.forEach { insertion[$0.key] = $0.value }
            let addStatus = SecItemAdd(insertion as CFDictionary, nil)
            guard addStatus == errSecSuccess || addStatus == errSecDuplicateItem else {
                throw RootineAPIError.invalidResponse
            }
            if addStatus == errSecDuplicateItem,
               SecItemUpdate(query as CFDictionary, attributes as CFDictionary) != errSecSuccess {
                throw RootineAPIError.invalidResponse
            }
        } else if status != errSecSuccess {
            throw RootineAPIError.invalidResponse
        }
    }

    func clear() {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
            kSecAttrSynchronizable as String: kCFBooleanFalse as Any
        ]
        SecItemDelete(query as CFDictionary)
    }

    static func isUsable(_ session: SupabaseSession) -> Bool {
        !session.accessToken.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            && !session.refreshToken.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            && !session.user.id.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            && !session.tokenType.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            && session.expiresIn >= 0
    }
}
