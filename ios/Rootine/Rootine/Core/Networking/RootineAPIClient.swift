import Foundation

struct RootineConfiguration: Equatable, Sendable {
    var supabaseURL: URL?
    var supabasePublishableKey: String
    var backendURL: URL?
    var authCallbackScheme: String
    var termsURL: URL?
    var privacyURL: URL?

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
        return RootineConfiguration(
            supabaseURL: url("ROOTINE_SUPABASE_URL"),
            supabasePublishableKey: value("ROOTINE_SUPABASE_PUBLISHABLE_KEY"),
            backendURL: url("ROOTINE_BACKEND_URL"),
            authCallbackScheme: value("ROOTINE_AUTH_CALLBACK_SCHEME"),
            termsURL: url("ROOTINE_TERMS_URL"),
            privacyURL: url("ROOTINE_PRIVACY_URL")
        )
    }
}

struct SupabaseUser: Codable, Equatable, Sendable {
    var id: String
    var email: String?
}

struct SupabaseSession: Codable, Equatable, Sendable {
    var accessToken: String
    var refreshToken: String
    var expiresIn: Int
    var expiresAt: Int?
    var tokenType: String
    var user: SupabaseUser

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

    static func parse(_ url: URL) throws -> SupabaseAuthCallback {
        var parameters: [String: String] = [:]
        let urlComponents = URLComponents(url: url, resolvingAgainstBaseURL: false)
        urlComponents?.queryItems?.forEach { parameters[$0.name] = $0.value }

        if let fragment = urlComponents?.fragment,
           let fragmentComponents = URLComponents(string: "rootine://callback?\(fragment)") {
            fragmentComponents.queryItems?.forEach { parameters[$0.name] = $0.value }
        }

        if let error = parameters["error_description"] ?? parameters["error"] {
            let normalized = error.lowercased()
            if normalized.contains("cancel") || normalized.contains("denied") || normalized.contains("access_denied") {
                throw RootineAPIError.cancelled
            }
            throw RootineAPIError.providerUnavailable
        }

        guard let accessToken = parameters["access_token"],
              let refreshToken = parameters["refresh_token"] else {
            throw RootineAPIError.invalidResponse
        }

        return SupabaseAuthCallback(
            accessToken: accessToken,
            refreshToken: refreshToken,
            expiresIn: Int(parameters["expires_in"] ?? "") ?? 3_600,
            expiresAt: Int(parameters["expires_at"] ?? "")
                ?? Int(Date().timeIntervalSince1970) + (Int(parameters["expires_in"] ?? "") ?? 3_600),
            tokenType: parameters["token_type"] ?? "bearer",
            isPasswordRecovery: parameters["type"] == "recovery"
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

    enum CodingKeys: String, CodingKey {
        case applied
        case storageKey = "storage_key"
        case payload
        case contentHash = "content_hash"
        case revision
        case updatedAt = "updated_at"
    }
}

enum RootineAPIError: LocalizedError, Equatable, Sendable {
    case missingConfiguration
    case invalidResponse
    case unauthorized
    case invalidCredentials
    case emailNotConfirmed
    case userAlreadyRegistered
    case weakPassword
    case rateLimited
    case registrationsDisabled
    case providerUnavailable
    case cancelled
    case network
    case server(status: Int)

    var errorDescription: String? {
        switch self {
        case .missingConfiguration:
            return "Logowanie nie jest jeszcze skonfigurowane w tej wersji aplikacji."
        case .invalidResponse:
            return "Usługa konta zwróciła nieprawidłową odpowiedź. Spróbuj ponownie."
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
        case .cancelled:
            return "Logowanie zostało anulowane. Możesz spróbować ponownie."
        case .network:
            return "Nie udało się połączyć z usługą konta. Sprawdź internet i spróbuj ponownie."
        case .server:
            return "Operacja konta nie powiodła się. Spróbuj ponownie."
        }
    }
}

protocol WorkspaceRemoteClient: Sendable {
    func apply(_ mutation: PendingWorkspaceMutation, accessToken: String) async throws -> ApplySnapshotResponse
}

final class RootineAPIClient: WorkspaceRemoteClient, @unchecked Sendable {
    private let configuration: RootineConfiguration
    private let session: URLSession

    init(configuration: RootineConfiguration, session: URLSession = .shared) {
        self.configuration = configuration
        self.session = session
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
        let request = try authRequest(
            path: "auth/v1/token",
            method: "POST",
            queryItems: [URLQueryItem(name: "grant_type", value: "id_token")],
            body: ["provider": "apple", "id_token": idToken, "nonce": nonce]
        )
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

    func session(from callbackURL: URL) async throws -> AuthCallbackResult {
        let callback = try SupabaseAuthCallback.parse(callbackURL)
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
        request.httpBody = try JSONEncoder().encode(ApplySnapshotRequest(
            storageKey: mutation.storageKey,
            payload: mutation.payload,
            contentHash: mutation.contentHash,
            expectedRevision: mutation.expectedRevision
        ))
        let rows = try await send(request, as: [ApplySnapshotResponse].self)
        guard let first = rows.first else { throw RootineAPIError.invalidResponse }
        return first
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
        request.httpBody = try JSONEncoder().encode(body)
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue(configuration.supabasePublishableKey, forHTTPHeaderField: "apikey")
        return request
    }

    private func authorizedRequest(url: URL, accessToken: String, includeAPIKey: Bool = true) -> URLRequest {
        var request = URLRequest(url: url)
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("Bearer \(accessToken)", forHTTPHeaderField: "Authorization")
        if includeAPIKey {
            request.setValue(configuration.supabasePublishableKey, forHTTPHeaderField: "apikey")
        }
        return request
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
        if details.contains("refresh token") && (details.contains("invalid") || details.contains("not found")) {
            throw RootineAPIError.unauthorized
        }
        if response.statusCode == 401 {
            throw RootineAPIError.unauthorized
        }
        throw RootineAPIError.server(status: response.statusCode)
    }
}
