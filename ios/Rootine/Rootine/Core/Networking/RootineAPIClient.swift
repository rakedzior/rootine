import Foundation

struct RootineConfiguration: Equatable, Sendable {
    var supabaseURL: URL?
    var supabasePublishableKey: String
    var backendURL: URL?
    var authCallbackScheme: String
    /// The native bundle identifier used as Apple's `aud` claim. It is kept
    /// separate from the Supabase URL so tests can inject a deterministic
    /// audience without touching signing configuration.
    var appleClientID: String = Bundle.main.bundleIdentifier ?? "app.rootine.ios"
    var termsURL: URL?
    var privacyURL: URL?
    var appVersion: String = ""
    var apnsEnvironment: RootineAPNsEnvironment = .currentBuild
    /// B01/B08 rollout namespace. Keeping it in the configuration makes a
    /// flag written for staging impossible to accidentally enable production.
    var environment: String = "production"

    var isAuthComplete: Bool {
        supabaseURL != nil && !supabasePublishableKey.isEmpty && !authCallbackScheme.isEmpty
    }

    var isComplete: Bool {
        isAuthComplete && backendURL != nil
    }

    var hasLegalDocuments: Bool {
        termsURL != nil && privacyURL != nil
    }

    var authCallbackURL: URL? {
        URL(string: "\(authCallbackScheme)://auth-callback")
    }

    static func fromBundle(_ bundle: Bundle = .main) -> RootineConfiguration {
        func value(_ key: String) -> String {
            (bundle.object(forInfoDictionaryKey: key) as? String)?
                .trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        }
        func url(_ key: String) -> URL? {
            let rawValue = value(key)
            guard !rawValue.isEmpty,
                  let url = URL(string: rawValue),
                  ["http", "https"].contains(url.scheme?.lowercased() ?? ""),
                  url.host != nil else { return nil }
            return url
        }
        let configuredAppleClientID = value("PRODUCT_BUNDLE_IDENTIFIER")
        return RootineConfiguration(
            supabaseURL: url("ROOTINE_SUPABASE_URL"),
            supabasePublishableKey: value("ROOTINE_SUPABASE_PUBLISHABLE_KEY"),
            backendURL: url("ROOTINE_BACKEND_URL"),
            authCallbackScheme: value("ROOTINE_AUTH_CALLBACK_SCHEME"),
            appleClientID: configuredAppleClientID.isEmpty
                ? (bundle.bundleIdentifier ?? "app.rootine.ios")
                : configuredAppleClientID,
            termsURL: url("ROOTINE_TERMS_URL"),
            privacyURL: url("ROOTINE_PRIVACY_URL"),
            appVersion: value("CFBundleShortVersionString").isEmpty
                ? value("CFBundleVersion")
                : value("CFBundleShortVersionString"),
            apnsEnvironment: RootineAPNsEnvironment(
                rawValue: value("ROOTINE_APNS_ENVIRONMENT").lowercased()
            ) ?? .currentBuild,
            environment: value("ROOTINE_ENVIRONMENT").isEmpty ? "production" : value("ROOTINE_ENVIRONMENT")
        )
    }
}

/// Authenticated requests use an isolated, cookie-free session and never
/// enter the process-wide URL cache.
enum RootineSecureURLSession {
    static func make() -> URLSession {
        let configuration = URLSessionConfiguration.ephemeral
        configuration.urlCache = nil
        configuration.httpCookieStorage = nil
        configuration.requestCachePolicy = .reloadIgnoringLocalCacheData
        return URLSession(configuration: configuration)
    }
}

struct SupabaseIdentity: Codable, Equatable, Sendable {
    var identityID: String
    var provider: String
    var identityData: [String: JSONValue]?
    var createdAt: String?
    var lastSignInAt: String?

    init(
        identityID: String,
        provider: String,
        identityData: [String: JSONValue]? = nil,
        createdAt: String? = nil,
        lastSignInAt: String? = nil
    ) {
        self.identityID = identityID
        self.provider = provider
        self.identityData = identityData
        self.createdAt = createdAt
        self.lastSignInAt = lastSignInAt
    }

    enum CodingKeys: String, CodingKey {
        case identityID = "identity_id"
        case legacyID = "id"
        case provider
        case identityData = "identity_data"
        case createdAt = "created_at"
        case lastSignInAt = "last_sign_in_at"
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        identityID = try container.decodeIfPresent(String.self, forKey: .identityID)
            ?? container.decode(String.self, forKey: .legacyID)
        provider = try container.decode(String.self, forKey: .provider)
        identityData = try container.decodeIfPresent([String: JSONValue].self, forKey: .identityData)
        createdAt = try container.decodeIfPresent(String.self, forKey: .createdAt)
        lastSignInAt = try container.decodeIfPresent(String.self, forKey: .lastSignInAt)
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(identityID, forKey: .identityID)
        try container.encode(provider, forKey: .provider)
        try container.encodeIfPresent(identityData, forKey: .identityData)
        try container.encodeIfPresent(createdAt, forKey: .createdAt)
        try container.encodeIfPresent(lastSignInAt, forKey: .lastSignInAt)
    }
}

enum RootineIdentityProvider: String, Codable, CaseIterable, Sendable {
    case email
    case google
    case apple

    var title: String { rawValue == "email" ? "E-mail" : rawValue.capitalized }
}

struct SupabaseUser: Codable, Equatable, Sendable {
    var id: String
    var email: String?
    var emailConfirmedAt: String?
    var userMetadata: [String: JSONValue]?
    var appMetadata: [String: JSONValue]?
    var identities: [SupabaseIdentity]?

    init(
        id: String,
        email: String?,
        emailConfirmedAt: String? = nil,
        userMetadata: [String: JSONValue]? = nil,
        appMetadata: [String: JSONValue]? = nil,
        identities: [SupabaseIdentity]? = nil
    ) {
        self.id = id
        self.email = email
        self.emailConfirmedAt = emailConfirmedAt
        self.userMetadata = userMetadata
        self.appMetadata = appMetadata
        self.identities = identities
    }

    var linkedProviders: Set<RootineIdentityProvider> {
        Set((identities ?? []).compactMap { RootineIdentityProvider(rawValue: $0.provider.lowercased()) })
    }

    var isEmailConfirmed: Bool {
        emailConfirmedAt != nil || linkedProviders.contains(.email)
    }

    enum CodingKeys: String, CodingKey {
        case id
        case email
        case emailConfirmedAt = "email_confirmed_at"
        case userMetadata = "user_metadata"
        case appMetadata = "app_metadata"
        case identities
    }
}

struct RootineAccountState: Equatable, Sendable {
    var userID: String
    var email: String?
    var isEmailConfirmed: Bool
    var linkedProviders: Set<RootineIdentityProvider>

    init(user: SupabaseUser) {
        userID = user.id
        email = user.email
        isEmailConfirmed = user.isEmailConfirmed
        linkedProviders = user.linkedProviders
    }
}

struct SupabaseSession: Codable, Equatable, Sendable {
    var accessToken: String
    var refreshToken: String
    var expiresIn: Int
    var expiresAt: Int?
    var tokenType: String
    var user: SupabaseUser

    var isValid: Bool {
        !accessToken.isEmpty
            && !refreshToken.isEmpty
            && expiresIn > 0
            && !tokenType.isEmpty
            && !user.id.isEmpty
    }

    func validated() throws -> SupabaseSession {
        guard isValid else { throw RootineAPIError.invalidResponse }
        return self
    }

    var shouldRefresh: Bool {
        guard let expiresAt else { return false }
        return Date().timeIntervalSince1970 >= Double(expiresAt - 60)
    }

    enum CodingKeys: String, CodingKey {
        case accessToken = "access_token"
        case refreshToken = "refresh_token"
        case expiresIn = "expires_in"
        case expiresAt = "expires_at"
        case tokenType = "token_type"
        case user
    }
}

enum EmailRegistrationResult: Equatable, Sendable {
    case session(SupabaseSession)
    case needsEmailConfirmation
}

struct AuthCallbackResult: Equatable, Sendable {
    var session: SupabaseSession
    var isPasswordRecovery: Bool
}

struct SupabaseAuthCallback: Equatable, Sendable {
    var accessToken: String
    var refreshToken: String
    var expiresIn: Int
    var expiresAt: Int?
    var tokenType: String
    var isPasswordRecovery: Bool

    static func parse(
        _ url: URL,
        expectedScheme: String? = nil,
        expectedHost: String? = "auth-callback",
        now: Date = Date()
    ) throws -> SupabaseAuthCallback {
        let components = URLComponents(url: url, resolvingAgainstBaseURL: false)
        if let expectedScheme,
           url.scheme?.caseInsensitiveCompare(expectedScheme) != .orderedSame {
            throw RootineAPIError.invalidResponse
        }
        if let expectedHost,
           url.host?.caseInsensitiveCompare(expectedHost) != .orderedSame {
            throw RootineAPIError.invalidResponse
        }

        var parameters: [String: String] = [:]
        components?.queryItems?.forEach { parameters[$0.name] = $0.value }

        if let fragment = components?.fragment,
           let fragmentComponents = URLComponents(string: "rootine://callback?\(fragment)") {
            fragmentComponents.queryItems?.forEach { parameters[$0.name] = $0.value }
        }

        if let error = parameters["error_description"] ?? parameters["error"] {
            let normalized = error.lowercased()
            if normalized.contains("identity_already_exists") {
                throw RootineAPIError.identityAlreadyExists
            }
            if normalized.contains("identity_not_found") {
                throw RootineAPIError.identityNotFound
            }
            if normalized.contains("single_identity_not_deletable") {
                throw RootineAPIError.lastIdentityNotDeletable
            }
            if normalized.contains("cancel") || normalized.contains("denied") || normalized.contains("access_denied") {
                throw RootineAPIError.cancelled
            }
            throw RootineAPIError.providerUnavailable
        }

        guard let accessToken = parameters["access_token"]?.trimmingCharacters(in: .whitespacesAndNewlines),
              let refreshToken = parameters["refresh_token"]?.trimmingCharacters(in: .whitespacesAndNewlines),
              !accessToken.isEmpty,
              !refreshToken.isEmpty,
              !accessToken.contains(where: { $0.isNewline || $0.isWhitespace }),
              !refreshToken.contains(where: { $0.isNewline || $0.isWhitespace }) else {
            throw RootineAPIError.invalidResponse
        }

        let expiresIn = Int(parameters["expires_in"] ?? "") ?? 3_600
        guard expiresIn > 0 else { throw RootineAPIError.invalidResponse }
        let expiresAt = Int(parameters["expires_at"] ?? "")
            ?? Int(now.timeIntervalSince1970) + expiresIn
        guard expiresAt > Int(now.timeIntervalSince1970) else { throw RootineAPIError.unauthorized }
        let tokenType = (parameters["token_type"] ?? "bearer").lowercased()
        guard tokenType == "bearer" else { throw RootineAPIError.invalidResponse }

        return SupabaseAuthCallback(
            accessToken: accessToken,
            refreshToken: refreshToken,
            expiresIn: expiresIn,
            expiresAt: expiresAt,
            tokenType: tokenType,
            isPasswordRecovery: parameters["type"]?.lowercased() == "recovery"
        )
    }
}

struct RemoteWorkspaceSnapshot: Codable, Equatable, Sendable {
    var storageKey: String
    var payload: JSONValue
    var contentHash: String
    var revision: Int64
    var updatedAt: String

    enum CodingKeys: String, CodingKey {
        case storageKey = "storage_key"
        case payload
        case contentHash = "content_hash"
        case revision
        case updatedAt = "updated_at"
    }
}

struct ApplySnapshotRequest: Codable {
    var storageKey: String
    var payload: JSONValue
    var contentHash: String
    var expectedRevision: Int64

    enum CodingKeys: String, CodingKey {
        case storageKey = "p_storage_key"
        case payload = "p_payload"
        case contentHash = "p_content_hash"
        case expectedRevision = "p_expected_revision"
    }
}

struct ApplySnapshotResponse: Codable, Equatable, Sendable {
    var applied: Bool
    var storageKey: String
    var payload: JSONValue
    var contentHash: String
    var revision: Int64
    var updatedAt: String
    var operationID: String? = nil
    var operationStatus: DualWriteOperationStatus? = nil
    var changeCursor: Int64? = nil
    var clientSource: DualWriteClientSource? = nil
    var materialized: Bool? = nil
    var reconciliationID: String? = nil
    var errorMessage: String? = nil

    enum CodingKeys: String, CodingKey {
        case applied
        case storageKey = "storage_key"
        case payload
        case contentHash = "content_hash"
        case revision
        case updatedAt = "updated_at"
        case operationID = "operation_id"
        case operationStatus = "operation_status"
        case changeCursor = "change_cursor"
        case clientSource = "client_source"
        case materialized
        case reconciliationID = "reconciliation_id"
        case errorMessage = "error_message"
    }
}

// Internal so the contract fixture tests can assert the wire shape without
// requiring a live URLSession or a deployed Edge Function.
struct NormalizedSyncRequest: Encodable {
    let contractVersion: Int
    let action: String
    let cursor: Int64?
    let limit: Int
    let deviceID: String

    enum CodingKeys: String, CodingKey {
        case contractVersion = "contract_version"
        case action
        case cursor
        case limit
        case deviceID = "device_id"
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(contractVersion, forKey: .contractVersion)
        try container.encode(action, forKey: .action)
        try container.encode(deviceID, forKey: .deviceID)
        // Bootstrap has no cursor/limit fields in sync-v3. Pull requires both
        // (including an explicit null cursor for the beginning of the log).
        if action == "pull" {
            try container.encode(cursor, forKey: .cursor)
            try container.encode(limit, forKey: .limit)
        }
    }
}

private struct NormalizedSyncErrorEnvelope: Decodable {
    let code: String?
    let error: String?
    let message: String?

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        code = try container.decodeIfPresent(String.self, forKey: .code)
        error = try container.decodeIfPresent(String.self, forKey: .error)
        message = try container.decodeIfPresent(String.self, forKey: .message)
    }

    private enum CodingKeys: String, CodingKey { case code, error, message }
}

private struct NormalizedSyncDataEnvelope<Value: Decodable>: Decodable {
    let data: Value
}

enum RootineAPIError: LocalizedError, Equatable, Sendable {
    case missingConfiguration
    case invalidResponse
    case invalidEmail
    case unauthorized
    case invalidCredentials
    case emailNotConfirmed
    case userAlreadyRegistered
    case weakPassword
    case rateLimited
    case registrationsDisabled
    case providerUnavailable
    case identityAlreadyExists
    case identityNotFound
    case lastIdentityNotDeletable
    case accountMismatch
    case cancelled
    case network
    case server(status: Int)

    var errorDescription: String? {
        switch self {
        case .missingConfiguration:
            return "Logowanie nie jest jeszcze skonfigurowane w tej wersji aplikacji."
        case .invalidResponse:
            return "Usługa konta zwróciła nieprawidłową odpowiedź. Spróbuj ponownie."
        case .invalidEmail:
            return "Wpisz poprawny adres e-mail."
        case .unauthorized:
            return "Sesja wygasła. Zaloguj się ponownie."
        case .invalidCredentials:
            return "Nieprawidłowy e-mail lub hasło. Sprawdź dane i spróbuj ponownie."
        case .emailNotConfirmed:
            return "Najpierw potwierdź adres e-mail, korzystając z wiadomości od Rootine."
        case .userAlreadyRegistered:
            return "Konto z tym adresem już istnieje. Zaloguj się albo odzyskaj hasło."
        case .weakPassword:
            return "Hasło jest za krótkie. Użyj co najmniej 8 znaków."
        case .rateLimited:
            return "Wykonano zbyt wiele prób. Odczekaj chwilę i spróbuj ponownie."
        case .registrationsDisabled:
            return "Tworzenie nowych kont jest obecnie wyłączone."
        case .providerUnavailable:
            return "Ta metoda logowania nie jest jeszcze dostępna w tym środowisku."
        case .identityAlreadyExists:
            return "To konto jest już połączone albo należy do innego użytkownika."
        case .identityNotFound:
            return "Nie znaleziono tego połączenia konta. Odśwież profil i spróbuj ponownie."
        case .lastIdentityNotDeletable:
            return "Nie można usunąć ostatniej metody logowania z konta."
        case .accountMismatch:
            return "To połączenie należy do innego konta Rootine. Nie zmieniono bieżącej sesji."
        case .cancelled:
            return "Logowanie zostało anulowane. Możesz spróbować ponownie."
        case .network:
            return "Nie udało się połączyć z usługą konta. Sprawdź internet i spróbuj ponownie."
        case .server:
            return "Operacja konta nie powiodła się. Spróbuj ponownie."
        }
    }
}

protocol RootineAuthClient: Sendable {
    func signIn(email: String, password: String) async throws -> SupabaseSession
    func signUp(email: String, password: String) async throws -> EmailRegistrationResult
    func resendConfirmation(email: String) async throws
    func requestPasswordReset(email: String) async throws
    func updatePassword(_ password: String, accessToken: String) async throws
    func refreshSession(refreshToken: String) async throws -> SupabaseSession
    func signInWithApple(idToken: String, nonce: String) async throws -> SupabaseSession
    func googleAuthorizationURL() throws -> URL
    func session(from callbackURL: URL) async throws -> AuthCallbackResult
    func googleIdentityAuthorizationURL(accessToken: String) async throws -> URL
    func linkAppleIdentity(idToken: String, nonce: String, accessToken: String) async throws -> SupabaseSession
    func identities(accessToken: String) async throws -> [SupabaseIdentity]
    func unlinkIdentity(identityID: String, accessToken: String) async throws
}

protocol WorkspaceRemoteClient: Sendable {
    func apply(_ mutation: PendingWorkspaceMutation, accessToken: String) async throws -> ApplySnapshotResponse
}

final class RootineAPIClient: WorkspaceRemoteClient, RootineRelationalReadClient, RootineAuthClient, @unchecked Sendable {
    private let configuration: RootineConfiguration
    private let session: URLSession
    private let syncDeviceID: String

    init(configuration: RootineConfiguration, session: URLSession = RootineSecureURLSession.make(), deviceID: String = UUID().uuidString) {
        self.configuration = configuration
        self.session = session
        // The mobile-sync edge function scopes registrations to the iOS device
        // namespace. Keep injected IDs usable in tests while normalizing the
        // production default to the contract's `ios_<uuid>` shape.
        syncDeviceID = deviceID.hasPrefix("ios_") ? deviceID : "ios_\(deviceID.lowercased())"
    }

    func signIn(email: String, password: String) async throws -> SupabaseSession {
        let request = try authRequest(
            path: "auth/v1/token",
            method: "POST",
            queryItems: [URLQueryItem(name: "grant_type", value: "password")],
            body: ["email": email, "password": password]
        )
        return try await send(request, as: SupabaseSession.self)
    }

    func signUp(email: String, password: String) async throws -> EmailRegistrationResult {
        guard let redirectURL = configuration.authCallbackURL else {
            throw RootineAPIError.missingConfiguration
        }
        let request = try authRequest(
            path: "auth/v1/signup",
            method: "POST",
            queryItems: [URLQueryItem(name: "redirect_to", value: redirectURL.absoluteString)],
            body: ["email": email, "password": password]
        )
        let data = try await sendRaw(request)
        if let session = try? JSONDecoder().decode(SupabaseSession.self, from: data) {
            return .session(session)
        }
        struct SignUpEnvelope: Decodable { var session: SupabaseSession? }
        if let session = try? JSONDecoder().decode(SignUpEnvelope.self, from: data).session {
            return .session(session)
        }
        return .needsEmailConfirmation
    }

    func resendConfirmation(email: String) async throws {
        guard let redirectURL = configuration.authCallbackURL else {
            throw RootineAPIError.missingConfiguration
        }
        let request = try authRequest(
            path: "auth/v1/resend",
            method: "POST",
            queryItems: [URLQueryItem(name: "redirect_to", value: redirectURL.absoluteString)],
            body: ["type": "signup", "email": email]
        )
        _ = try await sendRaw(request)
    }

    func requestPasswordReset(email: String) async throws {
        guard let redirectURL = configuration.authCallbackURL else {
            throw RootineAPIError.missingConfiguration
        }
        let request = try authRequest(
            path: "auth/v1/recover",
            method: "POST",
            queryItems: [URLQueryItem(name: "redirect_to", value: redirectURL.absoluteString)],
            body: ["email": email]
        )
        _ = try await sendRaw(request)
    }

    func updatePassword(_ password: String, accessToken: String) async throws {
        guard let baseURL = configuration.supabaseURL else {
            throw RootineAPIError.missingConfiguration
        }
        var request = authorizedRequest(
            url: baseURL.appendingPathComponent("auth/v1/user"),
            accessToken: accessToken
        )
        request.httpMethod = "PUT"
        request.httpBody = try JSONEncoder().encode(["password": password])
        _ = try await sendRaw(request)
    }

    /// Updates only the display-name field in the authenticated user's
    /// metadata. Existing metadata is retained so a provider's avatar or
    /// other harmless profile fields are not discarded by GoTrue.
    func updateDisplayName(
        _ displayName: String,
        existingMetadata: [String: JSONValue]?,
        accessToken: String
    ) async throws -> SupabaseUser {
        guard let baseURL = configuration.supabaseURL else { throw RootineAPIError.missingConfiguration }
        var request = authorizedRequest(
            url: baseURL.appendingPathComponent("auth/v1/user"),
            accessToken: accessToken
        )
        request.httpMethod = "PUT"
        var metadata = existingMetadata ?? [:]
        metadata["full_name"] = .string(displayName)
        request.httpBody = try JSONEncoder().encode(UserMetadataUpdate(data: metadata))
        return try await send(request, as: SupabaseUser.self)
    }

    /// Saves account-scoped notification settings through the existing RPC.
    /// The response contains only redacted preference metadata—never a push
    /// token or notification body.
    func saveNotificationPreferences(
        _ preferences: RootineNotificationPreferences,
        accessToken: String
    ) async throws -> RootineNotificationPreferences {
        guard let baseURL = configuration.supabaseURL else { throw RootineAPIError.missingConfiguration }
        var request = authorizedRequest(
            url: baseURL.appendingPathComponent("rest/v1/rpc/rootine_save_notification_preferences"),
            accessToken: accessToken
        )
        request.httpMethod = "POST"
        request.httpBody = try JSONEncoder().encode(RemoteNotificationPreferencesRequest(preferences: preferences))
        let rows = try await send(request, as: [RemoteNotificationPreferences].self)
        guard let response = rows.first else { throw RootineAPIError.invalidResponse }
        return response.localPreferences
    }

    func loadNotificationPreferences(
        accessToken: String
    ) async throws -> RootineNotificationPreferences? {
        guard let baseURL = configuration.supabaseURL else { throw RootineAPIError.missingConfiguration }
        var components = URLComponents(
            url: baseURL.appendingPathComponent("rest/v1/rootine_notification_preferences"),
            resolvingAgainstBaseURL: false
        )
        components?.queryItems = [
            URLQueryItem(name: "select", value: "notifications_enabled,task_notifications_enabled,habit_notifications_enabled,timezone,quiet_hours_start,quiet_hours_end"),
            URLQueryItem(name: "limit", value: "1")
        ]
        guard let url = components?.url else { throw RootineAPIError.missingConfiguration }
        let response = try await send(authorizedRequest(url: url, accessToken: accessToken), as: [RemoteNotificationPreferences].self)
        return response.first?.localPreferences
    }

    func refreshSession(refreshToken: String) async throws -> SupabaseSession {
        let request = try authRequest(
            path: "auth/v1/token",
            method: "POST",
            queryItems: [URLQueryItem(name: "grant_type", value: "refresh_token")],
            body: ["refresh_token": refreshToken]
        )
        return try await send(request, as: SupabaseSession.self)
    }

    func signInWithApple(idToken: String, nonce: String) async throws -> SupabaseSession {
        guard !idToken.isEmpty, !nonce.isEmpty else { throw RootineAPIError.invalidResponse }
        let request = try authRequest(
            path: "auth/v1/token",
            method: "POST",
            queryItems: [URLQueryItem(name: "grant_type", value: "id_token")],
            body: ["provider": "apple", "id_token": idToken, "nonce": nonce]
        )
        return try await send(request, as: SupabaseSession.self)
    }

    func linkAppleIdentity(idToken: String, nonce: String, accessToken: String) async throws -> SupabaseSession {
        guard !idToken.isEmpty, !nonce.isEmpty, !accessToken.isEmpty else {
            throw RootineAPIError.invalidResponse
        }
        guard let baseURL = configuration.supabaseURL else {
            throw RootineAPIError.missingConfiguration
        }
        var components = URLComponents(
            url: baseURL.appendingPathComponent("auth/v1/token"),
            resolvingAgainstBaseURL: false
        )
        components?.queryItems = [URLQueryItem(name: "grant_type", value: "id_token")]
        guard let url = components?.url else { throw RootineAPIError.missingConfiguration }
        var request = authorizedRequest(url: url, accessToken: accessToken)
        request.httpMethod = "POST"
        request.httpBody = try JSONEncoder().encode(AppleTokenRequest(
            provider: "apple",
            idToken: idToken,
            nonce: nonce,
            linkIdentity: true
        ))
        return try await send(request, as: SupabaseSession.self)
    }

    func googleAuthorizationURL() throws -> URL {
        guard let baseURL = configuration.supabaseURL,
              let redirectURL = configuration.authCallbackURL else {
            throw RootineAPIError.missingConfiguration
        }
        var components = URLComponents(
            url: baseURL.appendingPathComponent("auth/v1/authorize"),
            resolvingAgainstBaseURL: false
        )
        components?.queryItems = [
            URLQueryItem(name: "provider", value: "google"),
            URLQueryItem(name: "redirect_to", value: redirectURL.absoluteString)
        ]
        guard let url = components?.url else { throw RootineAPIError.missingConfiguration }
        return url
    }

    func googleIdentityAuthorizationURL(accessToken: String) async throws -> URL {
        guard !accessToken.isEmpty,
              let baseURL = configuration.supabaseURL,
              let redirectURL = configuration.authCallbackURL else {
            throw RootineAPIError.missingConfiguration
        }
        var components = URLComponents(
            url: baseURL.appendingPathComponent("auth/v1/user/identities/authorize"),
            resolvingAgainstBaseURL: false
        )
        components?.queryItems = [
            URLQueryItem(name: "provider", value: "google"),
            URLQueryItem(name: "redirect_to", value: redirectURL.absoluteString),
            URLQueryItem(name: "skip_http_redirect", value: "true")
        ]
        guard let url = components?.url else { throw RootineAPIError.missingConfiguration }
        let envelope = try await send(authorizedRequest(url: url, accessToken: accessToken), as: IdentityAuthorizationEnvelope.self)
        guard let providerURL = envelope.url,
              providerURL.scheme?.lowercased() == "https",
              providerURL.host != nil else {
            throw RootineAPIError.invalidResponse
        }
        return providerURL
    }

    func session(from callbackURL: URL) async throws -> AuthCallbackResult {
        let callback = try SupabaseAuthCallback.parse(
            callbackURL,
            expectedScheme: configuration.authCallbackScheme.isEmpty ? nil : configuration.authCallbackScheme
        )
        let user = try await currentUser(accessToken: callback.accessToken)
        let session = SupabaseSession(
            accessToken: callback.accessToken,
            refreshToken: callback.refreshToken,
            expiresIn: callback.expiresIn,
            expiresAt: callback.expiresAt,
            tokenType: callback.tokenType,
            user: user
        )
        return AuthCallbackResult(session: session, isPasswordRecovery: callback.isPasswordRecovery)
    }

    func identities(accessToken: String) async throws -> [SupabaseIdentity] {
        guard !accessToken.isEmpty,
              let baseURL = configuration.supabaseURL else {
            throw RootineAPIError.missingConfiguration
        }
        let user = try await send(
            authorizedRequest(
                url: baseURL.appendingPathComponent("auth/v1/user"),
                accessToken: accessToken
            ),
            as: SupabaseUser.self
        )
        return user.identities ?? []
    }

    func unlinkIdentity(identityID: String, accessToken: String) async throws {
        guard !identityID.isEmpty, !accessToken.isEmpty,
              let baseURL = configuration.supabaseURL else {
            throw RootineAPIError.missingConfiguration
        }
        let url = baseURL
            .appendingPathComponent("auth/v1/user/identities")
            .appendingPathComponent(identityID)
        _ = try await sendRaw(authorizedRequest(url: url, accessToken: accessToken))
    }

    func readSnapshots(accessToken: String) async throws -> [RemoteWorkspaceSnapshot] {
        guard let baseURL = configuration.supabaseURL else { throw RootineAPIError.missingConfiguration }
        var components = URLComponents(url: baseURL.appendingPathComponent("rest/v1/rootine_workspace_snapshots"), resolvingAgainstBaseURL: false)
        components?.queryItems = [
            URLQueryItem(name: "select", value: "storage_key,payload,content_hash,revision,updated_at"),
            URLQueryItem(name: "order", value: "storage_key.asc")
        ]
        guard let url = components?.url else { throw RootineAPIError.missingConfiguration }
        return try await send(authorizedRequest(url: url, accessToken: accessToken), as: [RemoteWorkspaceSnapshot].self)
    }

    func apply(_ mutation: PendingWorkspaceMutation, accessToken: String) async throws -> ApplySnapshotResponse {
        guard let baseURL = configuration.supabaseURL else { throw RootineAPIError.missingConfiguration }
        let url = baseURL.appendingPathComponent("rest/v1/rpc/rootine_apply_workspace_snapshot")
        var request = authorizedRequest(url: url, accessToken: accessToken)
        request.httpMethod = "POST"
        request.httpBody = try JSONEncoder().encode(DualWriteApplySnapshotRequest(
            storageKey: mutation.storageKey,
            payload: mutation.payload,
            contentHash: mutation.contentHash,
            expectedRevision: mutation.expectedRevision,
            operationID: mutation.id,
            clientSource: .ios,
            correlationID: UUID().uuidString,
            cursor: mutation.cursor
        ))
        let rows = try await send(request, as: [ApplySnapshotResponse].self)
        guard let first = rows.first else { throw RootineAPIError.invalidResponse }
        return first
    }

    /// Registers one authenticated app installation. The APNs token is sent
    /// only to the server-side RPC and the response intentionally contains
    /// metadata, never the token itself.
    func registerDevice(
        deviceID: String,
        appVersion: String,
        apnsEnvironment: RootineAPNsEnvironment?,
        pushToken: String?,
        permissionState: RootineNotificationPermissionState,
        accessToken: String
    ) async throws -> RootineDeviceRegistration {
        guard let baseURL = configuration.supabaseURL else { throw RootineAPIError.missingConfiguration }
        let url = baseURL.appendingPathComponent("rest/v1/rpc/rootine_register_device")
        var request = authorizedRequest(url: url, accessToken: accessToken)
        request.httpMethod = "POST"
        request.httpBody = try JSONEncoder().encode(RegisterDeviceRequest(
            deviceID: deviceID,
            platform: "ios",
            appVersion: appVersion,
            apnsEnvironment: apnsEnvironment,
            pushToken: pushToken,
            permissionState: permissionState
        ))
        let rows = try await send(request, as: [RootineDeviceRegistration].self)
        guard let first = rows.first else { throw RootineAPIError.invalidResponse }
        return first
    }

    func revokeDevice(deviceID: String, accessToken: String) async throws -> RootineDeviceRevocation {
        guard let baseURL = configuration.supabaseURL else { throw RootineAPIError.missingConfiguration }
        let url = baseURL.appendingPathComponent("rest/v1/rpc/rootine_revoke_device")
        var request = authorizedRequest(url: url, accessToken: accessToken)
        request.httpMethod = "POST"
        request.httpBody = try JSONEncoder().encode(RevokeDeviceRequest(deviceID: deviceID))
        let rows = try await send(request, as: [RootineDeviceRevocation].self)
        guard let first = rows.first else { throw RootineAPIError.invalidResponse }
        return first
    }

    func bootstrap(accessToken: String) async throws -> RootineRelationalBootstrapResponse {
        let request = try normalizedSyncRequest(action: "bootstrap", cursor: nil, limit: 500, accessToken: accessToken)
        return try await sendNormalized(request, as: RootineRelationalBootstrapResponse.self)
    }

    func pullChanges(cursor: Int64?, limit: Int, accessToken: String) async throws -> RootineRelationalPullResponse {
        let request = try normalizedSyncRequest(action: "pull", cursor: cursor, limit: min(max(limit, 1), 500), accessToken: accessToken)
        return try await sendNormalized(request, as: RootineRelationalPullResponse.self)
    }

    func searchProducts(query: String, accessToken: String) async throws -> [NutritionProduct] {
        guard let baseURL = configuration.backendURL else { throw RootineAPIError.missingConfiguration }
        var components = URLComponents(url: baseURL.appendingPathComponent("api/openfoodfacts/search"), resolvingAgainstBaseURL: false)
        components?.queryItems = [
            URLQueryItem(name: "q", value: query),
            URLQueryItem(name: "langs", value: "pl,en"),
            URLQueryItem(name: "page_size", value: "18")
        ]
        guard let url = components?.url else { throw RootineAPIError.missingConfiguration }
        struct Payload: Codable { var products: [NutritionProduct] }
        return try await send(authorizedRequest(url: url, accessToken: accessToken, includeAPIKey: false), as: Payload.self).products
    }

    func product(barcode: String, accessToken: String) async throws -> NutritionProduct {
        guard let baseURL = configuration.backendURL else { throw RootineAPIError.missingConfiguration }
        var components = URLComponents(url: baseURL.appendingPathComponent("api/openfoodfacts/barcode"), resolvingAgainstBaseURL: false)
        components?.queryItems = [URLQueryItem(name: "code", value: barcode)]
        guard let url = components?.url else { throw RootineAPIError.missingConfiguration }
        struct Payload: Codable { var product: NutritionProduct }
        return try await send(authorizedRequest(url: url, accessToken: accessToken, includeAPIKey: false), as: Payload.self).product
    }

    func deleteAccount(accessToken: String) async throws {
        guard let baseURL = configuration.supabaseURL else { throw RootineAPIError.missingConfiguration }
        let url = baseURL.appendingPathComponent("functions/v1/delete-account")
        var request = authorizedRequest(url: url, accessToken: accessToken)
        request.httpMethod = "POST"
        request.httpBody = try JSONEncoder().encode(["confirmation": "DELETE"])
        _ = try await sendRaw(request)
    }

    private func currentUser(accessToken: String) async throws -> SupabaseUser {
        guard let baseURL = configuration.supabaseURL else { throw RootineAPIError.missingConfiguration }
        let request = authorizedRequest(
            url: baseURL.appendingPathComponent("auth/v1/user"),
            accessToken: accessToken
        )
        return try await send(request, as: SupabaseUser.self)
    }

    private struct AppleTokenRequest: Encodable {
        var provider: String
        var idToken: String
        var nonce: String
        var linkIdentity: Bool

        enum CodingKeys: String, CodingKey {
            case provider
            case idToken = "id_token"
            case nonce
            case linkIdentity = "link_identity"
        }
    }

    private struct IdentityAuthorizationEnvelope: Decodable {
        var url: URL?
    }

    private struct RegisterDeviceRequest: Encodable {
        var deviceID: String
        var platform: String
        var appVersion: String
        var apnsEnvironment: RootineAPNsEnvironment?
        var pushToken: String?
        var permissionState: RootineNotificationPermissionState

        enum CodingKeys: String, CodingKey {
            case deviceID = "p_device_id"
            case platform = "p_platform"
            case appVersion = "p_app_version"
            case apnsEnvironment = "p_apns_environment"
            case pushToken = "p_push_token"
            case permissionState = "p_permission_state"
        }
    }

    private struct RevokeDeviceRequest: Encodable {
        var deviceID: String

        enum CodingKeys: String, CodingKey {
            case deviceID = "p_device_id"
        }
    }

    private struct UserMetadataUpdate: Encodable {
        var data: [String: JSONValue]
    }

    private struct RemoteNotificationPreferencesRequest: Encodable {
        var notificationsEnabled: Bool
        var taskNotificationsEnabled: Bool
        var habitNotificationsEnabled: Bool
        var timezone: String
        var quietHoursStart: String?
        var quietHoursEnd: String?

        init(preferences: RootineNotificationPreferences) {
            notificationsEnabled = preferences.enabled
            taskNotificationsEnabled = preferences.taskRemindersEnabled
            habitNotificationsEnabled = preferences.habitRemindersEnabled
            timezone = preferences.timezoneIdentifier
            quietHoursStart = preferences.quietHoursStart
            quietHoursEnd = preferences.quietHoursEnd
        }

        enum CodingKeys: String, CodingKey {
            case notificationsEnabled = "p_notifications_enabled"
            case taskNotificationsEnabled = "p_task_notifications_enabled"
            case habitNotificationsEnabled = "p_habit_notifications_enabled"
            case timezone = "p_timezone"
            case quietHoursStart = "p_quiet_hours_start"
            case quietHoursEnd = "p_quiet_hours_end"
        }
    }

    private struct RemoteNotificationPreferences: Decodable {
        var notificationsEnabled: Bool
        var taskNotificationsEnabled: Bool
        var habitNotificationsEnabled: Bool
        var timezone: String
        var quietHoursStart: String?
        var quietHoursEnd: String?

        enum CodingKeys: String, CodingKey {
            case notificationsEnabled = "notifications_enabled"
            case taskNotificationsEnabled = "task_notifications_enabled"
            case habitNotificationsEnabled = "habit_notifications_enabled"
            case timezone
            case quietHoursStart = "quiet_hours_start"
            case quietHoursEnd = "quiet_hours_end"
        }

        var localPreferences: RootineNotificationPreferences {
            RootineNotificationPreferences(
                enabled: notificationsEnabled,
                timezoneIdentifier: timezone,
                taskRemindersEnabled: taskNotificationsEnabled,
                habitRemindersEnabled: habitNotificationsEnabled,
                showTaskDetails: false,
                quietHoursStart: normalizedTime(quietHoursStart),
                quietHoursEnd: normalizedTime(quietHoursEnd)
            )
        }

        private func normalizedTime(_ value: String?) -> String? {
            guard let value, !value.isEmpty else { return nil }
            // Postgres `time` commonly arrives as HH:mm:ss; the local
            // scheduler accepts HH:mm and the server accepts both forms.
            return String(value.prefix(5))
        }
    }

    private func authRequest(
        path: String,
        method: String,
        queryItems: [URLQueryItem] = [],
        body: [String: String]
    ) throws -> URLRequest {
        guard let baseURL = configuration.supabaseURL else { throw RootineAPIError.missingConfiguration }
        var components = URLComponents(url: baseURL.appendingPathComponent(path), resolvingAgainstBaseURL: false)
        components?.queryItems = queryItems
        guard let url = components?.url else { throw RootineAPIError.missingConfiguration }
        var request = URLRequest(url: url)
        request.httpMethod = method
        request.cachePolicy = .reloadIgnoringLocalCacheData
        request.httpBody = try JSONEncoder().encode(body)
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("no-store", forHTTPHeaderField: "Cache-Control")
        request.setValue("no-cache", forHTTPHeaderField: "Pragma")
        request.setValue(configuration.supabasePublishableKey, forHTTPHeaderField: "apikey")
        return request
    }

    private func authorizedRequest(url: URL, accessToken: String, includeAPIKey: Bool = true) -> URLRequest {
        var request = URLRequest(url: url)
        // Workspace/profile responses are account data. Do not allow
        // URLSession/URLCache to persist an authenticated response where a
        // later account could observe it after logout or account switching.
        request.cachePolicy = .reloadIgnoringLocalCacheData
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("no-store", forHTTPHeaderField: "Cache-Control")
        request.setValue("no-cache", forHTTPHeaderField: "Pragma")
        request.setValue("Bearer \(accessToken)", forHTTPHeaderField: "Authorization")
        if includeAPIKey {
            request.setValue(configuration.supabasePublishableKey, forHTTPHeaderField: "apikey")
        }
        return request
    }

    private func normalizedSyncRequest(action: String, cursor: Int64?, limit: Int, accessToken: String) throws -> URLRequest {
        guard let baseURL = configuration.supabaseURL else { throw RootineAPIError.missingConfiguration }
        var request = authorizedRequest(url: baseURL.appendingPathComponent("functions/v1/mobile-sync"), accessToken: accessToken)
        request.httpMethod = "POST"
        request.httpBody = try JSONEncoder().encode(NormalizedSyncRequest(
            contractVersion: 3,
            action: action,
            cursor: cursor,
            limit: limit,
            deviceID: syncDeviceID
        ))
        return request
    }

    private func sendNormalized<T: Decodable>(_ request: URLRequest, as type: T.Type) async throws -> T {
        let data: Data
        let response: URLResponse
        do {
            (data, response) = try await session.data(for: request)
        } catch is CancellationError {
            throw RootineAPIError.cancelled
        } catch {
            throw RootineAPIError.network
        }
        guard let http = response as? HTTPURLResponse else { throw RootineAPIError.invalidResponse }
        guard (200..<300).contains(http.statusCode) else {
            if http.statusCode == 401 { throw RootineAPIError.unauthorized }
            let errorEnvelope = try? JSONDecoder().decode(NormalizedSyncErrorEnvelope.self, from: data)
            let errorCode = [errorEnvelope?.code, errorEnvelope?.error, errorEnvelope?.message]
                .compactMap { $0?.lowercased() }
                .joined(separator: " ")
            if http.statusCode == 410 || errorCode.contains("cursor_expired") || errorCode.contains("cursorexpired") {
                throw RootineNormalizedReadError.cursorExpired
            }
            switch errorCode {
            case let code where code.contains("schema_mismatch") || code.contains("schemamismatch"):
                throw RootineNormalizedReadError.schemaMismatch(expected: RootineRelationalWorkspaceAdapter.supportedContractVersion, actual: nil)
            case let code where code.contains("contract_mismatch") || code.contains("contractmismatch"):
                throw RootineNormalizedReadError.contractMismatch("serwer odrzucił kontrakt")
            case let code where code.contains("materializer_error") || code.contains("materialization_failed"):
                throw RootineNormalizedReadError.materializationFailed("serwer")
            default: try validate(data: data, response: response)
            }
            throw RootineAPIError.server(status: http.statusCode)
        }
        do {
            let decoder = JSONDecoder()
            if let direct = try? decoder.decode(type, from: data) { return direct }
            if let envelope = try? decoder.decode(NormalizedSyncDataEnvelope<T>.self, from: data) { return envelope.data }
            throw RootineNormalizedReadError.contractMismatch("nieprawidłowa odpowiedź")
        } catch {
            // A syntactically valid HTTP response with the wrong envelope is
            // a contract issue, not a missing/empty account.
            throw RootineNormalizedReadError.contractMismatch("nieprawidłowa odpowiedź")
        }
    }

    private func send<T: Decodable>(_ request: URLRequest, as type: T.Type) async throws -> T {
        let data = try await sendRaw(request)
        do { return try JSONDecoder().decode(T.self, from: data) }
        catch { throw RootineAPIError.invalidResponse }
    }

    private func sendRaw(_ request: URLRequest) async throws -> Data {
        let data: Data
        let response: URLResponse
        do {
            (data, response) = try await session.data(for: request)
        } catch is CancellationError {
            throw RootineAPIError.cancelled
        } catch {
            throw RootineAPIError.network
        }
        try validate(data: data, response: response)
        return data
    }

    private func validate(data: Data, response: URLResponse) throws {
        guard let response = response as? HTTPURLResponse else { throw RootineAPIError.invalidResponse }
        guard !(200..<300).contains(response.statusCode) else { return }

        struct ErrorPayload: Decodable {
            var error: String?
            var errorDescription: String?
            var message: String?
            var msg: String?
            var code: String?

            enum CodingKeys: String, CodingKey {
                case error
                case errorDescription = "error_description"
                case message
                case msg
                case code
            }
        }

        let payload = try? JSONDecoder().decode(ErrorPayload.self, from: data)
        let details = [payload?.error, payload?.errorDescription, payload?.message, payload?.msg, payload?.code]
            .compactMap { $0 }
            .joined(separator: " ")
            .lowercased()

        if response.statusCode == 429 || details.contains("rate limit") || details.contains("too many") {
            throw RootineAPIError.rateLimited
        }
        if details.contains("invalid login credentials") {
            throw RootineAPIError.invalidCredentials
        }
        if details.contains("email not confirmed") {
            throw RootineAPIError.emailNotConfirmed
        }
        if details.contains("already registered") || details.contains("user_already_exists") {
            throw RootineAPIError.userAlreadyRegistered
        }
        if details.contains("password") && (details.contains("characters") || details.contains("weak")) {
            throw RootineAPIError.weakPassword
        }
        if details.contains("signup") && details.contains("disabled") {
            throw RootineAPIError.registrationsDisabled
        }
        if details.contains("provider") && (details.contains("enabled") || details.contains("unsupported")) {
            throw RootineAPIError.providerUnavailable
        }
        if details.contains("identity_already_exists")
            || details.contains("identity is already linked") {
            throw RootineAPIError.identityAlreadyExists
        }
        if details.contains("identity_not_found")
            || details.contains("identity not found") {
            throw RootineAPIError.identityNotFound
        }
        if details.contains("single_identity_not_deletable")
            || details.contains("at least 2")
            || details.contains("last identity") {
            throw RootineAPIError.lastIdentityNotDeletable
        }
        if details.contains("refresh token") && (details.contains("invalid") || details.contains("not found")) {
            throw RootineAPIError.unauthorized
        }
        if response.statusCode == 401 {
            throw RootineAPIError.unauthorized
        }
        throw RootineAPIError.server(status: response.statusCode)
    }
}
