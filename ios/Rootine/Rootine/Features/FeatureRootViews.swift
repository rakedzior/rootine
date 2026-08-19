import SwiftUI

/// Internal-only diagnostic surface. It proves the app target, configuration,
/// environment object, dark tokens, and async bootstrap work without pretending
/// that any product screen has already been designed or accepted.
struct FoundationStatusView: View {
    let configured: Bool
    let hasStoredSession: Bool
    let message: String

    var body: some View {
        VStack(alignment: .leading, spacing: RootineTheme.Spacing.large) {
            Text("Rootine iOS")
                .font(.largeTitle.bold())
                .foregroundStyle(RootineTheme.ColorToken.primaryText)

            Text("Szkielet techniczny")
                .font(.title2.weight(.semibold))

            VStack(alignment: .leading, spacing: RootineTheme.Spacing.medium) {
                status("Konfiguracja klienta", ready: configured)
                status("Sesja w Keychain", ready: hasStoredSession)
                status("Kontrakty Codable", ready: true)
                status("Persistence i kolejka CAS", ready: true)
            }
            .rootineSurface()

            Text(message)
                .font(.footnote)
                .foregroundStyle(RootineTheme.ColorToken.secondaryText)

            Text("Następny pełny ekran powstanie dopiero po osobnej akceptacji projektu.")
                .font(.footnote)
                .foregroundStyle(RootineTheme.ColorToken.warning)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .padding(RootineTheme.Spacing.large)
        .background(RootineTheme.ColorToken.canvas.ignoresSafeArea())
    }

    private func status(_ label: String, ready: Bool) -> some View {
        Label(label, systemImage: ready ? "checkmark.circle.fill" : "circle.dashed")
            .foregroundStyle(ready ? RootineTheme.ColorToken.success : RootineTheme.ColorToken.secondaryText)
    }
}
