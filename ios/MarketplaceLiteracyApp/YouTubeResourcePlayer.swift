import SwiftUI
import WebKit

struct YouTubeResourcePlayer: View {
    let videoID: String
    @State private var status = "Loading video…"
    @State private var failed = false
    @State private var attempt = UUID()
    @Environment(\.openURL) private var openURL

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            YouTubeWebPlayer(videoID: videoID, status: $status, failed: $failed)
                .id(attempt)
                .aspectRatio(16 / 9, contentMode: .fit)
                .frame(minHeight: 200)
                .accessibilityIdentifier("youtube-player")

            if !status.isEmpty {
                Text(status)
                    .font(.subheadline)
                    .foregroundStyle(.primary)
                    .accessibilityIdentifier("playback-status")
            }

            if failed {
                HStack {
                    Button("Retry video") {
                        failed = false
                        status = "Loading video…"
                        attempt = UUID()
                    }
                    .buttonStyle(.bordered)
                    Button("Open on YouTube") {
                        if let url = URL(string: "https://www.youtube.com/watch?v=\(videoID)") {
                            openURL(url)
                        }
                    }
                    .buttonStyle(.bordered)
                }
            }
        }
    }
}

private struct YouTubeWebPlayer: UIViewRepresentable {
    let videoID: String
    @Binding var status: String
    @Binding var failed: Bool

    func makeCoordinator() -> Coordinator { Coordinator(parent: self) }

    func makeUIView(context: Context) -> WKWebView {
        let configuration = WKWebViewConfiguration()
        configuration.allowsInlineMediaPlayback = true
        // Selecting a resource is the user's playback action; no second native tap is required.
        configuration.mediaTypesRequiringUserActionForPlayback = []
        configuration.allowsPictureInPictureMediaPlayback = true
        configuration.userContentController.add(context.coordinator, name: "playback")
        let view = WKWebView(frame: .zero, configuration: configuration)
        view.navigationDelegate = context.coordinator
        view.scrollView.isScrollEnabled = false
        view.isOpaque = false
        view.backgroundColor = .black

        let appID = (Bundle.main.bundleIdentifier ?? "org.marketplaceliteracy.app").lowercased()
        let origin = "https://\(appID)"
        // A local HTML document with an HTTPS base URL preserves the app's identity
        // in iframe requests, as required by YouTube for WebView integrations.
        let safeID = String(videoID.filter { $0.isASCII && ($0.isLetter || $0.isNumber || $0 == "-" || $0 == "_") })
        view.loadHTMLString("""
        <!doctype html><html><head>
        <meta name="viewport" content="width=device-width,initial-scale=1">
        <meta name="referrer" content="strict-origin-when-cross-origin">
        <style>html,body{margin:0;width:100%;height:100%;background:#000}#player{width:100%;height:100%}</style>
        </head><body><div id="player"></div>
        <script>
        function report(state, code) {
          window.webkit.messageHandlers.playback.postMessage({state:state,code:code||0});
        }
        function onYouTubeIframeAPIReady() {
          window.player = new YT.Player('player', {
            host:'https://www.youtube-nocookie.com',
            videoId:'\(safeID)',
            playerVars:{autoplay:1,playsinline:1,controls:1,rel:0,origin:'\(origin)',widget_referrer:'\(origin)'},
            events:{
              onReady:function(event){report('ready');event.target.playVideo();},
              onStateChange:function(event){
                if(event.data===YT.PlayerState.PLAYING)report('playing');
                else if(event.data===YT.PlayerState.PAUSED)report('paused');
                else if(event.data===YT.PlayerState.ENDED)report('ended');
              },
              onAutoplayBlocked:function(){report('blocked');},
              onError:function(event){report('error',event.data);}
            }
          });
        }
        </script><script src="https://www.youtube.com/iframe_api" onerror="report('network')"></script>
        </body></html>
        """, baseURL: URL(string: origin))
        context.coordinator.beginLoadingTimeout()
        return view
    }

    func updateUIView(_ uiView: WKWebView, context: Context) {
        context.coordinator.parent = self
    }

    static func dismantleUIView(_ uiView: WKWebView, coordinator: Coordinator) {
        coordinator.timeout?.cancel()
        uiView.configuration.userContentController.removeScriptMessageHandler(forName: "playback")
        uiView.navigationDelegate = nil
        uiView.stopLoading()
        uiView.loadHTMLString("", baseURL: nil)
    }

    final class Coordinator: NSObject, WKScriptMessageHandler, WKNavigationDelegate {
        var parent: YouTubeWebPlayer
        var timeout: DispatchWorkItem?

        init(parent: YouTubeWebPlayer) { self.parent = parent }

        func beginLoadingTimeout() {
            let work = DispatchWorkItem { [weak self] in
                guard let self else { return }
                self.parent.status = "The video is taking too long to load. Check your connection and retry."
                self.parent.failed = true
            }
            timeout = work
            DispatchQueue.main.asyncAfter(deadline: .now() + 25, execute: work)
        }

        func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
            guard let event = message.body as? [String: Any], let state = event["state"] as? String else { return }
            timeout?.cancel()
            parent.failed = false
            switch state {
            case "ready": parent.status = "Starting video…"
            case "playing": parent.status = ""
            case "paused", "ended": parent.status = ""
            case "blocked": parent.status = "Tap Play in the video to start."
            case "error":
                parent.failed = true
                let code = event["code"] as? Int ?? 0
                parent.status = [101, 150].contains(code)
                    ? "This video cannot play inside the app. You can open it on YouTube."
                    : "YouTube could not load this video (\(code)). Retry or open it on YouTube."
            default:
                parent.failed = true
                parent.status = "The video could not load. Check your connection and retry."
            }
        }

        func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
            loadingFailed(error)
        }

        func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
            loadingFailed(error)
        }

        private func loadingFailed(_ error: Error) {
            guard (error as NSError).code != NSURLErrorCancelled else { return }
            timeout?.cancel()
            parent.failed = true
            parent.status = "The video could not load. Check your connection and retry."
        }
    }
}
