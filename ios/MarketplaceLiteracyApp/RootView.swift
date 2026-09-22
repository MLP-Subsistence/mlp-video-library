import AVKit
import SwiftUI
import WebKit

struct RootView: View {
    @StateObject private var store = LearningStore()

    var body: some View {
        TabView {
            NavigationStack {
                DiscoverView(store: store)
                    .navigationDestination(for: Lesson.self) { LessonDetailView(lesson: $0, store: store) }
            }
            .tabItem { Label("Discover", systemImage: "square.grid.2x2") }

            NavigationStack {
                LessonCollectionView(title: "Saved lessons", emptyMessage: "Save a lesson to keep it here.", lessons: store.savedLessons, store: store)
                    .navigationDestination(for: Lesson.self) { LessonDetailView(lesson: $0, store: store) }
            }
            .tabItem { Label("Saved", systemImage: "bookmark") }

            NavigationStack {
                LessonCollectionView(title: "My learning", emptyMessage: "Mark a lesson complete to track your learning.", lessons: store.completedLessons, store: store)
                    .navigationDestination(for: Lesson.self) { LessonDetailView(lesson: $0, store: store) }
            }
            .tabItem { Label("Progress", systemImage: "checkmark.circle") }
        }
        .tint(Color(red: 0.65, green: 0.25, blue: 0.15))
        .task { await store.refresh() }
    }
}

private struct DiscoverView: View {
    @ObservedObject var store: LearningStore
    @State private var searchText = ""
    @State private var language = "All languages"
    @State private var format = "All formats"

    private var languages: [String] {
        Array(Set(store.lessons.map(\.language))).sorted()
    }

    private var formats: [String] {
        Array(Set(store.lessons.filter { language == "All languages" || $0.language == language }.map(\.format))).sorted()
    }

    private var visibleLessons: [Lesson] {
        store.lessons.filter { lesson in
            (language == "All languages" || lesson.language == language) &&
            (format == "All formats" || lesson.format == format) &&
            (searchText.isEmpty || [lesson.title, lesson.description ?? "", lesson.tags, lesson.category, lesson.submenu ?? ""]
                .contains { $0.localizedCaseInsensitiveContains(searchText) })
        }
    }

    var body: some View {
        List {
            Section {
                VStack(alignment: .leading, spacing: 8) {
                    Text("Learn at your pace").font(.title2.bold())
                    Text("Explore Marketplace Literacy lessons in your language. Save useful lessons and keep notes as you learn.")
                        .font(.subheadline).foregroundStyle(.secondary)
                }
                .padding(.vertical, 8)
            }

            if let message = store.errorMessage {
                Section {
                    Label(message, systemImage: "wifi.exclamationmark")
                        .font(.subheadline).foregroundStyle(.secondary)
                }
            } else if store.isUsingCachedCatalog {
                Section {
                    Label("Saved catalog · Connect to refresh or play videos", systemImage: "square.and.arrow.down")
                        .font(.subheadline)
                }
            }

            Section("Find lessons") {
                Picker("Language", selection: $language) {
                    Text("All languages").tag("All languages")
                    ForEach(languages, id: \.self) { Text($0).tag($0) }
                }
                Picker("Format", selection: $format) {
                    Text("All formats").tag("All formats")
                    ForEach(formats, id: \.self) { Text($0).tag($0) }
                }
            }

            Section("Lessons (\(visibleLessons.count))") {
                if visibleLessons.isEmpty {
                    ContentUnavailableView(store.lessons.isEmpty ? "No lessons available" : "No matching lessons",
                                           systemImage: "books.vertical",
                                           description: Text(store.lessons.isEmpty ? "Pull down to try loading the library." : "Try another language, format, or search."))
                } else {
                    ForEach(visibleLessons) { lesson in
                        NavigationLink(value: lesson) { LessonRow(lesson: lesson, completed: store.isCompleted(lesson)) }
                    }
                }
            }
        }
        .navigationTitle("Marketplace Literacy")
        .searchable(text: $searchText, prompt: "Search lessons and topics")
        .refreshable { await store.refresh() }
        .toolbar { if store.isLoading { ProgressView() } }
        .onChange(of: language) { _, _ in format = "All formats" }
    }
}

private struct LessonCollectionView: View {
    let title: String
    let emptyMessage: String
    let lessons: [Lesson]
    @ObservedObject var store: LearningStore

    var body: some View {
        List {
            if lessons.isEmpty {
                ContentUnavailableView(title, systemImage: "bookmark", description: Text(emptyMessage))
            } else {
                ForEach(lessons) { lesson in
                    NavigationLink(value: lesson) { LessonRow(lesson: lesson, completed: store.isCompleted(lesson)) }
                }
            }
        }
        .navigationTitle(title)
        .refreshable { await store.refresh() }
    }
}

private struct LessonRow: View {
    let lesson: Lesson
    let completed: Bool

    var body: some View {
        HStack(spacing: 12) {
            AsyncImage(url: lesson.thumbnailURL) { image in
                image.resizable().scaledToFill()
            } placeholder: {
                ZStack {
                    Color(.secondarySystemGroupedBackground)
                    Image(systemName: "play.rectangle").foregroundStyle(.secondary)
                }
            }
            .frame(width: 86, height: 60)
            .clipShape(RoundedRectangle(cornerRadius: 8))

            VStack(alignment: .leading, spacing: 4) {
                Text(lesson.title).font(.headline).lineLimit(2)
                Text("\(lesson.language) · \(lesson.format)")
                    .font(.caption).foregroundStyle(.secondary).lineLimit(1)
                if completed {
                    Label("Completed", systemImage: "checkmark.circle.fill")
                        .font(.caption).foregroundStyle(.green)
                }
            }
        }
        .padding(.vertical, 3)
    }
}

private struct LessonDetailView: View {
    let lesson: Lesson
    @ObservedObject var store: LearningStore

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                if let videoID = lesson.youtubeVideoID {
                    YouTubeLessonPlayer(videoID: videoID)
                        .frame(height: 220)
                        .clipShape(RoundedRectangle(cornerRadius: 14))
                } else if let videoURL = lesson.directVideoURL {
                    DirectLessonPlayer(url: videoURL)
                        .frame(height: 220)
                        .clipShape(RoundedRectangle(cornerRadius: 14))
                } else {
                    Label("This lesson has no video", systemImage: "text.book.closed")
                        .frame(maxWidth: .infinity, minHeight: 100)
                        .background(.quaternary, in: RoundedRectangle(cornerRadius: 14))
                }

                VStack(alignment: .leading, spacing: 8) {
                    Text("\(lesson.language) · \(lesson.format)")
                        .font(.subheadline.bold()).foregroundStyle(.tint)
                    Text(lesson.title).font(.title.bold())
                    if let duration = lesson.duration, !duration.isEmpty {
                        Label(duration, systemImage: "clock").font(.subheadline).foregroundStyle(.secondary)
                    }
                    if let description = lesson.description, !description.isEmpty {
                        Text(description).font(.body)
                    }
                }

                HStack {
                    Button {
                        store.toggleSaved(lesson)
                    } label: {
                        Label(store.isSaved(lesson) ? "Saved" : "Save lesson",
                              systemImage: store.isSaved(lesson) ? "bookmark.fill" : "bookmark")
                    }
                    .buttonStyle(.bordered)

                    Button {
                        store.toggleCompleted(lesson)
                    } label: {
                        Label(store.isCompleted(lesson) ? "Completed" : "Mark complete",
                              systemImage: store.isCompleted(lesson) ? "checkmark.circle.fill" : "checkmark.circle")
                    }
                    .buttonStyle(.borderedProminent)
                }

                if let transcript = lesson.transcript, !transcript.isEmpty {
                    VStack(alignment: .leading, spacing: 10) {
                        Label("Transcript", systemImage: "text.alignleft").font(.headline)
                        Text(transcript).textSelection(.enabled)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding()
                    .background(Color(.secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 14))
                }

                VStack(alignment: .leading, spacing: 8) {
                    Label("My notes", systemImage: "square.and.pencil").font(.headline)
                    Text("Notes stay on this device and are available offline.")
                        .font(.caption).foregroundStyle(.secondary)
                    TextEditor(text: Binding(
                        get: { store.notes[lesson.id] ?? "" },
                        set: { store.setNote($0, for: lesson) }
                    ))
                    .frame(minHeight: 120)
                    .padding(8)
                    .background(Color(.secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 12))
                    .accessibilityLabel("Notes for \(lesson.title)")
                }
            }
            .padding()
        }
        .navigationTitle("Lesson")
        .navigationBarTitleDisplayMode(.inline)
    }
}

private struct YouTubeLessonPlayer: UIViewRepresentable {
    let videoID: String

    func makeUIView(context: Context) -> WKWebView {
        let configuration = WKWebViewConfiguration()
        configuration.allowsInlineMediaPlayback = true
        let view = WKWebView(frame: .zero, configuration: configuration)
        view.scrollView.isScrollEnabled = false
        view.backgroundColor = .black
        if let url = URL(string: "https://www.youtube.com/embed/\(videoID)?playsinline=1") {
            view.load(URLRequest(url: url))
        }
        return view
    }

    func updateUIView(_ uiView: WKWebView, context: Context) {}
}

private struct DirectLessonPlayer: View {
    let url: URL
    @State private var player = AVPlayer()

    var body: some View {
        VideoPlayer(player: player)
            .onAppear { player.replaceCurrentItem(with: AVPlayerItem(url: url)) }
            .onDisappear { player.pause() }
    }
}

#Preview { RootView() }
