import SwiftUI

private enum LibraryStyle {
    static let rust = Color(uiColor: UIColor { traits in
        traits.userInterfaceStyle == .dark
            ? UIColor(red: 0.96, green: 0.59, blue: 0.43, alpha: 1)
            : UIColor(red: 0.66, green: 0.25, blue: 0.15, alpha: 1)
    })
    static let ink = Color.primary
    static let canvas = Color(.systemGroupedBackground)
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
        .accessibilityLabel("MLP Video Library")
        .accessibilityIdentifier("library-brand")
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
    @State private var showingStudio = false

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                VStack(spacing: 14) {
                    LibraryEyebrow(text: "MARKETPLACE LITERACY PROJECT")
                    Text("A facilitator resource library for organized Marketplace Literacy resources by language and resource format.")
                        .font(.body)
                        .foregroundStyle(LibraryStyle.ink)
                        .multilineTextAlignment(.center)
                        .accessibilityIdentifier("library-caption")
                }
                .frame(maxWidth: .infinity)
                .padding(.horizontal, 20)
                .padding(.vertical, 32)

                Button { showingStudio = true } label: {
                    HStack(spacing: 12) {
                        Image(systemName: "film.stack.fill")
                            .font(.title3)
                            .foregroundStyle(LibraryStyle.rust)
                        VStack(alignment: .leading, spacing: 4) {
                            Text("Educator Studio")
                                .font(.headline)
                                .foregroundStyle(LibraryStyle.ink)
                            Text("Create and translate Marketplace Literacy videos")
                                .font(.caption)
                                .foregroundStyle(LibraryStyle.ink)
                        }
                        Spacer(minLength: 0)
                        Image(systemName: "arrow.right")
                            .foregroundStyle(LibraryStyle.rust)
                    }
                    .padding()
                    .background(Color(.secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 14))
                    .overlay(alignment: .leading) {
                        RoundedRectangle(cornerRadius: 2)
                            .fill(LibraryStyle.rust)
                            .frame(width: 3)
                    }
                }
                .buttonStyle(.plain)
                .accessibilityIdentifier("educator-studio")
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
                        .accessibilityIdentifier("language-\(language.name)")
                    }
                }
                .padding(.horizontal, 20)
                .padding(.top, 28)
                .padding(.bottom, 30)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(LibraryStyle.canvas)
            }
        }
        .background(Color(.systemBackground))
        .refreshable { await store.refresh() }
        .toolbar { ToolbarItem(placement: .principal) { LibraryBrand() } }
        .navigationBarTitleDisplayMode(.inline)
        .sheet(isPresented: $showingStudio) {
            StudioBrowser(url: URL(string: "https://marketplaceliteracyapp.org/studio")!)
                .ignoresSafeArea()
        }
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
                .background(Color(.systemBackground))

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
                    .foregroundStyle(LibraryStyle.ink)
            }
            .padding(16)
        }
        .background(Color(.secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 16))
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
                Text("\(language.name) Resources")
                    .font(.largeTitle.bold())
                    .foregroundStyle(LibraryStyle.ink)
                LibraryEyebrow(text: "SELECT RESOURCE FORMAT")

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
                        .accessibilityIdentifier("format-\(name)")
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
                Text("\(count) resources").font(.caption).foregroundStyle(LibraryStyle.rust)
            }
            Spacer(minLength: 0)
            Image(systemName: "arrow.right").foregroundStyle(LibraryStyle.rust)
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color(.secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 16))
        .overlay(RoundedRectangle(cornerRadius: 16).stroke(.black.opacity(0.06)))
        .accessibilityElement(children: .combine)
    }
}

private struct FormatResourcesView: View {
    @ObservedObject var store: LearningStore
    let language: LibraryLanguage
    let format: String
    @State private var searchText = ""

    private var formatLessons: [Lesson] {
        store.lessons.filter { $0.language == language.name && $0.format == format }
    }

    private var visibleLessons: [Lesson] {
        formatLessons.filter { lesson in
            (searchText.isEmpty || [lesson.title, lesson.tags]
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

            Section("Resources (\(visibleLessons.count))") {
                if visibleLessons.isEmpty {
                    ContentUnavailableView("No matching resources", systemImage: "books.vertical",
                                           description: Text("Try another search term."))
                } else {
                    ForEach(visibleLessons) { lesson in
                        NavigationLink(value: lesson) {
                            Text(lesson.title)
                                .font(.headline)
                                .foregroundStyle(LibraryStyle.ink)
                                .padding(.vertical, 8)
                        }
                        .accessibilityIdentifier("resource-\(lesson.id)")
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
