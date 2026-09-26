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

struct LessonReflection: Codable, Hashable {
    var keyIdea = ""
    var customer = ""
    var nextAction = ""
    var updatedAt = Date()

    var isReadyToComplete: Bool {
        !keyIdea.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty &&
        !nextAction.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }
}

struct FieldPlan: Codable, Hashable, Identifiable {
    var id = UUID()
    var title = ""
    var customer = ""
    var customerNeed = ""
    var offer = ""
    var priceTest = ""
    var interviewQuestion = ""
    var nextAction = ""
    var targetDate = Date()
    var isCompleted = false
    var updatedAt = Date()
}

struct CompletionRecord: Codable, Hashable, Identifiable {
    let id: UUID
    let lessonID: String
    let lessonTitle: String
    let completedAt: Date
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
    @Published private(set) var reflections: [String: LessonReflection]
    @Published private(set) var fieldPlans: [FieldPlan]
    @Published private(set) var completionHistory: [CompletionRecord]
    @Published var selectedLanguage: String {
        didSet { defaults.set(selectedLanguage, forKey: Keys.selectedLanguage) }
    }
    @Published var dailyGoal: Int {
        didSet { defaults.set(dailyGoal, forKey: Keys.dailyGoal) }
    }

    private enum Keys {
        static let savedLessonIDs = "savedLessonIDs"
        static let completedLessonIDs = "completedLessonIDs"
        static let reflections = "lessonReflectionsV2"
        static let fieldPlans = "marketFieldPlansV1"
        static let completionHistory = "completionHistoryV1"
        static let selectedLanguage = "selectedLearningLanguageV1"
        static let dailyGoal = "dailyLearningGoalV1"
    }

    private let defaults = UserDefaults.standard
    private let catalogURL = URL(string: "https://marketplaceliteracyapp.org/api/mobile/catalog")!
    private let encoder = JSONEncoder()
    private let decoder = JSONDecoder()

    init() {
        savedIDs = Set(defaults.stringArray(forKey: Keys.savedLessonIDs) ?? [])
        completedIDs = Set(defaults.stringArray(forKey: Keys.completedLessonIDs) ?? [])
        reflections = Self.decode([String: LessonReflection].self, key: Keys.reflections) ?? [:]
        fieldPlans = Self.decode([FieldPlan].self, key: Keys.fieldPlans) ?? []
        completionHistory = Self.decode([CompletionRecord].self, key: Keys.completionHistory) ?? []
        selectedLanguage = defaults.string(forKey: Keys.selectedLanguage) ?? "English"
        dailyGoal = max(1, defaults.integer(forKey: Keys.dailyGoal))
        if defaults.object(forKey: Keys.dailyGoal) == nil { dailyGoal = 1 }
        loadCachedCatalog()
    }

    var availableLanguages: [String] {
        Array(Set(lessons.map(\.language))).sorted()
    }

    var savedLessons: [Lesson] { lessons.filter { savedIDs.contains($0.id) } }
    var completedLessons: [Lesson] { lessons.filter { completedIDs.contains($0.id) } }

    var learningPath: [Lesson] {
        let candidates = lessons
            .filter { $0.language == selectedLanguage }
            .sorted { lhs, rhs in
                if lhs.order != rhs.order { return lhs.order < rhs.order }
                return lhs.title.localizedCaseInsensitiveCompare(rhs.title) == .orderedAscending
            }

        var seenTopics = Set<String>()
        var path: [Lesson] = []
        for lesson in candidates {
            let topic = Self.topicKey(for: lesson.title)
            guard seenTopics.insert(topic).inserted else { continue }
            path.append(lesson)
            if path.count == 12 { break }
        }
        return path
    }

    var nextLesson: Lesson? {
        learningPath.first { !completedIDs.contains($0.id) }
    }

    var learningPathCompletedCount: Int {
        learningPath.filter { completedIDs.contains($0.id) }.count
    }

    var completedTodayCount: Int {
        completionHistory.filter { Calendar.current.isDateInToday($0.completedAt) }.count
    }

    var learningStreak: Int {
        let calendar = Calendar.current
        let days = Set(completionHistory.map { calendar.startOfDay(for: $0.completedAt) })
        guard !days.isEmpty else { return 0 }

        var cursor = calendar.startOfDay(for: Date())
        if !days.contains(cursor), let yesterday = calendar.date(byAdding: .day, value: -1, to: cursor) {
            cursor = yesterday
        }

        var streak = 0
        while days.contains(cursor) {
            streak += 1
            guard let previous = calendar.date(byAdding: .day, value: -1, to: cursor) else { break }
            cursor = previous
        }
        return streak
    }

    func isSaved(_ lesson: Lesson) -> Bool { savedIDs.contains(lesson.id) }
    func isCompleted(_ lesson: Lesson) -> Bool { completedIDs.contains(lesson.id) }
    func reflection(for lesson: Lesson) -> LessonReflection { reflections[lesson.id] ?? LessonReflection() }

    func toggleSaved(_ lesson: Lesson) {
        if !savedIDs.insert(lesson.id).inserted { savedIDs.remove(lesson.id) }
        defaults.set(Array(savedIDs), forKey: Keys.savedLessonIDs)
    }

    func setReflection(_ reflection: LessonReflection, for lesson: Lesson) {
        var updated = reflection
        updated.updatedAt = Date()
        reflections[lesson.id] = updated
        persist(reflections, key: Keys.reflections)
    }

    func toggleCompleted(_ lesson: Lesson) {
        if completedIDs.contains(lesson.id) {
            completedIDs.remove(lesson.id)
        } else {
            guard reflection(for: lesson).isReadyToComplete else { return }
            completedIDs.insert(lesson.id)
            completionHistory.insert(
                CompletionRecord(id: UUID(), lessonID: lesson.id, lessonTitle: lesson.title, completedAt: Date()),
                at: 0
            )
            persist(completionHistory, key: Keys.completionHistory)
        }
        defaults.set(Array(completedIDs), forKey: Keys.completedLessonIDs)
    }

    func upsertFieldPlan(_ plan: FieldPlan) {
        var updated = plan
        updated.updatedAt = Date()
        if let index = fieldPlans.firstIndex(where: { $0.id == plan.id }) {
            fieldPlans[index] = updated
        } else {
            fieldPlans.insert(updated, at: 0)
        }
        fieldPlans.sort { $0.updatedAt > $1.updatedAt }
        persist(fieldPlans, key: Keys.fieldPlans)
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
            let catalog = try decoder.decode(Catalog.self, from: data)
            guard catalog.version == 1 else { throw URLError(.cannotParseResponse) }
            lessons = catalog.lessons
            if !availableLanguages.contains(selectedLanguage), let first = availableLanguages.first {
                selectedLanguage = first
            }
            isUsingCachedCatalog = false
            errorMessage = nil
            try? saveCatalog(data)
        } catch {
            errorMessage = lessons.isEmpty
                ? "The lesson library is unavailable. Your workbook and saved reflections still work offline."
                : "Showing the saved library. Videos need an internet connection."
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
              let catalog = try? decoder.decode(Catalog.self, from: data),
              catalog.version == 1 else { return }
        lessons = catalog.lessons
        isUsingCachedCatalog = true
    }

    private func saveCatalog(_ data: Data) throws {
        guard let file = cacheFile else { return }
        try FileManager.default.createDirectory(at: file.deletingLastPathComponent(), withIntermediateDirectories: true)
        try data.write(to: file, options: .atomic)
    }

    private func persist<T: Encodable>(_ value: T, key: String) {
        if let data = try? encoder.encode(value) { defaults.set(data, forKey: key) }
    }

    private static func decode<T: Decodable>(_ type: T.Type, key: String) -> T? {
        guard let data = UserDefaults.standard.data(forKey: key) else { return nil }
        return try? JSONDecoder().decode(type, from: data)
    }

    private static func topicKey(for title: String) -> String {
        title.lowercased()
            .replacingOccurrences(of: #"[^\p{L}\p{N}]+"#, with: " ", options: .regularExpression)
            .trimmingCharacters(in: .whitespacesAndNewlines)
    }
}
