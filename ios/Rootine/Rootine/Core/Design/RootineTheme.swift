import SwiftUI

enum RootineTheme {
    enum ColorToken {
        static let canvas = Color(uiColor: .systemGroupedBackground)
        static let surface = Color(uiColor: .secondarySystemGroupedBackground)
        static let elevated = Color(uiColor: .tertiarySystemGroupedBackground)
        static let separator = Color(uiColor: .separator)
        static let primaryText = Color(uiColor: .label)
        static let secondaryText = Color(uiColor: .secondaryLabel)
        static let action = Color(uiColor: .systemBlue)
        static let success = Color(uiColor: .systemGreen)
        static let warning = Color(uiColor: .systemOrange)
        static let destructive = Color(uiColor: .systemRed)
    }

    enum Spacing {
        static let xSmall: CGFloat = 4
        static let small: CGFloat = 8
        static let medium: CGFloat = 16
        static let large: CGFloat = 24
        static let xLarge: CGFloat = 32
    }

    enum Radius {
        static let control: CGFloat = 10
        static let surface: CGFloat = 16
    }
}

struct RootineSurfaceModifier: ViewModifier {
    func body(content: Content) -> some View {
        content
            .padding(RootineTheme.Spacing.medium)
            .background(RootineTheme.ColorToken.surface)
            .clipShape(RoundedRectangle(cornerRadius: RootineTheme.Radius.surface, style: .continuous))
            .overlay {
                RoundedRectangle(cornerRadius: RootineTheme.Radius.surface, style: .continuous)
                    .stroke(RootineTheme.ColorToken.separator, lineWidth: 1)
            }
    }
}

extension View {
    func rootineSurface() -> some View {
        modifier(RootineSurfaceModifier())
    }
}

struct RootinePrimaryButton: View {
    let title: String
    let systemImage: String?
    let isWorking: Bool
    let action: () -> Void

    init(
        _ title: String,
        systemImage: String? = nil,
        isWorking: Bool = false,
        action: @escaping () -> Void
    ) {
        self.title = title
        self.systemImage = systemImage
        self.isWorking = isWorking
        self.action = action
    }

    var body: some View {
        Button(action: action) {
            RootineButtonLabel(title: title, systemImage: systemImage, isWorking: isWorking)
        }
        .buttonStyle(.borderedProminent)
        .tint(RootineTheme.ColorToken.action)
        .disabled(isWorking)
    }
}

struct RootineSecondaryButton: View {
    let title: String
    let systemImage: String?
    let action: () -> Void

    init(
        _ title: String,
        systemImage: String? = nil,
        action: @escaping () -> Void
    ) {
        self.title = title
        self.systemImage = systemImage
        self.action = action
    }

    var body: some View {
        Button(action: action) {
            RootineButtonLabel(title: title, systemImage: systemImage, isWorking: false)
        }
        .buttonStyle(.bordered)
        .tint(RootineTheme.ColorToken.action)
    }
}

private struct RootineButtonLabel: View {
    let title: String
    let systemImage: String?
    let isWorking: Bool

    var body: some View {
        HStack(spacing: RootineTheme.Spacing.small) {
            if isWorking {
                ProgressView()
                    .controlSize(.small)
            } else if let systemImage {
                Image(systemName: systemImage)
            }
            Text(title)
                .font(.headline)
        }
        .frame(maxWidth: .infinity, minHeight: 44)
        .contentShape(Rectangle())
    }
}

struct RootineEmptyState: View {
    let title: String
    let message: String
    let systemImage: String
    let actionTitle: String?
    let action: (() -> Void)?

    init(
        title: String,
        message: String,
        systemImage: String,
        actionTitle: String? = nil,
        action: (() -> Void)? = nil
    ) {
        self.title = title
        self.message = message
        self.systemImage = systemImage
        self.actionTitle = actionTitle
        self.action = action
    }

    var body: some View {
        RootineStateView(
            title: title,
            message: message,
            systemImage: systemImage,
            tint: RootineTheme.ColorToken.secondaryText,
            actionTitle: actionTitle,
            action: action
        )
    }
}

struct RootineErrorState: View {
    let title: String
    let message: String
    let retryTitle: String
    let onRetry: () -> Void

    init(
        title: String = "Nie udało się wczytać danych",
        message: String,
        retryTitle: String = "Spróbuj ponownie",
        onRetry: @escaping () -> Void
    ) {
        self.title = title
        self.message = message
        self.retryTitle = retryTitle
        self.onRetry = onRetry
    }

    var body: some View {
        RootineStateView(
            title: title,
            message: message,
            systemImage: "exclamationmark.triangle",
            tint: RootineTheme.ColorToken.destructive,
            actionTitle: retryTitle,
            action: onRetry
        )
    }
}

private struct RootineStateView: View {
    let title: String
    let message: String
    let systemImage: String
    let tint: Color
    let actionTitle: String?
    let action: (() -> Void)?

    var body: some View {
        VStack(spacing: RootineTheme.Spacing.medium) {
            Image(systemName: systemImage)
                .font(.largeTitle)
                .foregroundStyle(tint)
                .accessibilityHidden(true)

            VStack(spacing: RootineTheme.Spacing.xSmall) {
                Text(title)
                    .font(.headline)
                    .foregroundStyle(RootineTheme.ColorToken.primaryText)
                    .multilineTextAlignment(.center)
                Text(message)
                    .font(.body)
                    .foregroundStyle(RootineTheme.ColorToken.secondaryText)
                    .multilineTextAlignment(.center)
            }

            if let actionTitle, let action {
                RootineSecondaryButton(actionTitle, action: action)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .frame(maxWidth: .infinity)
        .padding(RootineTheme.Spacing.large)
        .accessibilityElement(children: .contain)
    }
}

struct RootineOfflineBanner: View {
    let message: String

    init(message: String = "Pracujesz offline. Zmiany zsynchronizują się po odzyskaniu połączenia.") {
        self.message = message
    }

    var body: some View {
        Label(message, systemImage: "wifi.slash")
            .font(.subheadline)
            .foregroundStyle(RootineTheme.ColorToken.primaryText)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(RootineTheme.Spacing.medium)
            .background(RootineTheme.ColorToken.warning.opacity(0.16))
            .clipShape(RoundedRectangle(cornerRadius: RootineTheme.Radius.control, style: .continuous))
            .accessibilityElement(children: .combine)
    }
}

struct RootineUndoBanner: View {
    let message: String
    let undoTitle: String
    let onUndo: () -> Void

    init(
        message: String,
        undoTitle: String = "Cofnij",
        onUndo: @escaping () -> Void
    ) {
        self.message = message
        self.undoTitle = undoTitle
        self.onUndo = onUndo
    }

    var body: some View {
        HStack(spacing: RootineTheme.Spacing.medium) {
            Text(message)
                .font(.subheadline)
                .foregroundStyle(RootineTheme.ColorToken.primaryText)
                .frame(maxWidth: .infinity, alignment: .leading)

            Button(undoTitle, action: onUndo)
                .font(.headline)
                .frame(minWidth: 44, minHeight: 44)
        }
        .padding(.leading, RootineTheme.Spacing.medium)
        .padding(.trailing, RootineTheme.Spacing.small)
        .background(.regularMaterial)
        .clipShape(RoundedRectangle(cornerRadius: RootineTheme.Radius.control, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: RootineTheme.Radius.control, style: .continuous)
                .stroke(RootineTheme.ColorToken.separator, lineWidth: 1)
        }
    }
}
