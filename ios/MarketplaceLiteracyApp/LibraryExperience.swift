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
    @Environment(\.libraryLanguage) private var uiLanguage
    private var ui: LibraryLocalization { LibraryLocalization(language: uiLanguage) }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                VStack(spacing: 14) {
                    LibraryEyebrow(text: ui.text("project"))
                    Text(ui.text("caption"))
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
                            Text(ui.text("studio"))
                                .font(.headline)
                                .foregroundStyle(LibraryStyle.ink)
                            Text(ui.text("studioCaption"))
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
                    LibraryEyebrow(text: ui.text("chooseLanguage"))
                    Text(ui.text("selectLanguage"))
                        .font(.title.bold())
                        .foregroundStyle(LibraryStyle.ink)

                    if store.errorMessage != nil, store.lessons.isEmpty {
                        Label(ui.text("connectRefresh"), systemImage: "wifi.exclamationmark")
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                    }

                    ForEach(LibraryLanguage.all) { language in
                        NavigationLink {
                            LanguageFormatsView(store: store, language: language)
                                .environment(\.libraryLanguage, language.name)
                                .onAppear { store.selectedLanguage = language.name }
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
    private var ui: LibraryLocalization { LibraryLocalization(language: language.name) }

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
                    Text(language.nativeName)
                        .font(.title3.bold())
                        .foregroundStyle(LibraryStyle.ink)
                    Spacer()
                    Image(systemName: "arrow.right")
                        .foregroundStyle(LibraryStyle.rust)
                }
                Text(count > 0 ? ui.resourceCount(count) : ui.text("browseResources"))
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
    private var ui: LibraryLocalization { LibraryLocalization(language: language.name) }

    private var formatNames: [String] {
        let available = Set(store.lessons.filter { $0.language == language.name }.map(\.format))
        let standard = LibraryFormat.all.map(\.name).filter { available.contains($0) }
        return standard + available.subtracting(standard).sorted()
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                Text(ui.text("languageResources"))
                    .font(.largeTitle.bold())
                    .foregroundStyle(LibraryStyle.ink)
                LibraryEyebrow(text: ui.text("selectFormat"))

                if formatNames.isEmpty {
                    ContentUnavailableView(ui.text("unavailable"), systemImage: "wifi.exclamationmark",
                                           description: Text(ui.text("connectRefresh")))
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
    @Environment(\.libraryLanguage) private var uiLanguage
    private var ui: LibraryLocalization { LibraryLocalization(language: uiLanguage) }

    var body: some View {
        HStack(spacing: 14) {
            Image(format.imageName)
                .resizable()
                .scaledToFit()
                .frame(width: 46, height: 46)
            VStack(alignment: .leading, spacing: 4) {
                Text(ui.formatName(format.name)).font(.headline).foregroundStyle(LibraryStyle.ink)
                Text(ui.resourceCount(count)).font(.caption).foregroundStyle(LibraryStyle.rust)
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
    @State private var selectedID: String?
    private var ui: LibraryLocalization { LibraryLocalization(language: language.name) }

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
        ScrollViewReader { proxy in
        List {
            Section {
                VStack(alignment: .leading, spacing: 6) {
                    LibraryEyebrow(text: "\(language.nativeName) / \(ui.formatName(format))")
                    Text(ui.formatName(format)).font(.title.bold()).foregroundStyle(LibraryStyle.ink)
                    Text(ui.text("publishedResources", formatLessons.count))
                        .font(.subheadline).foregroundStyle(.secondary)
                }
                .padding(.vertical, 8)
            }

            Section(ui.resourceHeading(visibleLessons.count)) {
                if visibleLessons.isEmpty {
                    ContentUnavailableView(ui.text("noMatches"), systemImage: "books.vertical",
                                           description: Text(ui.text("trySearch")))
                } else {
                    InlineResourceRows(lessons: visibleLessons, selectedID: $selectedID)
                }
            }
        }
        .scrollContentBackground(.hidden)
        .background(LibraryStyle.canvas)
        .searchable(text: $searchText, prompt: ui.text("searchFormat", ui.formatName(format)))
        .refreshable { await store.refresh() }
        .toolbar { ToolbarItem(placement: .principal) { LibraryBrand() } }
        .navigationBarTitleDisplayMode(.inline)
        .onChange(of: selectedID) { _, id in
            guard let id else { return }
            DispatchQueue.main.async {
                withAnimation { proxy.scrollTo(id, anchor: .top) }
            }
        }
        }
    }
}
