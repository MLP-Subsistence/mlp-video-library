import SwiftUI

private let brandColor = Color(uiColor: UIColor { traits in
    traits.userInterfaceStyle == .dark
        ? UIColor(red: 0.96, green: 0.59, blue: 0.43, alpha: 1)
        : UIColor(red: 0.65, green: 0.25, blue: 0.15, alpha: 1)
})

struct RootView: View {
    @StateObject private var store = LearningStore()
    private var ui: LibraryLocalization { LibraryLocalization(language: store.selectedLanguage) }

    var body: some View {
        TabView {
            NavigationStack {
                LibraryHomeView(store: store)
            }
            .tabItem { Label(ui.text("library"), systemImage: "books.vertical.fill") }

            NavigationStack {
                ResourceSearchView(store: store)
            }
            .tabItem { Label(ui.text("search"), systemImage: "magnifyingglass") }
        }
        .tint(brandColor)
        .environment(\.libraryLanguage, store.selectedLanguage)
        .environment(\.locale, Locale(identifier: ui.localeID))
        .task { await store.refresh() }
    }
}

private struct ResourceSearchView: View {
    @ObservedObject var store: LearningStore
    @State private var searchText = ""
    @State private var language = "All languages"
    @State private var format = "All formats"
    @State private var selectedID: String?
    @Environment(\.libraryLanguage) private var uiLanguage
    private var ui: LibraryLocalization { LibraryLocalization(language: uiLanguage) }

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
            if store.errorMessage != nil {
                Label(ui.text("connectRefresh"), systemImage: "wifi.exclamationmark")
            } else if store.isUsingCachedCatalog {
                Label(ui.text("cached"), systemImage: "square.and.arrow.down")
            }

            Section(ui.text("findResources")) {
                Picker(ui.text("language"), selection: $language) {
                    Text(ui.text("allLanguages")).tag("All languages")
                    ForEach(store.availableLanguages, id: \.self) { Text(LibraryLocalization.nativeName(for: $0)).tag($0) }
                }
                Picker(ui.text("format"), selection: $format) {
                    Text(ui.text("allFormats")).tag("All formats")
                    ForEach(formats, id: \.self) { Text(ui.formatName($0)).tag($0) }
                }
            }

            Section(ui.resourceHeading(visibleLessons.count)) {
                if visibleLessons.isEmpty {
                    ContentUnavailableView(ui.text(store.lessons.isEmpty ? "unavailable" : "noMatches"),
                                           systemImage: "books.vertical",
                                           description: Text(ui.text("refreshOrSearch")))
                } else {
                    InlineResourceRows(lessons: visibleLessons, selectedID: $selectedID)
                }
            }
        }
        .navigationTitle(ui.text("searchResources"))
        .searchable(text: $searchText, prompt: ui.text("searchTopics"))
        .refreshable { await store.refresh() }
        .onChange(of: language) { _, value in
            format = "All formats"
            if value != "All languages" { store.selectedLanguage = value }
        }
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
