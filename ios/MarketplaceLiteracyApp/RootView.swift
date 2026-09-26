import AVKit
import SwiftUI
import WebKit

private let brandColor = Color(red: 0.65, green: 0.25, blue: 0.15)

struct RootView: View {
    @StateObject private var store = LearningStore()

    var body: some View {
        TabView {
            NavigationStack {
                LearnView(store: store)
                    .navigationDestination(for: Lesson.self) { LessonDetailView(lesson: $0, store: store) }
            }
            .tabItem { Label("Learn", systemImage: "graduationcap.fill") }

            NavigationStack {
                LibraryView(store: store)
                    .navigationDestination(for: Lesson.self) { LessonDetailView(lesson: $0, store: store) }
            }
            .tabItem { Label("Library", systemImage: "books.vertical.fill") }

            NavigationStack {
                WorkbookView(store: store)
            }
            .tabItem { Label("Workbook", systemImage: "briefcase.fill") }

            NavigationStack {
                LearningProgressView(store: store)
                    .navigationDestination(for: Lesson.self) { LessonDetailView(lesson: $0, store: store) }
            }
            .tabItem { Label("Progress", systemImage: "chart.bar.fill") }
        }
        .tint(brandColor)
        .task { await store.refresh() }
    }
}

private struct LearnView: View {
    @ObservedObject var store: LearningStore

    var body: some View {
        List {
            Section {
                VStack(alignment: .leading, spacing: 8) {
                    Label("MARKETPLACE LITERACY", systemImage: "storefront.fill")
                        .font(.caption.bold())
                        .foregroundStyle(brandColor)
                    Text("Turn lessons into action").font(.largeTitle.bold())
                    Text("Follow a focused learning path, capture what matters, and test an idea in your marketplace.")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                }
                .padding(.vertical, 8)
            }

            if !store.availableLanguages.isEmpty {
                Section("My learning settings") {
                    Picker("Learning language", selection: $store.selectedLanguage) {
                        ForEach(store.availableLanguages, id: \.self) { Text($0).tag($0) }
                    }
                    Stepper("Daily goal: \(store.dailyGoal) lesson\(store.dailyGoal == 1 ? "" : "s")",
                            value: $store.dailyGoal, in: 1...5)
                }
            }

            Section("Today") {
                HStack(spacing: 18) {
                    ProgressRing(value: store.completedTodayCount, goal: store.dailyGoal)
                    VStack(alignment: .leading, spacing: 6) {
                        Text(store.completedTodayCount >= store.dailyGoal ? "Daily goal complete" : "Keep your learning moving")
                            .font(.headline)
                        Text("\(store.learningStreak)-day learning streak")
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                    }
                }
                .padding(.vertical, 6)

                if let next = store.nextLesson {
                    NavigationLink(value: next) {
                        VStack(alignment: .leading, spacing: 6) {
                            Label("CONTINUE YOUR PATH", systemImage: "play.circle.fill")
                                .font(.caption.bold()).foregroundStyle(brandColor)
                            Text(next.title).font(.headline).lineLimit(2)
                            Text("Watch, reflect, and choose one action to try.")
                                .font(.caption).foregroundStyle(.secondary)
                        }
                        .padding(.vertical, 5)
                    }
                } else if store.lessons.isEmpty {
                    ContentUnavailableView("Loading your learning path", systemImage: "arrow.triangle.2.circlepath",
                                           description: Text(store.errorMessage ?? "Connect to load the lesson library. Your field workbook is available now."))
                } else {
                    Label("You completed this learning path", systemImage: "trophy.fill")
                        .foregroundStyle(.green)
                }
            }

            Section {
                let path = store.learningPath
                ForEach(Array(path.enumerated()), id: \.element.id) { index, lesson in
                    NavigationLink(value: lesson) {
                        LearningPathRow(number: index + 1, lesson: lesson, completed: store.isCompleted(lesson))
                    }
                }
            } header: {
                HStack {
                    Text("12-step learning path")
                    Spacer()
                    Text("\(store.learningPathCompletedCount)/\(store.learningPath.count)")
                }
            } footer: {
                Text("Your path selects a varied sequence of lessons in your chosen language. Reflections and actions are saved privately on this device.")
            }
        }
        .navigationTitle("Learn")
        .refreshable { await store.refresh() }
        .toolbar { if store.isLoading { ProgressView() } }
    }
}

private struct ProgressRing: View {
    let value: Int
    let goal: Int

    private var fraction: Double { min(Double(value) / Double(max(goal, 1)), 1) }

    var body: some View {
        ZStack {
            Circle().stroke(.quaternary, lineWidth: 9)
            Circle().trim(from: 0, to: fraction)
                .stroke(brandColor, style: StrokeStyle(lineWidth: 9, lineCap: .round))
                .rotationEffect(.degrees(-90))
            Text("\(value)/\(goal)").font(.headline.monospacedDigit())
        }
        .frame(width: 72, height: 72)
        .accessibilityLabel("\(value) of \(goal) lessons completed today")
    }
}

private struct LearningPathRow: View {
    let number: Int
    let lesson: Lesson
    let completed: Bool

    var body: some View {
        HStack(spacing: 12) {
            ZStack {
                Circle().fill(completed ? Color.green : brandColor.opacity(0.12))
                if completed {
                    Image(systemName: "checkmark").foregroundStyle(.white).font(.caption.bold())
                } else {
                    Text("\(number)").foregroundStyle(brandColor).font(.caption.bold())
                }
            }
            .frame(width: 34, height: 34)

            VStack(alignment: .leading, spacing: 3) {
                Text(lesson.title).font(.headline).lineLimit(2)
                Text(lesson.format).font(.caption).foregroundStyle(.secondary)
            }
        }
        .padding(.vertical, 3)
    }
}

private struct LibraryView: View {
    @ObservedObject var store: LearningStore
    @State private var searchText = ""
    @State private var language = "All languages"
    @State private var format = "All formats"

    private var languages: [String] { store.availableLanguages }

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
            if let message = store.errorMessage {
                Section {
                    Label(message, systemImage: "wifi.exclamationmark")
                        .font(.subheadline).foregroundStyle(.secondary)
                }
            } else if store.isUsingCachedCatalog {
                Section {
                    Label("Saved library · Connect to refresh or play videos", systemImage: "square.and.arrow.down")
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
                        NavigationLink(value: lesson) {
                            LessonRow(lesson: lesson, completed: store.isCompleted(lesson), saved: store.isSaved(lesson))
                        }
                    }
                }
            }
        }
        .navigationTitle("Lesson Library")
        .searchable(text: $searchText, prompt: "Search lessons and topics")
        .refreshable { await store.refresh() }
        .toolbar { if store.isLoading { ProgressView() } }
        .onChange(of: language) { _, _ in format = "All formats" }
    }
}

private struct LessonRow: View {
    let lesson: Lesson
    let completed: Bool
    let saved: Bool

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
                HStack(spacing: 8) {
                    if completed { Label("Complete", systemImage: "checkmark.circle.fill").foregroundStyle(.green) }
                    if saved { Label("Saved", systemImage: "bookmark.fill").foregroundStyle(brandColor) }
                }
                .font(.caption)
            }
        }
        .padding(.vertical, 3)
    }
}

private struct LessonDetailView: View {
    let lesson: Lesson
    @ObservedObject var store: LearningStore

    private var reflectionBinding: Binding<LessonReflection> {
        Binding(get: { store.reflection(for: lesson) }, set: { store.setReflection($0, for: lesson) })
    }

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
                        .font(.subheadline.bold()).foregroundStyle(brandColor)
                    Text(lesson.title).font(.title.bold())
                    if let duration = lesson.duration, !duration.isEmpty {
                        Label(duration, systemImage: "clock").font(.subheadline).foregroundStyle(.secondary)
                    }
                }

                HStack {
                    Button { store.toggleSaved(lesson) } label: {
                        Label(store.isSaved(lesson) ? "Saved" : "Save lesson",
                              systemImage: store.isSaved(lesson) ? "bookmark.fill" : "bookmark")
                    }
                    .buttonStyle(.bordered)

                    if store.isCompleted(lesson) {
                        Button { store.toggleCompleted(lesson) } label: {
                            Label("Completed", systemImage: "checkmark.circle.fill")
                        }
                        .buttonStyle(.borderedProminent)
                        .tint(.green)
                    }
                }

                if let transcript = lesson.transcript, !transcript.isEmpty {
                    VStack(alignment: .leading, spacing: 10) {
                        Label("Transcript", systemImage: "text.alignleft").font(.headline)
                        Text(transcript).textSelection(.enabled)
                    }
                    .cardStyle()
                }

                ReflectionActivity(lesson: lesson, store: store, reflection: reflectionBinding)
            }
            .padding()
        }
        .navigationTitle("Lesson")
        .navigationBarTitleDisplayMode(.inline)
    }
}

private struct ReflectionActivity: View {
    let lesson: Lesson
    @ObservedObject var store: LearningStore
    @Binding var reflection: LessonReflection

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            Label("Turn this lesson into action", systemImage: "lightbulb.fill")
                .font(.title3.bold()).foregroundStyle(brandColor)
            Text("Complete the two required prompts to finish the lesson. Your answers stay privately on this device and work offline.")
                .font(.subheadline).foregroundStyle(.secondary)

            PromptEditor(title: "1. What is one useful idea? *", prompt: "Write the idea in your own words", text: $reflection.keyIdea)
            PromptEditor(title: "2. Who could benefit?", prompt: "Name a customer, learner, or community", text: $reflection.customer)
            PromptEditor(title: "3. What will you try next? *", prompt: "Choose one small action you can take", text: $reflection.nextAction)

            Button {
                store.toggleCompleted(lesson)
            } label: {
                Label(store.isCompleted(lesson) ? "Lesson completed" : "Complete lesson",
                      systemImage: store.isCompleted(lesson) ? "checkmark.seal.fill" : "checkmark.seal")
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(.borderedProminent)
            .disabled(!reflection.isReadyToComplete && !store.isCompleted(lesson))

            if !reflection.isReadyToComplete && !store.isCompleted(lesson) {
                Text("Add a useful idea and a next action to complete this lesson.")
                    .font(.caption).foregroundStyle(.secondary)
            }
        }
        .cardStyle()
    }
}

private struct PromptEditor: View {
    let title: String
    let prompt: String
    @Binding var text: String

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(title).font(.subheadline.bold())
            TextField(prompt, text: $text, axis: .vertical)
                .lineLimit(2...5)
                .textFieldStyle(.roundedBorder)
        }
    }
}

private struct WorkbookView: View {
    @ObservedObject var store: LearningStore
    @State private var showNewPlan = false

    var body: some View {
        List {
            Section {
                VStack(alignment: .leading, spacing: 8) {
                    Label("FIELD WORKBOOK", systemImage: "briefcase.fill")
                        .font(.caption.bold()).foregroundStyle(brandColor)
                    Text("Test an idea in the real world").font(.title2.bold())
                    Text("Create a simple field plan for a customer conversation, offer, price test, and next action.")
                        .font(.subheadline).foregroundStyle(.secondary)
                    Button { showNewPlan = true } label: {
                        Label("Create a field plan", systemImage: "plus.circle.fill")
                    }
                    .buttonStyle(.borderedProminent)
                    .padding(.top, 4)
                }
                .padding(.vertical, 8)
            }

            Section("My field plans") {
                if store.fieldPlans.isEmpty {
                    ContentUnavailableView("No field plans yet", systemImage: "clipboard",
                                           description: Text("Start with one customer and one small experiment."))
                } else {
                    ForEach(store.fieldPlans) { plan in
                        NavigationLink {
                            FieldPlanEditor(plan: plan) { store.upsertFieldPlan($0) }
                        } label: {
                            VStack(alignment: .leading, spacing: 4) {
                                HStack {
                                    Text(plan.title.isEmpty ? "Untitled field plan" : plan.title).font(.headline)
                                    Spacer()
                                    if plan.isCompleted { Image(systemName: "checkmark.seal.fill").foregroundStyle(.green) }
                                }
                                if !plan.customer.isEmpty {
                                    Label(plan.customer, systemImage: "person.2").font(.caption).foregroundStyle(.secondary)
                                }
                                Text("Target: \(plan.targetDate.formatted(date: .abbreviated, time: .omitted))")
                                    .font(.caption).foregroundStyle(.secondary)
                            }
                            .padding(.vertical, 4)
                        }
                    }
                }
            }
        }
        .navigationTitle("Workbook")
        .sheet(isPresented: $showNewPlan) {
            NavigationStack {
                FieldPlanEditor(plan: FieldPlan()) { store.upsertFieldPlan($0) }
            }
        }
    }
}

private struct FieldPlanEditor: View {
    @Environment(\.dismiss) private var dismiss
    @State private var plan: FieldPlan
    let onSave: (FieldPlan) -> Void

    init(plan: FieldPlan, onSave: @escaping (FieldPlan) -> Void) {
        _plan = State(initialValue: plan)
        self.onSave = onSave
    }

    var body: some View {
        Form {
            Section("Experiment") {
                TextField("Plan title", text: $plan.title)
                TextField("Who is the customer?", text: $plan.customer, axis: .vertical)
                TextField("What need or problem do they have?", text: $plan.customerNeed, axis: .vertical)
            }
            Section("Offer and price") {
                TextField("What value will you offer?", text: $plan.offer, axis: .vertical)
                TextField("What price or exchange will you test?", text: $plan.priceTest, axis: .vertical)
            }
            Section("Field conversation") {
                TextField("One question to ask the customer", text: $plan.interviewQuestion, axis: .vertical)
                TextField("The next action I will take", text: $plan.nextAction, axis: .vertical)
                DatePicker("Target date", selection: $plan.targetDate, displayedComponents: .date)
            }
            Section {
                Toggle("I completed this field test", isOn: $plan.isCompleted)
            }
        }
        .navigationTitle(plan.title.isEmpty ? "New field plan" : plan.title)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .confirmationAction) {
                Button("Save") {
                    onSave(plan)
                    dismiss()
                }
                .disabled(plan.title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
            }
        }
    }
}

private struct LearningProgressView: View {
    @ObservedObject var store: LearningStore

    var body: some View {
        List {
            Section {
                HStack(spacing: 12) {
                    MetricCard(value: "\(store.completedLessons.count)", label: "Lessons", icon: "checkmark.circle.fill")
                    MetricCard(value: "\(store.learningStreak)", label: "Day streak", icon: "flame.fill")
                    MetricCard(value: "\(store.fieldPlans.filter { $0.isCompleted }.count)", label: "Field tests", icon: "briefcase.fill")
                }
                .listRowInsets(EdgeInsets())
                .listRowBackground(Color.clear)
            }

            Section("Current learning path") {
                VStack(alignment: .leading, spacing: 8) {
                    HStack {
                        Text(store.selectedLanguage).font(.headline)
                        Spacer()
                        Text("\(store.learningPathCompletedCount) of \(store.learningPath.count)")
                            .font(.subheadline).foregroundStyle(.secondary)
                    }
                    ProgressView(value: Double(store.learningPathCompletedCount), total: Double(max(store.learningPath.count, 1)))
                }
                .padding(.vertical, 5)
            }

            Section("Saved lessons") {
                if store.savedLessons.isEmpty {
                    Text("Save lessons from the library to find them here.").foregroundStyle(.secondary)
                } else {
                    ForEach(store.savedLessons.prefix(8)) { lesson in
                        NavigationLink(value: lesson) {
                            LessonRow(lesson: lesson, completed: store.isCompleted(lesson), saved: true)
                        }
                    }
                }
            }

            Section("Recent activity") {
                if store.completionHistory.isEmpty {
                    Text("Complete a lesson to begin your activity history.").foregroundStyle(.secondary)
                } else {
                    ForEach(store.completionHistory.prefix(10)) { record in
                        VStack(alignment: .leading, spacing: 3) {
                            Text(record.lessonTitle).font(.subheadline.bold()).lineLimit(2)
                            Text(record.completedAt.formatted(date: .abbreviated, time: .shortened))
                                .font(.caption).foregroundStyle(.secondary)
                        }
                        .padding(.vertical, 3)
                    }
                }
            }
        }
        .navigationTitle("My Progress")
    }
}

private struct MetricCard: View {
    let value: String
    let label: String
    let icon: String

    var body: some View {
        VStack(spacing: 5) {
            Image(systemName: icon).foregroundStyle(brandColor)
            Text(value).font(.title2.bold()).monospacedDigit()
            Text(label).font(.caption2).foregroundStyle(.secondary).lineLimit(1)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 14)
        .background(Color(.secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 14))
    }
}

private extension View {
    func cardStyle() -> some View {
        frame(maxWidth: .infinity, alignment: .leading)
            .padding()
            .background(Color(.secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 14))
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
        if let url = URL(string: "https://www.youtube-nocookie.com/embed/\(videoID)?playsinline=1") {
            var request = URLRequest(url: url)
            request.setValue("https://org.marketplaceliteracy.app", forHTTPHeaderField: "Referer")
            view.load(request)
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
