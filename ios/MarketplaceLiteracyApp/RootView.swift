import SwiftUI

private let brandColor = Color(uiColor: UIColor { traits in
    traits.userInterfaceStyle == .dark
        ? UIColor(red: 0.96, green: 0.59, blue: 0.43, alpha: 1)
        : UIColor(red: 0.65, green: 0.25, blue: 0.15, alpha: 1)
})

struct RootView: View {
    @StateObject private var store = LearningStore()

    var body: some View {
        TabView {
            NavigationStack {
                LibraryHomeView(store: store)
            }
            .tabItem { Label("Library", systemImage: "books.vertical.fill") }

            NavigationStack {
                ResourceSearchView(store: store)
            }
            .tabItem { Label("Search", systemImage: "magnifyingglass") }
        }
        .tint(brandColor)
        .task { await store.refresh() }
    }
}

private struct ResourceSearchView: View {
    @ObservedObject var store: LearningStore
    @State private var searchText = ""
    @State private var language = "All languages"
    @State private var format = "All formats"
    @State private var selectedID: String?

    private var formats: [String] {
        Array(Set(store.lessons.filter { language == "All languages" || $0.language == language }.map(\.format))).sorted()
    }

    private var visibleLessons: [Lesson] {
        store.lessons.filter { lesson in
            (language == "All languages" || lesson.language == language) &&
            (format == "All formats" || lesson.format == format) &&
            (searchText.isEmpty || [lesson.title, lesson.tags, lesson.category, lesson.submenu ?? ""]
                .contains { $0.localizedCaseInsensitiveContains(searchText) })
        }
    }

    var body: some View {
        ScrollViewReader { proxy in
        List {
            if let message = store.errorMessage {
                Label(message, systemImage: "wifi.exclamationmark")
            } else if store.isUsingCachedCatalog {
                Label("Cached library · Connect to play videos", systemImage: "square.and.arrow.down")
            }

            Section("Find resources") {
                Picker("Language", selection: $language) {
                    Text("All languages").tag("All languages")
                    ForEach(store.availableLanguages, id: \.self) { Text($0).tag($0) }
                }
                Picker("Format", selection: $format) {
                    Text("All formats").tag("All formats")
                    ForEach(formats, id: \.self) { Text($0).tag($0) }
                }
            }

            Section("Resources (\(visibleLessons.count))") {
                if visibleLessons.isEmpty {
                    ContentUnavailableView(store.lessons.isEmpty ? "Resources unavailable" : "No matching resources",
                                           systemImage: "books.vertical",
                                           description: Text("Pull down to refresh, or try another search."))
                } else {
                    InlineResourceRows(lessons: visibleLessons, selectedID: $selectedID)
                }
            }
        }
        .navigationTitle("Search Resources")
        .searchable(text: $searchText, prompt: "Search resources and topics")
        .refreshable { await store.refresh() }
        .onChange(of: language) { _, _ in format = "All formats" }
        .onChange(of: selectedID) { _, id in
            guard let id else { return }
            DispatchQueue.main.async {
                withAnimation { proxy.scrollTo(id, anchor: .top) }
            }
        }
        }
    }
}

#Preview { RootView() }
