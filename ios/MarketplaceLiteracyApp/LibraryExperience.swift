import SwiftUI

private enum LibraryStyle {
    static let rust = Color(red: 0.66, green: 0.25, blue: 0.15)
    static let ink = Color(red: 0.14, green: 0.20, blue: 0.28)
    static let canvas = Color(red: 0.96, green: 0.97, blue: 0.98)
}

private struct LibraryLanguage: Hashable, Identifiable {
    let name: String
    let nativeName: String
    let imageName: String

    var id: String { name }

    static let all: [LibraryLanguage] = [
        .init(name: "English", nativeName: "English", imageName: "LanguageEnglish"),
        .init(name: "French", nativeName: "Français", imageName: "LanguageFrench"),
        .init(name: "Hindi", nativeName: "हिन्दी", imageName: "LanguageHindi"),
        .init(name: "Spanish", nativeName: "Español", imageName: "LanguageSpanish"),
        .init(name: "Swahili", nativeName: "Kiswahili", imageName: "LanguageSwahili"),
        .init(name: "Telugu", nativeName: "తెలుగు", imageName: "LanguageTelugu")
    ]
}

private struct LibraryFormat {
    let name: String
    let imageName: String
    let description: String

    static let all: [LibraryFormat] = [
        .init(name: "Image Diaries", imageName: "FormatImageDiaries", description: "Image-based field stories and visual learning clips."),
        .init(name: "Doodle", imageName: "FormatDoodle", description: "Doodle-style explainer videos and visual stories."),
        .init(name: "Animation", imageName: "FormatAnimation", description: "Animated Marketplace Literacy clips."),
        .init(name: "VideoScribe", imageName: "FormatVideoScribe", description: "Whiteboard-style learning resources."),
        .init(name: "Global", imageName: "FormatGlobal", description: "Global Marketplace Literacy resources."),
        .init(name: "Vocations", imageName: "FormatVocations", description: "Vocation-focused Marketplace Literacy resources."),
        .init(name: "Online", imageName: "FormatOnline", description: "Online resources and collections.")
    ]

    static func details(for name: String) -> LibraryFormat {
        all.first { $0.name == name } ?? .init(name: name, imageName: "FormatGlobal", description: "Browse this resource format.")
    }
}

private struct LibraryBrand: View {
    var body: some View {
        HStack(spacing: 8) {
            Image("BrandIcon")
                .resizable()
                .frame(width: 30, height: 30)
                .clipShape(RoundedRectangle(cornerRadius: 7))
            Text("MLP Video Library")
                .font(.headline)
                .foregroundStyle(LibraryStyle.ink)
        }
        .accessibilityElement(children: .combine)
    }
}

private struct LibraryEyebrow: View {
    let text: String

    var body: some View {
        Text(text)
            .font(.caption.bold())
            .tracking(0.7)
            .foregroundStyle(LibraryStyle.rust)
    }
}

struct LibraryHomeView: View {
    @ObservedObject var store: LearningStore

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                VStack(alignment: .leading, spacing: 14) {
                    LibraryEyebrow(text: "MARKETPLACE LITERACY PROJECT")
                    Text("MLP Video Library")
                        .font(.largeTitle.bold())
                        .foregroundStyle(LibraryStyle.ink)
                    Text("A facilitator resource library for organized Marketplace Literacy resources by language and resource format.")
                        .font(.body)
                        .foregroundStyle(.secondary)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.horizontal, 20)
                .padding(.vertical, 32)

                NavigationLink {
                    LearnView(store: store)
                } label: {
                    HStack(spacing: 12) {
                        Image(systemName: "graduationcap.fill")
                            .font(.title3)
                            .foregroundStyle(LibraryStyle.rust)
                        VStack(alignment: .leading, spacing: 4) {
                            Text("Continue your learning path")
                                .font(.headline)
                                .foregroundStyle(LibraryStyle.ink)
                            Text("\(store.learningPathCompletedCount) of \(store.learningPath.count) lessons · Watch, reflect, and try an action")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                        Spacer(minLength: 0)
                        Image(systemName: "arrow.right")
                            .foregroundStyle(LibraryStyle.rust)
                    }
                    .padding()
                    .background(.white, in: RoundedRectangle(cornerRadius: 14))
                    .overlay(alignment: .leading) {
                        RoundedRectangle(cornerRadius: 2)
                            .fill(LibraryStyle.rust)
                            .frame(width: 3)
                    }
                }
                .buttonStyle(.plain)
                .padding(.horizontal, 20)
                .padding(.bottom, 28)

                VStack(alignment: .leading, spacing: 12) {
                    LibraryEyebrow(text: "CHOOSE A LANGUAGE")
                    Text("Select a Language")
                        .font(.title.bold())
                        .foregroundStyle(LibraryStyle.ink)

                    if let error = store.errorMessage, store.lessons.isEmpty {
                        Label(error, systemImage: "wifi.exclamationmark")
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                    }

                    ForEach(LibraryLanguage.all) { language in
                        NavigationLink {
                            LanguageFormatsView(store: store, language: language)
                        } label: {
                            LibraryLanguageCard(
                                language: language,
                                count: store.lessons.filter { $0.language == language.name }.count
                            )
                        }
                        .buttonStyle(.plain)
                    }
                }
                .padding(.horizontal, 20)
                .padding(.top, 28)
                .padding(.bottom, 30)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(LibraryStyle.canvas)
            }
        }
        .background(.white)
        .refreshable { await store.refresh() }
        .toolbar { ToolbarItem(placement: .principal) { LibraryBrand() } }
        .navigationBarTitleDisplayMode(.inline)
    }
}

private struct LibraryLanguageCard: View {
    let language: LibraryLanguage
    let count: Int

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Image(language.imageName)
                .resizable()
                .scaledToFit()
                .frame(maxWidth: .infinity)
                .frame(height: 178)
                .background(.white)

            VStack(alignment: .leading, spacing: 8) {
                Text(language.nativeName)
                    .font(.caption)
                    .foregroundStyle(LibraryStyle.rust)
                    .padding(.horizontal, 9)
                    .padding(.vertical, 5)
                    .background(LibraryStyle.rust.opacity(0.09), in: RoundedRectangle(cornerRadius: 5))
                HStack {
                    Text(language.name)
                        .font(.title3.bold())
                        .foregroundStyle(LibraryStyle.ink)
                    Spacer()
                    Image(systemName: "arrow.right")
                        .foregroundStyle(LibraryStyle.rust)
                }
                Text(count > 0 ? "\(count) resources" : "Browse resources")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }
            .padding(16)
        }
        .background(.white, in: RoundedRectangle(cornerRadius: 16))
        .overlay(RoundedRectangle(cornerRadius: 16).stroke(.black.opacity(0.06)))
        .padding(.top, 8)
        .accessibilityElement(children: .combine)
    }
}

private struct LanguageFormatsView: View {
    @ObservedObject var store: LearningStore
    let language: LibraryLanguage

    private var formatNames: [String] {
        let available = Set(store.lessons.filter { $0.language == language.name }.map(\.format))
        let standard = LibraryFormat.all.map(\.name).filter { available.contains($0) }
        return standard + available.subtracting(standard).sorted()
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                Image(language.imageName)
                    .resizable()
                    .scaledToFit()
                    .frame(maxWidth: .infinity)
                    .background(.white, in: RoundedRectangle(cornerRadius: 16))

                LibraryEyebrow(text: "SELECT RESOURCE FORMAT")
                Text("\(language.name) Resources")
                    .font(.largeTitle.bold())
                    .foregroundStyle(LibraryStyle.ink)
                Text("Choose a resource format to view the matching Marketplace Literacy resources directly.")
                    .foregroundStyle(.secondary)

                if formatNames.isEmpty {
                    ContentUnavailableView("Resources unavailable", systemImage: "wifi.exclamationmark",
                                           description: Text("Connect and pull down to load the \(language.name) library."))
                } else {
                    ForEach(formatNames, id: \.self) { name in
                        NavigationLink {
                            FormatResourcesView(store: store, language: language, format: name)
                        } label: {
                            FormatCard(format: LibraryFormat.details(for: name),
                                       count: store.lessons.filter { $0.language == language.name && $0.format == name }.count)
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
            .padding(20)
        }
        .background(LibraryStyle.canvas)
        .refreshable { await store.refresh() }
        .toolbar { ToolbarItem(placement: .principal) { LibraryBrand() } }
        .navigationBarTitleDisplayMode(.inline)
    }
}

private struct FormatCard: View {
    let format: LibraryFormat
    let count: Int

    var body: some View {
        HStack(spacing: 14) {
            Image(format.imageName)
                .resizable()
                .scaledToFit()
                .frame(width: 46, height: 46)
            VStack(alignment: .leading, spacing: 4) {
                Text(format.name).font(.headline).foregroundStyle(LibraryStyle.ink)
                Text(format.description).font(.caption).foregroundStyle(.secondary)
                Text("\(count) resources").font(.caption).foregroundStyle(LibraryStyle.rust)
            }
            Spacer(minLength: 0)
            Image(systemName: "arrow.right").foregroundStyle(LibraryStyle.rust)
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(.white, in: RoundedRectangle(cornerRadius: 16))
        .overlay(RoundedRectangle(cornerRadius: 16).stroke(.black.opacity(0.06)))
        .accessibilityElement(children: .combine)
    }
}

private struct FormatResourcesView: View {
    @ObservedObject var store: LearningStore
    let language: LibraryLanguage
    let format: String
    @State private var searchText = ""
    @State private var category = "All categories"
    @State private var collection = "All collections"

    private var formatLessons: [Lesson] {
        store.lessons.filter { $0.language == language.name && $0.format == format }
    }

    private var categories: [String] {
        Array(Set(formatLessons.map(\.category).filter { !$0.isEmpty })).sorted()
    }

    private var collections: [String] {
        Array(Set(formatLessons.compactMap(\.submenu).filter { !$0.isEmpty })).sorted()
    }

    private var visibleLessons: [Lesson] {
        formatLessons.filter { lesson in
            (category == "All categories" || lesson.category == category) &&
            (collection == "All collections" || lesson.submenu == collection) &&
            (searchText.isEmpty || [lesson.title, lesson.description ?? "", lesson.tags]
                .contains { $0.localizedCaseInsensitiveContains(searchText) })
        }
    }

    var body: some View {
        List {
            Section {
                VStack(alignment: .leading, spacing: 6) {
                    LibraryEyebrow(text: "\(language.name.uppercased()) / \(format.uppercased())")
                    Text(format).font(.title.bold()).foregroundStyle(LibraryStyle.ink)
                    Text("\(formatLessons.count) published resources")
                        .font(.subheadline).foregroundStyle(.secondary)
                }
                .padding(.vertical, 8)
            }

            if categories.count > 1 || !collections.isEmpty {
                Section("Browse") {
                    if categories.count > 1 {
                        Picker("Category", selection: $category) {
                            Text("All categories").tag("All categories")
                            ForEach(categories, id: \.self) { Text($0).tag($0) }
                        }
                    }
                    if !collections.isEmpty {
                        Picker("Collection", selection: $collection) {
                            Text("All collections").tag("All collections")
                            ForEach(collections, id: \.self) { Text($0).tag($0) }
                        }
                    }
                }
            }

            Section("Resources (\(visibleLessons.count))") {
                if visibleLessons.isEmpty {
                    ContentUnavailableView("No matching resources", systemImage: "books.vertical",
                                           description: Text("Try another category or search term."))
                } else {
                    ForEach(visibleLessons) { lesson in
                        NavigationLink(value: lesson) {
                            LibraryResourceCard(lesson: lesson, completed: store.isCompleted(lesson))
                        }
                    }
                }
            }
        }
        .scrollContentBackground(.hidden)
        .background(LibraryStyle.canvas)
        .searchable(text: $searchText, prompt: "Search \(format) resources")
        .refreshable { await store.refresh() }
        .toolbar { ToolbarItem(placement: .principal) { LibraryBrand() } }
        .navigationBarTitleDisplayMode(.inline)
    }
}

private struct LibraryResourceCard: View {
    let lesson: Lesson
    let completed: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            AsyncImage(url: lesson.thumbnailURL) { image in
                image.resizable().scaledToFill()
            } placeholder: {
                Image("Language\(lesson.language)")
                    .resizable()
                    .scaledToFit()
            }
            .frame(maxWidth: .infinity)
            .frame(height: 155)
            .clipped()
            .background(.white)
            .clipShape(RoundedRectangle(cornerRadius: 10))

            Text("\(lesson.language) · \(lesson.format)")
                .font(.caption.bold())
                .foregroundStyle(LibraryStyle.rust)
            Text(lesson.title)
                .font(.headline)
                .foregroundStyle(LibraryStyle.ink)
            if let description = lesson.description, !description.isEmpty {
                Text(description)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .lineLimit(2)
            }
            if completed {
                Label("Completed", systemImage: "checkmark.circle.fill")
                    .font(.caption)
                    .foregroundStyle(.green)
            }
        }
        .padding(.vertical, 8)
        .accessibilityElement(children: .combine)
    }
}

struct SavedResourcesView: View {
    @ObservedObject var store: LearningStore

    var body: some View {
        List {
            Section("Saved resources") {
                if store.savedLessons.isEmpty {
                    ContentUnavailableView("No saved resources", systemImage: "bookmark",
                                           description: Text("Save a lesson while browsing to find it here."))
                } else {
                    ForEach(store.savedLessons) { lesson in
                        NavigationLink(value: lesson) {
                            VStack(alignment: .leading, spacing: 4) {
                                Text(lesson.title).font(.headline)
                                Text("\(lesson.language) · \(lesson.format)")
                                    .font(.caption).foregroundStyle(.secondary)
                            }
                        }
                    }
                }
            }

            Section("My learning") {
                NavigationLink {
                    LearningProgressView(store: store)
                } label: {
                    Label("Progress and completed lessons", systemImage: "chart.bar.fill")
                }
                NavigationLink {
                    WorkbookView(store: store)
                } label: {
                    Label("Field Workbook", systemImage: "briefcase.fill")
                }
            }
        }
        .navigationTitle("Saved")
    }
}
