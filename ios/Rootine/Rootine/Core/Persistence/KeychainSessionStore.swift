import Foundation
import Security

protocol RootineSessionStore {
    func load() -> SupabaseSession?
    func save(_ session: SupabaseSession) throws
    func clear()
}

final class KeychainSessionStore: RootineSessionStore {
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
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne
        ]
        var result: CFTypeRef?
        guard SecItemCopyMatching(query as CFDictionary, &result) == errSecSuccess,
              let data = result as? Data else { return nil }
        do {
            let session = try JSONDecoder().decode(SupabaseSession.self, from: data)
            guard session.isValid else { throw RootineAPIError.invalidResponse }
            return session
        } catch {
            // A corrupt or legacy blob must not remain in Keychain and be
            // retried on every launch. Clearing only this exact service/account
            // pair keeps other app secrets untouched.
            clear()
            return nil
        }
    }

    func save(_ session: SupabaseSession) throws {
        guard session.isValid else { throw RootineAPIError.invalidResponse }
        let data = try JSONEncoder().encode(session)
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account
        ]
        let attributes: [String: Any] = [
            kSecValueData as String: data,
            kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly,
            kSecAttrSynchronizable as String: kCFBooleanFalse as Any
        ]
        let status = SecItemUpdate(query as CFDictionary, attributes as CFDictionary)
        if status == errSecItemNotFound {
            var insertion = query
            attributes.forEach { insertion[$0.key] = $0.value }
            guard SecItemAdd(insertion as CFDictionary, nil) == errSecSuccess else {
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
            kSecAttrAccount as String: account
        ]
        SecItemDelete(query as CFDictionary)
    }
}
