import SafariServices
import SwiftUI

// Use the existing Studio portal, including its sign-in, uploads and project tools.
struct StudioBrowser: UIViewControllerRepresentable {
    let url: URL

    func makeUIViewController(context: Context) -> SFSafariViewController {
        SFSafariViewController(url: url)
    }

    func updateUIViewController(_ controller: SFSafariViewController, context: Context) {}
}
