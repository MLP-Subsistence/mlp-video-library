import Combine
import Foundation

struct Lesson: Codable, Hashable, Identifiable {
    let id: String
    let title: String
    let description: String?
    let transcript: String?
    let resourceType: String
    let format: String
    let submenu: String?
    let category: String
    let duration: String?
    let tags: String
    let language: String
    let languageCode: String
    let languageOrder: Int
    let order: Int
    let thumbnailURL: URL?
    let youtubeVideoID: String?
    let directVideoURL: URL?

    var hasVideo: Bool { youtubeVideoID != nil || directVideoURL != nil }
}

private struct Catalog: Codable {
    let version: Int
    let lessons: [Lesson]
}

@MainActor
final class LearningStore: ObservableObject {
    @Published private(set) var lessons: [Lesson] = []
    @Published private(set) var isLoading = false
    @Published private(set) var isUsingCachedCatalog = false
    @Published var errorMessage: String?

    @Published private(set) var savedIDs: Set<String>
    @Published private(set) var completedIDs: Set<String>
    @Published private(set) var notes: [String: String]

    private let defaults = UserDefaults.standard
    private let catalogURL = URL(string: "https://marketplaceliteracyapp.org/api/mobile/catalog")!

    init() {
        savedIDs = Set(defaults.stringArray(forKey: "savedLessonIDs") ?? [])
        completedIDs = Set(defaults.stringArray(forKey: "completedLessonIDs") ?? [])
        notes = defaults.dictionary(forKey: "lessonNotes") as? [String: String] ?? [:]
        loadCachedCatalog()
    }

    var savedLessons: [Lesson] { lessons.filter { savedIDs.contains($0.id) } }
    var completedLessons: [Lesson] { lessons.filter { completedIDs.contains($0.id) } }

    func isSaved(_ lesson: Lesson) -> Bool { savedIDs.contains(lesson.id) }
    func isCompleted(_ lesson: Lesson) -> Bool { completedIDs.contains(lesson.id) }

    func toggleSaved(_ lesson: Lesson) {
        if !savedIDs.insert(lesson.id).inserted { savedIDs.remove(lesson.id) }
        defaults.set(Array(savedIDs), forKey: "savedLessonIDs")
    }

    func toggleCompleted(_ lesson: Lesson) {
        if !completedIDs.insert(lesson.id).inserted { completedIDs.remove(lesson.id) }
        defaults.set(Array(completedIDs), forKey: "completedLessonIDs")
    }

    func setNote(_ note: String, for lesson: Lesson) {
        if note.isEmpty { notes.removeValue(forKey: lesson.id) }
        else { notes[lesson.id] = note }
        defaults.set(notes, forKey: "lessonNotes")
    }

    func refresh() async {
        guard !isLoading else { return }
        isLoading = true
        defer { isLoading = false }
        do {
            var request = URLRequest(url: catalogURL)
            request.cachePolicy = .reloadIgnoringLocalCacheData
            request.timeoutInterval = 20
            let (data, response) = try await URLSession.shared.data(for: request)
            guard let response = response as? HTTPURLResponse, response.statusCode == 200 else {
                throw URLError(.badServerResponse)
            }
            let catalog = try JSONDecoder().decode(Catalog.self, from: data)
            guard catalog.version == 1 else { throw URLError(.cannotParseResponse) }
            lessons = catalog.lessons
            isUsingCachedCatalog = false
            errorMessage = nil
            try? saveCatalog(data)
        } catch {
            errorMessage = lessons.isEmpty
                ? "The library is unavailable. Connect to the internet and try again."
                : "Showing the last saved catalog. Videos need an internet connection."
            isUsingCachedCatalog = !lessons.isEmpty
        }
    }

    private var cacheFile: URL? {
        guard let directory = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first else { return nil }
        return directory.appendingPathComponent("learning-catalog-v1.json")
    }

    private func loadCachedCatalog() {
        guard let file = cacheFile,
              let data = try? Data(contentsOf: file),
              let catalog = try? JSONDecoder().decode(Catalog.self, from: data),
              catalog.version == 1 else { return }
        lessons = catalog.lessons
        isUsingCachedCatalog = true
    }

    private func saveCatalog(_ data: Data) throws {
        guard let file = cacheFile else { return }
        try FileManager.default.createDirectory(at: file.deletingLastPathComponent(), withIntermediateDirectories: true)
        try data.write(to: file, options: .atomic)
    }
}
