import SwiftUI

struct LibraryLocalization {
    let language: String
    static let languages = ["English", "French", "Hindi", "Spanish", "Swahili", "Telugu"]
    static let localeIDs = ["en", "fr", "hi", "es", "sw", "te"]
    static let nativeNames = ["English", "Français", "हिन्दी", "Español", "Kiswahili", "తెలుగు"]

    private var index: Int { Self.languages.firstIndex(of: language) ?? 0 }
    var localeID: String { Self.localeIDs[index] }
    var nativeName: String { Self.nativeNames[index] }

    private static let translations: [String: [String]] = {
        guard let url = Bundle.main.url(forResource: "LibraryTranslations", withExtension: "json"),
              let data = try? Data(contentsOf: url),
              let table = try? JSONDecoder().decode([String: [String]].self, from: data) else {
            preconditionFailure("Library translations are missing from the app bundle")
        }
        return table
    }()

    func text(_ key: String, _ arguments: CVarArg...) -> String {
        guard let values = Self.translations[key], values.count == Self.languages.count else {
            assertionFailure("Missing library translation: \(key)")
            return key
        }
        return String(format: values[index], locale: Locale(identifier: localeID), arguments: arguments)
    }

    func resourceCount(_ count: Int) -> String { text(count == 1 ? "resourceOne" : "resourcesMany", count) }
    func resourceHeading(_ count: Int) -> String { "\(text("resources")) (\(count))" }
    func formatName(_ name: String) -> String {
        let keys = ["Image Diaries": "imageDiaries", "Doodle": "doodle", "Animation": "animation",
                    "VideoScribe": "videoScribe", "Global": "global", "Vocations": "vocations", "Online": "online"]
        return keys[name].map { text($0) } ?? name
    }
    static func nativeName(for language: String) -> String {
        guard let index = languages.firstIndex(of: language) else { return language }
        return nativeNames[index]
    }
}

private struct LibraryLanguageKey: EnvironmentKey { static let defaultValue = "English" }
extension EnvironmentValues {
    var libraryLanguage: String {
        get { self[LibraryLanguageKey.self] }
        set { self[LibraryLanguageKey.self] = newValue }
    }
}
