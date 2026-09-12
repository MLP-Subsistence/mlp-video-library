import SwiftUI

struct OfflineView: View {
    let retry: () -> Void

    var body: some View {
        VStack(spacing: 18) {
            Image(systemName: "wifi.exclamationmark")
                .font(.system(size: 44, weight: .semibold))
                .foregroundStyle(Color(red: 0.68, green: 0.24, blue: 0.15))

            Text("You are offline")
                .font(.title2.bold())

            Text("Connect to the internet to browse Marketplace Literacy resources.")
                .font(.body)
                .multilineTextAlignment(.center)
                .foregroundStyle(.secondary)

            Button(action: retry) {
                Label("Try Again", systemImage: "arrow.clockwise")
                    .font(.headline)
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(.borderedProminent)
            .tint(Color(red: 0.68, green: 0.24, blue: 0.15))
        }
        .padding(24)
        .frame(maxWidth: 360)
        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 24))
        .padding()
    }
}

#Preview {
    OfflineView {}
}

