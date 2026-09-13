import Foundation

enum NativeShellConfig {
    static let homeURL = URL(string: "https://marketplaceliteracyapp.org/")!

    static let allowedInternalHosts: Set<String> = [
        "marketplaceliteracyapp.org",
        "www.marketplaceliteracyapp.org"
    ]

    static let youtubeHosts: Set<String> = [
        "youtube.com",
        "www.youtube.com",
        "m.youtube.com",
        "youtu.be",
        "youtube-nocookie.com",
        "www.youtube-nocookie.com"
    ]

    static let externalHosts: Set<String> = [
        "marketplaceliteracy.org",
        "www.marketplaceliteracy.org"
    ]

    static func isInternal(_ url: URL) -> Bool {
        guard let host = url.host?.lowercased() else {
            return false
        }

        return allowedInternalHosts.contains(host)
    }

    static func isYouTube(_ url: URL) -> Bool {
        guard url.scheme?.lowercased() == "https",
              let host = url.host?.lowercased() else {
            return false
        }

        return youtubeHosts.contains(host)
    }

    static func inAppYouTubePlaybackURL(for url: URL) -> URL? {
        guard isYouTube(url),
              let host = url.host?.lowercased() else {
            return nil
        }

        let pathParts = url.path.split(separator: "/").map(String.init)
        let videoID: String?

        if host == "youtu.be" {
            videoID = pathParts.first
        } else if pathParts.first == "watch" {
            videoID = URLComponents(url: url, resolvingAgainstBaseURL: false)?
                .queryItems?
                .first(where: { $0.name == "v" })?
                .value
        } else if pathParts.first == "shorts" || pathParts.first == "embed" {
            videoID = pathParts.dropFirst().first
        } else {
            videoID = nil
        }

        guard let videoID,
              !videoID.isEmpty,
              videoID.unicodeScalars.allSatisfy({
                  CharacterSet.alphanumerics.union(CharacterSet(charactersIn: "-_"))
                      .contains($0)
              }) else {
            return nil
        }

        var components = URLComponents()
        components.scheme = "https"
        components.host = "www.youtube.com"
        components.path = "/embed/\(videoID)"
        components.queryItems = [URLQueryItem(name: "playsinline", value: "1")]
        return components.url
    }

    static func isSupportedExternal(_ url: URL) -> Bool {
        guard let host = url.host?.lowercased() else {
            return false
        }

        return externalHosts.contains(host)
    }
}
