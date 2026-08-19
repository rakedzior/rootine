import SwiftUI

enum RootineTheme {
    enum ColorToken {
        static let canvas = Color(red: 0.035, green: 0.043, blue: 0.055)
        static let surface = Color(red: 0.070, green: 0.082, blue: 0.102)
        static let elevated = Color(red: 0.100, green: 0.116, blue: 0.142)
        static let separator = Color.white.opacity(0.10)
        static let primaryText = Color.white.opacity(0.94)
        static let secondaryText = Color.white.opacity(0.62)
        static let action = Color(red: 0.247, green: 0.549, blue: 1.0)
        static let success = Color(red: 0.286, green: 0.745, blue: 0.522)
        static let warning = Color(red: 0.886, green: 0.655, blue: 0.278)
        static let destructive = Color(red: 0.929, green: 0.329, blue: 0.361)
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
