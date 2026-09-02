import XCTest
@testable import Rootine

final class AuthenticationTests: XCTestCase {
    func testEmailValidationNormalizesAndRejectsIncompleteAddresses() {
        XCTAssertEqual(AuthInputValidator.normalizedEmail("  OLA@Example.COM "), "ola@example.com")
        XCTAssertTrue(AuthInputValidator.isValidEmail("ola@example.com"))
        XCTAssertFalse(AuthInputValidator.isValidEmail("ola@example"))
        XCTAssertFalse(AuthInputValidator.isValidEmail("ola example.com"))
        XCTAssertFalse(AuthInputValidator.isValidEmail("ola@example..com"))
    }

    func testPasswordRequiresAtLeastEightCharacters() {
        XCTAssertNotNil(AuthInputValidator.passwordError("1234567"))
        XCTAssertNil(AuthInputValidator.passwordError("12345678"))
    }

    func testOAuthCallbackParsesSessionAndRecoveryStateFromFragment() throws {
        let url = try XCTUnwrap(URL(string: "rootine://auth-callback#access_token=access&refresh_token=refresh&expires_in=3600&expires_at=2000000000&token_type=bearer&type=recovery"))
        let callback = try SupabaseAuthCallback.parse(url)

        XCTAssertEqual(callback.accessToken, "access")
        XCTAssertEqual(callback.refreshToken, "refresh")
        XCTAssertEqual(callback.expiresIn, 3_600)
        XCTAssertEqual(callback.expiresAt, 2_000_000_000)
        XCTAssertTrue(callback.isPasswordRecovery)
    }

    func testOAuthCancellationMapsToRecoverableUserFacingError() throws {
        let url = try XCTUnwrap(URL(string: "rootine://auth-callback?error=access_denied&error_description=cancelled"))
        XCTAssertThrowsError(try SupabaseAuthCallback.parse(url)) { error in
            XCTAssertEqual(error as? RootineAPIError, .cancelled)
        }
    }

    func testOAuthCallbackRejectsAForeignSchemeAndExpiredSession() throws {
        let now = Date(timeIntervalSince1970: 2_000_000_000)
        let foreign = try XCTUnwrap(URL(string: "https://example.com/auth-callback#access_token=access&refresh_token=refresh"))
        XCTAssertThrowsError(try SupabaseAuthCallback.parse(foreign)) { error in
            XCTAssertEqual(error as? RootineAPIError, .invalidResponse)
        }

        let expired = try XCTUnwrap(URL(string: "rootine://auth-callback#access_token=access&refresh_token=refresh&expires_at=1999999999"))
        XCTAssertThrowsError(try SupabaseAuthCallback.parse(expired, now: now)) { error in
            XCTAssertEqual(error as? RootineAPIError, .unauthorized)
        }
    }

    func testOAuthCallbackNormalizesBearerAndRecoveryType() throws {
        let url = try XCTUnwrap(URL(string: "rootine://AUTH-CALLBACK?access_token=access&refresh_token=refresh&expires_in=30&token_type=BEARER&type=RECOVERY"))
        let callback = try SupabaseAuthCallback.parse(url, expectedScheme: "ROOTINE", now: Date(timeIntervalSince1970: 1_000))

        XCTAssertEqual(callback.tokenType, "bearer")
        XCTAssertTrue(callback.isPasswordRecovery)
        XCTAssertEqual(callback.expiresAt, 1_030)
    }

    func testOAuthCallbackMapsIdentityLinkFailuresWithoutLoggingOut() throws {
        let alreadyLinked = try XCTUnwrap(URL(string: "rootine://auth-callback?error=identity_already_exists"))
        XCTAssertThrowsError(try SupabaseAuthCallback.parse(alreadyLinked)) { error in
            XCTAssertEqual(error as? RootineAPIError, .identityAlreadyExists)
        }

        let lastIdentity = try XCTUnwrap(URL(string: "rootine://auth-callback?error=single_identity_not_deletable"))
        XCTAssertThrowsError(try SupabaseAuthCallback.parse(lastIdentity)) { error in
            XCTAssertEqual(error as? RootineAPIError, .lastIdentityNotDeletable)
        }
    }

    func testAppleIdentityTokenRequiresIssuerAudienceExpiryAndNonce() throws {
        let nonce = "nonce-from-request"
        let now = Date(timeIntervalSince1970: 1_000)
        let valid = makeJWT(
            header: ["alg": "RS256", "typ": "JWT"],
            payload: [
                "iss": "https://appleid.apple.com",
                "sub": "apple-subject",
                "aud": "app.rootine.ios",
                "nonce": AuthNonce.hashed(nonce),
                "exp": 1_060
            ]
        )

        XCTAssertNoThrow(try AuthProtocolValidator.validateAppleIdentityToken(
            valid,
            rawNonce: nonce,
            expectedAudience: "app.rootine.ios",
            now: now
        ))

        let wrongAudience = makeJWT(
            header: ["alg": "RS256"],
            payload: [
                "iss": "https://appleid.apple.com",
                "sub": "apple-subject",
                "aud": "other.app",
                "nonce": AuthNonce.hashed(nonce),
                "exp": 1_060
            ]
        )
        XCTAssertThrowsError(try AuthProtocolValidator.validateAppleIdentityToken(
            wrongAudience,
            rawNonce: nonce,
            expectedAudience: "app.rootine.ios",
            now: now
        )) { error in
            XCTAssertEqual(error as? RootineAPIError, .invalidResponse)
        }
    }

    func testAppleIdentityTokenRejectsNonceReuseAndUnsignedJWT() throws {
        let now = Date(timeIntervalSince1970: 1_000)
        let payload: [String: Any] = [
            "iss": "https://appleid.apple.com",
            "sub": "apple-subject",
            "aud": "app.rootine.ios",
            "nonce": AuthNonce.hashed("expected"),
            "exp": 1_060
        ]
        let unsigned = makeJWT(header: ["alg": "none"], payload: payload)
        XCTAssertThrowsError(try AuthProtocolValidator.validateAppleIdentityToken(
            unsigned,
            rawNonce: "expected",
            expectedAudience: "app.rootine.ios",
            now: now
        ))

        let mismatchedNonce = makeJWT(header: ["alg": "RS256"], payload: payload)
        XCTAssertThrowsError(try AuthProtocolValidator.validateAppleIdentityToken(
            mismatchedNonce,
            rawNonce: "different",
            expectedAudience: "app.rootine.ios",
            now: now
        ))
    }

    func testStoredSessionRefreshesShortlyBeforeExpiry() {
        let session = SupabaseSession(
            accessToken: "access",
            refreshToken: "refresh",
            expiresIn: 3_600,
            expiresAt: Int(Date().timeIntervalSince1970) + 30,
            tokenType: "bearer",
            user: SupabaseUser(id: "user", email: "ola@example.com")
        )
        XCTAssertTrue(session.shouldRefresh)
    }

    func testSessionValidationRejectsEmptyBearerFields() {
        let invalid = SupabaseSession(
            accessToken: "",
            refreshToken: "refresh",
            expiresIn: 3_600,
            expiresAt: nil,
            tokenType: "bearer",
            user: SupabaseUser(id: "user", email: "ola@example.com")
        )
        XCTAssertFalse(invalid.isValid)
        XCTAssertThrowsError(try invalid.validated()) { error in
            XCTAssertEqual(error as? RootineAPIError, .invalidResponse)
        }
    }

    func testAPNsEnvironmentContractKeepsSandboxAndProductionDistinct() {
        XCTAssertEqual(RootineAPNsEnvironment(rawValue: "sandbox"), .sandbox)
        XCTAssertEqual(RootineAPNsEnvironment(rawValue: "production"), .production)
        XCTAssertNil(RootineAPNsEnvironment(rawValue: "development"))
        XCTAssertEqual(RootineAPNsEnvironment.sandbox.appleEntitlementValue, "development")
        XCTAssertEqual(RootineAPNsEnvironment.production.appleEntitlementValue, "production")
    }

    func testNotificationPermissionMappingDoesNotTreatDenialAsRegistrationFailure() {
        XCTAssertFalse(RootineNotificationPermissionState.denied.canRegisterWithAPNs)
        XCTAssertFalse(RootineNotificationPermissionState.notDetermined.canRegisterWithAPNs)
        XCTAssertTrue(RootineNotificationPermissionState.authorized.canRegisterWithAPNs)
        XCTAssertTrue(RootineNotificationPermissionState.provisional.canRegisterWithAPNs)
    }

    func testAPNsTokenIsNormalizedToPrivateHexString() {
        RootinePushRegistry.shared.update(tokenData: Data([0x00, 0xAB, 0xFF]))
        XCTAssertEqual(RootinePushRegistry.shared.tokenString(), "00abff")
    }

    func testNewDeviceIdentityUsesPrefixedLowercaseUUIDv4() {
        let identifier = RootineDeviceIdentityStore.makeIdentifier()

        XCTAssertTrue(identifier.hasPrefix("ios_"))
        XCTAssertEqual(identifier, identifier.lowercased())
        XCTAssertTrue(RootineDeviceIdentityStore.isV3Identifier(identifier))
        XCTAssertFalse(RootineDeviceIdentityStore.isLegacyIdentifier(identifier))
    }

    func testDeviceRegistrationResponseNeverModelsAnAPNsToken() throws {
        let response = RootineDeviceRegistration(
            deviceID: "installation-1",
            platform: "ios",
            appVersion: "1.2.3",
            apnsEnvironment: .sandbox,
            permissionState: .authorized,
            lastSeenAt: "2026-09-02T12:00:00Z",
            revokedAt: nil
        )
        let encoded = try JSONEncoder().encode(response)
        let json = try XCTUnwrap(JSONSerialization.jsonObject(with: encoded) as? [String: Any])
        XCTAssertNil(json["apns_token"])
        XCTAssertEqual(json["apns_environment"] as? String, "sandbox")
    }

    func testSyncV3FeatureFlagsDefaultToOffWithExplicitSource() {
        let flags = RootineFeatureFlags.disabled

        XCTAssertFalse(flags.isEnabled(.normalizedSyncEnabled))
        XCTAssertFalse(flags.isEnabled(.normalizedReadEnabled))
        XCTAssertFalse(flags.isEnabled(.notificationsEnabled))
        XCTAssertEqual(flags.value(for: .normalizedSyncEnabled).source, .default)
    }

    func testSyncV3FeatureFlagCanRepresentAnAccountScopedOverride() {
        let flags = RootineFeatureFlags(
            environment: .staging,
            values: [
                .normalizedSyncEnabled: RootineFeatureFlagValue(enabled: true, source: .account),
                .normalizedReadEnabled: RootineFeatureFlagValue(enabled: false, source: .environment),
                .notificationsEnabled: RootineFeatureFlagValue(enabled: false, source: .default),
            ]
        )

        XCTAssertTrue(flags.isEnabled(.normalizedSyncEnabled))
        XCTAssertEqual(flags.value(for: .normalizedSyncEnabled).source, .account)
        XCTAssertEqual(flags.environment, .staging)
    }

    @MainActor
    func testAccountStateRefreshAndIdentityOwnershipGuardsUseTheAuthMock() async throws {
        let emailIdentity = SupabaseIdentity(identityID: "email-identity", provider: "email")
        let googleIdentity = SupabaseIdentity(identityID: "google-identity", provider: "google")
        let session = makeSession(user: SupabaseUser(
            id: "user-1",
            email: "ola@example.com",
            emailConfirmedAt: "2026-09-01T00:00:00Z",
            identities: [emailIdentity]
        ))
        let store = InMemorySessionStore(session: session)
        let auth = MockRootineAuthClient()
        auth.identitiesValue = [emailIdentity, googleIdentity]
        let environment = AppEnvironment(
            configuration: RootineConfiguration(
                supabaseURL: URL(string: "https://project.supabase.co"),
                supabasePublishableKey: "publishable",
                backendURL: nil,
                authCallbackScheme: "rootine",
                appleClientID: "app.rootine.ios"
            ),
            keychain: store,
            authClient: auth
        )

        try await environment.refreshAccountState()
        XCTAssertEqual(environment.accountState?.linkedProviders, Set<RootineIdentityProvider>([.email, .google]))
        XCTAssertEqual(environment.session?.user.identities?.count, 2)

        try await environment.unlinkIdentity("google-identity")
        XCTAssertEqual(auth.unlinkedIdentityIDs, ["google-identity"])
        XCTAssertEqual(environment.session?.user.identities?.map(\.identityID), ["email-identity"])

        do {
            try await environment.unlinkIdentity("google-identity")
            XCTFail("An already removed identity should be rejected before the network call")
        } catch let error as RootineAPIError {
            XCTAssertEqual(error, .identityNotFound)
        }
    }

    @MainActor
    func testAccountStateCannotUnlinkItsLastIdentity() async throws {
        let identity = SupabaseIdentity(identityID: "email-identity", provider: "email")
        let store = InMemorySessionStore(session: makeSession(user: SupabaseUser(
            id: "user-1",
            email: "ola@example.com",
            emailConfirmedAt: nil,
            identities: [identity]
        )))
        let auth = MockRootineAuthClient()
        let environment = AppEnvironment(
            configuration: RootineConfiguration(
                supabaseURL: URL(string: "https://project.supabase.co"),
                supabasePublishableKey: "publishable",
                backendURL: nil,
                authCallbackScheme: "rootine",
                appleClientID: "app.rootine.ios"
            ),
            keychain: store,
            authClient: auth
        )

        do {
            try await environment.unlinkIdentity("email-identity")
            XCTFail("The last identity must remain linked")
        } catch let error as RootineAPIError {
            XCTAssertEqual(error, .lastIdentityNotDeletable)
        }
        XCTAssertTrue(auth.unlinkedIdentityIDs.isEmpty)
    }

    private func makeJWT(header: [String: Any], payload: [String: Any]) -> String {
        func encoded(_ object: [String: Any]) -> String {
            let data = try! JSONSerialization.data(withJSONObject: object, options: [.sortedKeys])
            return data.base64EncodedString()
                .replacingOccurrences(of: "+", with: "-")
                .replacingOccurrences(of: "/", with: "_")
                .replacingOccurrences(of: "=", with: "")
        }
        return "\(encoded(header)).\(encoded(payload)).c2lnbmF0dXJl"
    }

    private func makeSession(user: SupabaseUser) -> SupabaseSession {
        SupabaseSession(
            accessToken: "access",
            refreshToken: "refresh",
            expiresIn: 3_600,
            expiresAt: Int(Date().timeIntervalSince1970) + 3_600,
            tokenType: "bearer",
            user: user
        )
    }
}

private final class InMemorySessionStore: RootineSessionStore, @unchecked Sendable {
    var session: SupabaseSession?

    init(session: SupabaseSession?) {
        self.session = session
    }

    func load() -> SupabaseSession? { session }
    func save(_ session: SupabaseSession) throws { self.session = session }
    func clear() { session = nil }
}

private final class MockRootineAuthClient: RootineAuthClient, @unchecked Sendable {
    var identitiesValue: [SupabaseIdentity] = []
    var unlinkedIdentityIDs: [String] = []

    func signIn(email: String, password: String) async throws -> SupabaseSession { fatalError("unused") }
    func signUp(email: String, password: String) async throws -> EmailRegistrationResult { fatalError("unused") }
    func resendConfirmation(email: String) async throws { fatalError("unused") }
    func requestPasswordReset(email: String) async throws { fatalError("unused") }
    func updatePassword(_ password: String, accessToken: String) async throws { fatalError("unused") }
    func refreshSession(refreshToken: String) async throws -> SupabaseSession { fatalError("unused") }
    func signInWithApple(idToken: String, nonce: String) async throws -> SupabaseSession { fatalError("unused") }
    func googleAuthorizationURL() throws -> URL { fatalError("unused") }
    func session(from callbackURL: URL) async throws -> AuthCallbackResult { fatalError("unused") }
    func googleIdentityAuthorizationURL(accessToken: String) async throws -> URL { fatalError("unused") }
    func linkAppleIdentity(idToken: String, nonce: String, accessToken: String) async throws -> SupabaseSession { fatalError("unused") }
    func identities(accessToken: String) async throws -> [SupabaseIdentity] { identitiesValue }
    func unlinkIdentity(identityID: String, accessToken: String) async throws { unlinkedIdentityIDs.append(identityID) }
}
