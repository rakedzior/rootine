import XCTest
@testable import Rootine

final class AuthenticationTests: XCTestCase {
    func testEmailValidationNormalizesAndRejectsIncompleteAddresses() {
        XCTAssertEqual(AuthInputValidator.normalizedEmail("  OLA@Example.COM "), "ola@example.com")
        XCTAssertTrue(AuthInputValidator.isValidEmail("ola@example.com"))
        XCTAssertFalse(AuthInputValidator.isValidEmail("ola@example"))
        XCTAssertFalse(AuthInputValidator.isValidEmail("ola example.com"))
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
}
