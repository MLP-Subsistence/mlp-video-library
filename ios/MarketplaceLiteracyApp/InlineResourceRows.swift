import AVKit
import Combine
import SwiftUI

// Shared by format lists and Search so choosing a clip always keeps its titles nearby.
struct InlineResourceRows: View {
    let lessons: [Lesson]
    @Binding var selectedID: String?
    @State private var playlistFinished = false

    var body: some View {
        ForEach(lessons) { lesson in
            VStack(alignment: .leading, spacing: 14) {
                Button {
                    playlistFinished = false
                    selectedID = lesson.id
                } label: {
                    HStack(alignment: .top, spacing: 10) {
                        Text(lesson.title)
                            .font(.headline)
                            .foregroundStyle(.primary)
                            .frame(maxWidth: .infinity, alignment: .leading)
                        Image(systemName: selectedID == lesson.id ? "play.circle.fill" : "play.circle")
                    }
                    .padding(.vertical, 8)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityIdentifier("resource-\(lesson.id)")

                if selectedID == lesson.id {
                    InlineResourcePlayer(lesson: lesson) { advance(after: lesson.id) }
                        .id(lesson.id)
                    HStack {
                        Text(playlistFinished ? LibraryLocalization(language: lesson.language).text("playlistComplete") : positionText(for: lesson.id))
                            .font(.caption)
                            .foregroundStyle(.secondary)
                            .accessibilityIdentifier("playlist-position")
                        Spacer()
                        Button { advance(after: lesson.id) } label: {
                            Label(LibraryLocalization(language: lesson.language).text("nextClip"), systemImage: "forward.end.fill")
                        }
                        .buttonStyle(.bordered)
                        .disabled(nextLesson(after: lesson.id) == nil)
                        .accessibilityIdentifier("next-clip")
                    }
                    .padding(.bottom, 8)
                }
            }
            .id(lesson.id)
        }
        .onChange(of: lessons.map(\.id)) { _, ids in
            if let selectedID, !ids.contains(selectedID) {
                self.selectedID = nil
                playlistFinished = false
            }
        }
    }

    private func nextLesson(after id: String) -> Lesson? {
        guard let index = lessons.firstIndex(where: { $0.id == id }), index + 1 < lessons.count else { return nil }
        return lessons[index + 1]
    }

    private func advance(after id: String) {
        // Ignore an end event from a player that was replaced by a manual title selection.
        guard selectedID == id else { return }
        if let next = nextLesson(after: id) {
            playlistFinished = false
            selectedID = next.id
        } else {
            playlistFinished = true
        }
    }

    private func positionText(for id: String) -> String {
        guard let index = lessons.firstIndex(where: { $0.id == id }) else { return "" }
        return LibraryLocalization(language: lessons[index].language).text("clipPosition", index + 1, lessons.count)
    }
}

private struct InlineResourcePlayer: View {
    let lesson: Lesson
    let onEnded: () -> Void

    var body: some View {
        Group {
            if let videoID = lesson.youtubeVideoID, !videoID.isEmpty {
                YouTubeResourcePlayer(videoID: videoID, onEnded: onEnded)
                    .environment(\.libraryLanguage, lesson.language)
            } else if let url = lesson.directVideoURL {
                DirectResourcePlayer(url: url, onEnded: onEnded)
                    .aspectRatio(16 / 9, contentMode: .fit)
                    .frame(minHeight: 200)
            } else {
                Label(LibraryLocalization(language: lesson.language).text("noVideo"), systemImage: "video.slash")
            }
        }
        .accessibilityIdentifier("inline-player-\(lesson.id)")
    }
}

private struct DirectResourcePlayer: View {
    let url: URL
    let onEnded: () -> Void
    @State private var player = AVPlayer()
    @State private var visible = false
    @Environment(\.scenePhase) private var scenePhase

    var body: some View {
        VideoPlayer(player: player)
            .onAppear {
                visible = true
                player.replaceCurrentItem(with: AVPlayerItem(url: url))
                player.play()
            }
            .onDisappear {
                visible = false
                player.pause()
                player.replaceCurrentItem(with: nil)
            }
            .onChange(of: scenePhase) { _, phase in
                if phase != .active { player.pause() }
            }
            .onReceive(NotificationCenter.default.publisher(for: .AVPlayerItemDidPlayToEndTime)) { notification in
                guard visible, scenePhase == .active,
                      let item = notification.object as? AVPlayerItem, item === player.currentItem else { return }
                onEnded()
            }
    }
}
