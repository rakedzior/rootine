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

    func testDeepLinkParserAcceptsKnownDestinationsWithoutRetainingAuthPayload() throws {
        let configuration = RootineConfiguration(
            supabaseURL: URL(string: "https://example.supabase.co"),
            supabasePublishableKey: "publishable",
            backendURL: URL(string: "https://app.example.com"),
            authCallbackScheme: "rootine",
            termsURL: nil,
            privacyURL: nil
        )

        XCTAssertEqual(
            RootineDeepLink.parse(URL(string: "rootine://tasks/42")!, configuration: configuration),
            .tasks(taskID: 42)
        )
        XCTAssertEqual(
            RootineDeepLink.parse(URL(string: "https://app.example.com/odzywianie/barcode/590123")!, configuration: configuration),
            .nutritionBarcode(code: "590123")
        )
        XCTAssertEqual(
            RootineDeepLink.parse(URL(string: "rootine://auth-callback#access_token=secret&refresh_token=secret")!, configuration: configuration),
            .authCallback
        )
        XCTAssertNil(RootineDeepLink.parse(URL(string: "https://evil.example.com/tasks/42")!, configuration: configuration))
        XCTAssertNil(RootineDeepLink.parse(URL(string: "rootine://tasks/0")!, configuration: configuration))
    }

    func testNotificationDeepLinkValidatesSchemaAndMapsToTasks() {
        XCTAssertEqual(
            RootineDeepLink.fromNotificationUserInfo([
                "rootine_schema_version": 1,
                "rootine_entity": "habit",
                "rootine_entity_id": "101"
            ]),
            .reminder(entity: .habit, entityID: "101")
        )
        XCTAssertNil(RootineDeepLink.fromNotificationUserInfo([
            "rootine_schema_version": 2,
            "rootine_entity": "task",
            "rootine_entity_id": "42"
        ]))
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

    func testLegacyDeviceIdentityRemainsReadableAcrossReinstall() {
        XCTAssertTrue(
            RootineDeviceIdentityStore.isLegacyIdentifier("123E4567-E89B-42D3-A456-426614174000")
        )
        XCTAssertFalse(RootineDeviceIdentityStore.isLegacyIdentifier("not-a-device"))
    }

    func testSessionValidationRejectsEmptySecretsWithoutPersistingThem() {
        let valid = SupabaseSession(
            accessToken: "access",
            refreshToken: "refresh",
            expiresIn: 3600,
            expiresAt: nil,
            tokenType: "bearer",
            user: SupabaseUser(id: "user", email: nil)
        )
        let invalid = SupabaseSession(
            accessToken: " ",
            refreshToken: "refresh",
            expiresIn: 3600,
            expiresAt: nil,
            tokenType: "bearer",
            user: SupabaseUser(id: "user", email: nil)
        )

        XCTAssertTrue(KeychainSessionStore.isUsable(valid))
        XCTAssertFalse(KeychainSessionStore.isUsable(invalid))
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

private final class InMemorySessionStore: RootineSessionStoring, @unchecked Sendable {
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
