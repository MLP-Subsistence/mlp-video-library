import Foundation

enum NativeShellConfig {
    static let homeURL = URL(string: "https://marketplaceliteracyapp.org/")!

    static let allowedInternalHosts: Set<String> = [
        "marketplaceliteracyapp.org",
        "www.marketplaceliteracyapp.org"
    ]

    static let externalHosts: Set<String> = [
        "youtube.com",
        "www.youtube.com",
        "m.youtube.com",
        "youtu.be",
        "marketplaceliteracy.org",
        "www.marketplaceliteracy.org"
    ]

    static func isInternal(_ url: URL) -> Bool {
        guard let host = url.host?.lowercased() else {
            return false
        }

        return allowedInternalHosts.contains(host)
    }

    static func isSupportedExternal(_ url: URL) -> Bool {
        guard let host = url.host?.lowercased() else {
            return false
        }

        return externalHosts.contains(host)
    }
}

