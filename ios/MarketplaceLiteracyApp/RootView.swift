import SwiftUI

struct RootView: View {
    @StateObject private var webState = WebViewState()

    var body: some View {
        NavigationStack {
            ZStack {
                Color(.systemGroupedBackground)
                    .ignoresSafeArea()

                MLPWebView(url: NativeShellConfig.homeURL, state: webState)
                    .ignoresSafeArea(.container, edges: .bottom)

                if webState.isLoading {
                    loadingView
                }

                if webState.showOffline {
                    OfflineView {
                        webState.reload()
                    }
                    .transition(.opacity)
                }
            }
            .navigationTitle("Marketplace Literacy")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItemGroup(placement: .bottomBar) {
                    Button {
                        webState.goBack()
                    } label: {
                        Label("Back", systemImage: "chevron.backward")
                    }
                    .disabled(!webState.canGoBack)

                    Spacer()

                    Button {
                        webState.loadHome()
                    } label: {
                        Label("Home", systemImage: "house")
                    }

                    Spacer()

                    Button {
                        webState.reload()
                    } label: {
                        Label("Retry", systemImage: "arrow.clockwise")
                    }
                }
            }
        }
    }

    private var loadingView: some View {
        VStack(spacing: 12) {
            ProgressView()
                .controlSize(.large)
            Text("Loading Marketplace Literacy resources")
                .font(.subheadline)
                .foregroundStyle(.secondary)
        }
        .padding(20)
        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 18))
    }
}

#Preview {
    RootView()
}

