import AuthenticationServices
import SwiftUI

enum AuthRoute: Hashable {
    case signIn
    case signUp
    case resetPassword
    case confirmEmail(String)
    case newPassword
}

struct AuthenticationFlowView: View {
    @EnvironmentObject private var environment: AppEnvironment
    @State private var path: [AuthRoute] = []

    var body: some View {
        NavigationStack(path: $path) {
            AuthWelcomeView(path: $path)
                .navigationDestination(for: AuthRoute.self) { route in
                    switch route {
                    case .signIn:
                        EmailSignInView(path: $path)
                    case .signUp:
                        EmailSignUpView(path: $path)
                    case .resetPassword:
                        PasswordResetRequestView(path: $path)
                    case .confirmEmail(let email):
                        EmailConfirmationView(email: email, path: $path)
                    case .newPassword:
                        NewPasswordView()
                    }
                }
        }
        .onAppear { showRecoveryIfNeeded() }
        .onChange(of: environment.isPasswordRecovery) { _, _ in showRecoveryIfNeeded() }
    }

    private func showRecoveryIfNeeded() {
        if environment.isPasswordRecovery && path.last != .newPassword {
            path = [.newPassword]
        }
    }
}

struct AuthWelcomeView: View {
    @EnvironmentObject private var environment: AppEnvironment
    @Binding var path: [AuthRoute]
    @StateObject private var oauthSession = OAuthWebSession()
    @State private var appleNonce: String?
    @State private var pendingProvider: String?
    @State private var feedback: String?

    var body: some View {
        ScrollView {
            VStack(spacing: RootineTheme.Spacing.xLarge) {
                AuthBrandView()
                    .padding(.top, RootineTheme.Spacing.large)

                VStack(alignment: .leading, spacing: RootineTheme.Spacing.medium) {
                    Text("Codzienność nie mieści się w jednej liście")
                        .font(.system(.largeTitle, design: .rounded).weight(.bold))
                        .foregroundStyle(RootineTheme.ColorToken.primaryText)
                        .fixedSize(horizontal: false, vertical: true)

                    Text("Rootine łączy zadania, cele, rutyny i ważne sprawy w jeden osobisty system.")
                        .font(.title3)
                        .foregroundStyle(RootineTheme.ColorToken.secondaryText)
                        .fixedSize(horizontal: false, vertical: true)
                }
                .frame(maxWidth: .infinity, alignment: .leading)

                VStack(spacing: RootineTheme.Spacing.medium) {
                    ZStack {
                        SignInWithAppleButton(.continue, onRequest: prepareAppleRequest, onCompletion: completeAppleSignIn)
                            .signInWithAppleButtonStyle(.white)
                            .frame(height: 52)
                            .clipShape(RoundedRectangle(cornerRadius: RootineTheme.Radius.control, style: .continuous))
                            .opacity(pendingProvider == "apple" ? 0.45 : 1)
                            .disabled(!environment.configuration.isAuthComplete || pendingProvider != nil)

                        if pendingProvider == "apple" {
                            ProgressView().tint(RootineTheme.ColorToken.canvas)
                        }
                    }

                    Button(action: beginGoogleSignIn) {
                        HStack(spacing: 12) {
                            if pendingProvider == "google" {
                                ProgressView().tint(RootineTheme.ColorToken.primaryText)
                            } else {
                                Text("G")
                                    .font(.headline.weight(.bold))
                                    .accessibilityHidden(true)
                            }
                            Text(pendingProvider == "google" ? "Łączę z Google…" : "Kontynuuj z Google")
                        }
                    }
                    .buttonStyle(RootineSecondaryButtonStyle())
                    .disabled(!environment.configuration.isAuthComplete || pendingProvider != nil)

                    AuthDividerView()

                    NavigationLink(value: AuthRoute.signIn) {
                        Label("Zaloguj się e-mailem", systemImage: "envelope")
                    }
                    .buttonStyle(RootineSecondaryButtonStyle())
                    .disabled(pendingProvider != nil)
                }

                if !environment.configuration.isAuthComplete {
                    AuthFeedbackView(
                        message: "Logowanie wymaga uzupełnienia konfiguracji aplikacji na Macu.",
                        tone: .warning
                    )
                } else if let visibleFeedback = feedback ?? environment.authCallbackError {
                    AuthFeedbackView(message: visibleFeedback, tone: .error)
                }

                HStack(spacing: RootineTheme.Spacing.small) {
                    Text("Nie masz konta?")
                        .foregroundStyle(RootineTheme.ColorToken.secondaryText)
                    Button("Utwórz konto") { path.append(.signUp) }
                        .fontWeight(.semibold)
                        .disabled(pendingProvider != nil)
                }
                .font(.subheadline)
            }
            .frame(maxWidth: 520)
            .padding(.horizontal, RootineTheme.Spacing.large)
            .padding(.bottom, RootineTheme.Spacing.xLarge)
        }
        .background(RootineTheme.ColorToken.canvas.ignoresSafeArea())
        .navigationBarHidden(true)
    }

    private func prepareAppleRequest(_ request: ASAuthorizationAppleIDRequest) {
        feedback = nil
        environment.clearAuthCallbackError()
        do {
            let nonce = try AuthNonce.random()
            appleNonce = nonce
            request.requestedScopes = [.email]
            request.nonce = AuthNonce.hashed(nonce)
        } catch {
            appleNonce = nil
            feedback = RootineAPIError.invalidResponse.localizedDescription
        }
    }

    private func completeAppleSignIn(_ result: Result<ASAuthorization, Error>) {
        switch result {
        case .failure(let error):
            if let appleError = error as? ASAuthorizationError, appleError.code == .canceled {
                feedback = RootineAPIError.cancelled.localizedDescription
            } else {
                feedback = RootineAPIError.providerUnavailable.localizedDescription
            }
        case .success(let authorization):
            guard let credential = authorization.credential as? ASAuthorizationAppleIDCredential,
                  let tokenData = credential.identityToken,
                  let idToken = String(data: tokenData, encoding: .utf8),
                  let nonce = appleNonce else {
                feedback = RootineAPIError.invalidResponse.localizedDescription
                return
            }
            pendingProvider = "apple"
            Task {
                do {
                    try await environment.establishAppleSession(idToken: idToken, nonce: nonce)
                } catch {
                    feedback = error.localizedDescription
                }
                pendingProvider = nil
                appleNonce = nil
            }
        }
    }

    private func beginGoogleSignIn() {
        feedback = nil
        environment.clearAuthCallbackError()
        pendingProvider = "google"
        Task {
            do {
                let authorizationURL = try environment.googleAuthorizationURL()
                let callbackURL = try await oauthSession.start(
                    url: authorizationURL,
                    callbackScheme: environment.configuration.authCallbackScheme
                )
                try await environment.establishGoogleSession(callbackURL: callbackURL)
            } catch {
                feedback = error.localizedDescription
            }
            pendingProvider = nil
        }
    }
}

struct EmailSignInView: View {
    @EnvironmentObject private var environment: AppEnvironment
    @Binding var path: [AuthRoute]
    @State private var email = ""
    @State private var password = ""
    @State private var feedback: String?

    var body: some View {
        AuthFormPage {
            AuthScreenHeader(
                title: "Dobrze Cię widzieć",
                message: "Zaloguj się, aby wrócić do swoich danych."
            )

            AuthEmailField(text: $email)
            AuthPasswordField(label: "Hasło", text: $password, contentType: .password)

            if !environment.configuration.isAuthComplete {
                AuthFeedbackView(
                    message: "Logowanie wymaga uzupełnienia konfiguracji aplikacji na Macu.",
                    tone: .warning
                )
            }

            Button("Nie pamiętasz hasła?") { path.append(.resetPassword) }
                .font(.subheadline.weight(.semibold))
                .frame(maxWidth: .infinity, alignment: .trailing)
                .disabled(environment.isWorking)

            if let feedback {
                AuthFeedbackView(message: feedback, tone: .error)
            }

            Button(action: signIn) {
                AuthSubmitLabel(title: "Zaloguj się", pendingTitle: "Loguję…", pending: environment.isWorking)
            }
            .buttonStyle(RootinePrimaryButtonStyle())
            .disabled(environment.isWorking || !environment.configuration.isAuthComplete)

            AuthSwitchView(question: "Nie masz konta?", actionTitle: "Utwórz konto") {
                path = [.signUp]
            }
        }
        .navigationTitle("Logowanie")
        .navigationBarTitleDisplayMode(.inline)
    }

    private func signIn() {
        feedback = nil
        guard AuthInputValidator.isValidEmail(email) else {
            feedback = "Wpisz poprawny adres e-mail."
            return
        }
        guard !password.isEmpty else {
            feedback = "Wpisz hasło."
            return
        }
        Task {
            do {
                try await environment.establishEmailSession(email: email, password: password)
            } catch {
                feedback = error.localizedDescription
            }
        }
    }
}

struct EmailSignUpView: View {
    @EnvironmentObject private var environment: AppEnvironment
    @Binding var path: [AuthRoute]
    @State private var email = ""
    @State private var password = ""
    @State private var feedback: String?

    var body: some View {
        AuthFormPage {
            AuthScreenHeader(
                title: "Utwórz konto",
                message: "Zacznij od e-maila i hasła. Resztę ustawisz później."
            )

            AuthEmailField(text: $email)
            AuthPasswordField(label: "Hasło", text: $password, contentType: .newPassword)

            Text("Co najmniej 8 znaków.")
                .font(.footnote)
                .foregroundStyle(RootineTheme.ColorToken.secondaryText)
                .frame(maxWidth: .infinity, alignment: .leading)

            legalDocuments

            if !environment.configuration.isAuthComplete {
                AuthFeedbackView(
                    message: "Rejestracja wymaga uzupełnienia konfiguracji aplikacji na Macu.",
                    tone: .warning
                )
            }

            if let feedback {
                AuthFeedbackView(message: feedback, tone: .error)
            }

            Button(action: signUp) {
                AuthSubmitLabel(title: "Utwórz konto", pendingTitle: "Tworzę konto…", pending: environment.isWorking)
            }
            .buttonStyle(RootinePrimaryButtonStyle())
            .disabled(
                environment.isWorking
                    || !environment.configuration.isAuthComplete
                    || !environment.configuration.hasLegalDocuments
            )

            AuthSwitchView(question: "Masz już konto?", actionTitle: "Zaloguj się") {
                path = [.signIn]
            }
        }
        .navigationTitle("Rejestracja")
        .navigationBarTitleDisplayMode(.inline)
    }

    @ViewBuilder
    private var legalDocuments: some View {
        if let termsURL = environment.configuration.termsURL,
           let privacyURL = environment.configuration.privacyURL {
            VStack(alignment: .leading, spacing: RootineTheme.Spacing.small) {
                Text("Tworząc konto, akceptujesz dokumenty Rootine:")
                    .font(.footnote)
                    .foregroundStyle(RootineTheme.ColorToken.secondaryText)
                HStack(spacing: RootineTheme.Spacing.medium) {
                    Link("Regulamin", destination: termsURL)
                    Link("Polityka prywatności", destination: privacyURL)
                }
                .font(.footnote.weight(.semibold))
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        } else {
            AuthFeedbackView(
                message: "Rejestracja będzie dostępna po podłączeniu Regulaminu i Polityki prywatności.",
                tone: .warning
            )
        }
    }

    private func signUp() {
        feedback = nil
        guard AuthInputValidator.isValidEmail(email) else {
            feedback = "Wpisz poprawny adres e-mail."
            return
        }
        if let passwordError = AuthInputValidator.passwordError(password) {
            feedback = passwordError
            return
        }
        Task {
            do {
                let needsConfirmation = try await environment.register(email: email, password: password)
                if needsConfirmation {
                    password = ""
                    path.append(.confirmEmail(AuthInputValidator.normalizedEmail(email)))
                }
            } catch {
                feedback = error.localizedDescription
            }
        }
    }
}

struct EmailConfirmationView: View {
    @EnvironmentObject private var environment: AppEnvironment
    let email: String
    @Binding var path: [AuthRoute]
    @State private var isSending = false
    @State private var feedback: String?
    @State private var didResend = false

    var body: some View {
        AuthFormPage {
            Image(systemName: "envelope.badge")
                .font(.system(size: 42, weight: .medium))
                .foregroundStyle(RootineTheme.ColorToken.action)
                .accessibilityHidden(true)

            AuthScreenHeader(
                title: "Sprawdź pocztę",
                message: "Wysłaliśmy link potwierdzający na \(email). Po potwierdzeniu Rootine otworzy się automatycznie."
            )

            if didResend {
                AuthFeedbackView(message: "Wiadomość została wysłana ponownie.", tone: .success)
            } else if let feedback {
                AuthFeedbackView(message: feedback, tone: .error)
            }

            Button(action: resend) {
                AuthSubmitLabel(title: "Wyślij ponownie", pendingTitle: "Wysyłam…", pending: isSending)
            }
            .buttonStyle(RootineSecondaryButtonStyle())
            .disabled(isSending)

            Button("Przejdź do logowania") { path = [.signIn] }
                .buttonStyle(RootinePrimaryButtonStyle())

            Button("Zmień adres e-mail") { path = [.signUp] }
                .font(.subheadline.weight(.semibold))
                .frame(maxWidth: .infinity)
        }
        .navigationTitle("Potwierdzenie e-maila")
        .navigationBarTitleDisplayMode(.inline)
    }

    private func resend() {
        feedback = nil
        didResend = false
        isSending = true
        Task {
            do {
                try await environment.resendConfirmation(email: email)
                didResend = true
            } catch {
                feedback = error.localizedDescription
            }
            isSending = false
        }
    }
}

struct PasswordResetRequestView: View {
    @EnvironmentObject private var environment: AppEnvironment
    @Binding var path: [AuthRoute]
    @State private var email = ""
    @State private var feedback: String?
    @State private var didSend = false

    var body: some View {
        AuthFormPage {
            AuthScreenHeader(
                title: "Odzyskaj hasło",
                message: "Wyślemy Ci bezpieczny link do ustawienia nowego hasła."
            )

            AuthEmailField(text: $email)

            if didSend {
                AuthFeedbackView(
                    message: "Jeśli konto z tym adresem istnieje, wyślemy na nie link do ustawienia nowego hasła.",
                    tone: .success
                )
            } else if let feedback {
                AuthFeedbackView(message: feedback, tone: .error)
            }

            Button(action: requestReset) {
                AuthSubmitLabel(title: "Wyślij link", pendingTitle: "Wysyłam…", pending: environment.isWorking)
            }
            .buttonStyle(RootinePrimaryButtonStyle())
            .disabled(environment.isWorking || didSend)

            Button("Wróć do logowania") { path = [.signIn] }
                .font(.subheadline.weight(.semibold))
                .frame(maxWidth: .infinity)
        }
        .navigationTitle("Reset hasła")
        .navigationBarTitleDisplayMode(.inline)
    }

    private func requestReset() {
        feedback = nil
        guard AuthInputValidator.isValidEmail(email) else {
            feedback = "Wpisz poprawny adres e-mail, na który wyślemy link do zmiany hasła."
            return
        }
        Task {
            do {
                try await environment.requestPasswordReset(email: email)
                didSend = true
            } catch {
                feedback = error.localizedDescription
            }
        }
    }
}

struct NewPasswordView: View {
    @EnvironmentObject private var environment: AppEnvironment
    @State private var password = ""
    @State private var confirmation = ""
    @State private var feedback: String?

    var body: some View {
        AuthFormPage {
            AuthScreenHeader(
                title: "Ustaw nowe hasło",
                message: "Wybierz hasło, którego nie używasz w innych serwisach."
            )

            AuthPasswordField(label: "Nowe hasło", text: $password, contentType: .newPassword)
            AuthPasswordField(label: "Powtórz nowe hasło", text: $confirmation, contentType: .newPassword)

            if let feedback {
                AuthFeedbackView(message: feedback, tone: .error)
            }

            Button(action: updatePassword) {
                AuthSubmitLabel(title: "Zapisz nowe hasło", pendingTitle: "Zapisuję…", pending: environment.isWorking)
            }
            .buttonStyle(RootinePrimaryButtonStyle())
            .disabled(environment.isWorking)

            Button("Wróć do logowania") { environment.cancelPasswordRecovery() }
                .font(.subheadline.weight(.semibold))
                .frame(maxWidth: .infinity)
                .disabled(environment.isWorking)
        }
        .navigationTitle("Nowe hasło")
        .navigationBarTitleDisplayMode(.inline)
        .navigationBarBackButtonHidden(true)
    }

    private func updatePassword() {
        feedback = nil
        if let passwordError = AuthInputValidator.passwordError(password) {
            feedback = passwordError
            return
        }
        guard password == confirmation else {
            feedback = "Hasła nie są takie same. Wpisz je ponownie."
            return
        }
        Task {
            do {
                try await environment.completePasswordRecovery(password: password)
            } catch {
                feedback = error.localizedDescription
            }
        }
    }
}

struct AuthLaunchView: View {
    let message: String
    @State private var isTakingLonger = false

    var body: some View {
        VStack(spacing: RootineTheme.Spacing.large) {
            AuthBrandView()
            ProgressView()
                .controlSize(.large)
                .tint(RootineTheme.ColorToken.action)
            Text(isTakingLonger ? "To trwa dłużej niż zwykle. Nadal pracuję…" : message)
                .font(.subheadline)
                .foregroundStyle(RootineTheme.ColorToken.secondaryText)
                .multilineTextAlignment(.center)
        }
        .padding(RootineTheme.Spacing.large)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(RootineTheme.ColorToken.canvas.ignoresSafeArea())
        .task {
            do {
                try await Task.sleep(nanoseconds: 10_000_000_000)
            } catch {
                return
            }
            isTakingLonger = true
        }
    }
}

private struct AuthBrandView: View {
    var body: some View {
        HStack(spacing: 10) {
            Text("R")
                .font(.headline.weight(.bold))
                .foregroundStyle(RootineTheme.ColorToken.canvas)
                .frame(width: 34, height: 34)
                .background(RootineTheme.ColorToken.primaryText)
                .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
                .accessibilityHidden(true)
            Text("Rootine")
                .font(.title3.weight(.bold))
                .foregroundStyle(RootineTheme.ColorToken.primaryText)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityElement(children: .combine)
        .accessibilityLabel("Rootine")
    }
}

private struct AuthFormPage<Content: View>: View {
    let content: Content

    init(@ViewBuilder content: () -> Content) {
        self.content = content()
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: RootineTheme.Spacing.medium) {
                content
            }
            .frame(maxWidth: 520, alignment: .leading)
            .padding(RootineTheme.Spacing.large)
        }
        .scrollDismissesKeyboard(.interactively)
        .background(RootineTheme.ColorToken.canvas.ignoresSafeArea())
    }
}

private struct AuthScreenHeader: View {
    let title: String
    let message: String

    var body: some View {
        VStack(alignment: .leading, spacing: RootineTheme.Spacing.small) {
            Text(title)
                .font(.title.bold())
                .foregroundStyle(RootineTheme.ColorToken.primaryText)
            Text(message)
                .font(.body)
                .foregroundStyle(RootineTheme.ColorToken.secondaryText)
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(.bottom, RootineTheme.Spacing.small)
    }
}

private struct AuthEmailField: View {
    @Binding var text: String

    var body: some View {
        VStack(alignment: .leading, spacing: RootineTheme.Spacing.small) {
            Text("Adres e-mail").font(.subheadline.weight(.semibold))
            TextField("ty@przyklad.pl", text: $text)
                .textContentType(.emailAddress)
                .keyboardType(.emailAddress)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
                .padding(.horizontal, 14)
                .frame(minHeight: 52)
                .background(RootineTheme.ColorToken.surface)
                .clipShape(RoundedRectangle(cornerRadius: RootineTheme.Radius.control, style: .continuous))
                .overlay {
                    RoundedRectangle(cornerRadius: RootineTheme.Radius.control, style: .continuous)
                        .stroke(RootineTheme.ColorToken.separator, lineWidth: 1)
                }
        }
    }
}

private struct AuthPasswordField: View {
    let label: String
    @Binding var text: String
    let contentType: UITextContentType
    @State private var isRevealed = false

    var body: some View {
        VStack(alignment: .leading, spacing: RootineTheme.Spacing.small) {
            Text(label).font(.subheadline.weight(.semibold))
            HStack(spacing: RootineTheme.Spacing.small) {
                Group {
                    if isRevealed {
                        TextField(label, text: $text)
                    } else {
                        SecureField(label, text: $text)
                    }
                }
                .textContentType(contentType)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()

                Button {
                    isRevealed.toggle()
                } label: {
                    Image(systemName: isRevealed ? "eye.slash" : "eye")
                        .frame(width: 44, height: 44)
                }
                .accessibilityLabel(isRevealed ? "Ukryj hasło" : "Pokaż hasło")
            }
            .padding(.leading, 14)
            .padding(.trailing, 4)
            .frame(minHeight: 52)
            .background(RootineTheme.ColorToken.surface)
            .clipShape(RoundedRectangle(cornerRadius: RootineTheme.Radius.control, style: .continuous))
            .overlay {
                RoundedRectangle(cornerRadius: RootineTheme.Radius.control, style: .continuous)
                    .stroke(RootineTheme.ColorToken.separator, lineWidth: 1)
            }
        }
    }
}

private struct AuthDividerView: View {
    var body: some View {
        HStack(spacing: RootineTheme.Spacing.medium) {
            Rectangle().fill(RootineTheme.ColorToken.separator).frame(height: 1)
            Text("lub")
                .font(.footnote)
                .foregroundStyle(RootineTheme.ColorToken.secondaryText)
            Rectangle().fill(RootineTheme.ColorToken.separator).frame(height: 1)
        }
        .accessibilityHidden(true)
    }
}

private struct AuthSwitchView: View {
    let question: String
    let actionTitle: String
    let action: () -> Void

    var body: some View {
        HStack(spacing: RootineTheme.Spacing.small) {
            Text(question).foregroundStyle(RootineTheme.ColorToken.secondaryText)
            Button(actionTitle, action: action).fontWeight(.semibold)
        }
        .font(.subheadline)
        .frame(maxWidth: .infinity)
        .padding(.top, RootineTheme.Spacing.small)
    }
}

private struct AuthSubmitLabel: View {
    let title: String
    let pendingTitle: String
    let pending: Bool

    var body: some View {
        HStack(spacing: RootineTheme.Spacing.small) {
            if pending { ProgressView().tint(.white) }
            Text(pending ? pendingTitle : title)
            if !pending {
                Image(systemName: "arrow.right")
                    .accessibilityHidden(true)
            }
        }
    }
}

private enum AuthFeedbackTone {
    case error
    case warning
    case success
}

private struct AuthFeedbackView: View {
    let message: String
    let tone: AuthFeedbackTone

    private var color: Color {
        switch tone {
        case .error: return RootineTheme.ColorToken.destructive
        case .warning: return RootineTheme.ColorToken.warning
        case .success: return RootineTheme.ColorToken.success
        }
    }

    private var icon: String {
        switch tone {
        case .error: return "exclamationmark.circle.fill"
        case .warning: return "exclamationmark.triangle.fill"
        case .success: return "checkmark.circle.fill"
        }
    }

    var body: some View {
        Label(message, systemImage: icon)
            .font(.footnote)
            .foregroundStyle(color)
            .fixedSize(horizontal: false, vertical: true)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(RootineTheme.Spacing.medium)
            .background(color.opacity(0.10))
            .clipShape(RoundedRectangle(cornerRadius: RootineTheme.Radius.control, style: .continuous))
    }
}

private struct RootinePrimaryButtonStyle: ButtonStyle {
    @Environment(\.isEnabled) private var isEnabled

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.headline)
            .foregroundStyle(.white)
            .frame(maxWidth: .infinity, minHeight: 52)
            .background(RootineTheme.ColorToken.action.opacity(configuration.isPressed ? 0.72 : 1))
            .clipShape(RoundedRectangle(cornerRadius: RootineTheme.Radius.control, style: .continuous))
            .opacity(isEnabled ? 1 : 0.45)
    }
}

private struct RootineSecondaryButtonStyle: ButtonStyle {
    @Environment(\.isEnabled) private var isEnabled

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.headline)
            .foregroundStyle(RootineTheme.ColorToken.primaryText)
            .frame(maxWidth: .infinity, minHeight: 52)
            .background(RootineTheme.ColorToken.surface.opacity(configuration.isPressed ? 0.72 : 1))
            .clipShape(RoundedRectangle(cornerRadius: RootineTheme.Radius.control, style: .continuous))
            .overlay {
                RoundedRectangle(cornerRadius: RootineTheme.Radius.control, style: .continuous)
                    .stroke(RootineTheme.ColorToken.separator, lineWidth: 1)
            }
            .opacity(isEnabled ? 1 : 0.45)
    }
}
