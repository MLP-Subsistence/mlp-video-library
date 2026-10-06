import XCTest

final class LibraryFlowTests: XCTestCase {
    private var app: XCUIApplication!

    override func setUpWithError() throws {
        continueAfterFailure = false
        app = XCUIApplication()
        app.launch()
    }

    func testLibraryHeaderAndStudio() {
        XCTAssertTrue(app.staticTexts["library-caption"].waitForExistence(timeout: 15))
        XCTAssertEqual(app.descendants(matching: .any).matching(identifier: "library-brand").count, 1)
        XCTAssertLessThanOrEqual(app.staticTexts.matching(identifier: "MLP Video Library").count, 1)
        XCTAssertTrue(app.staticTexts["MARKETPLACE LITERACY PROJECT"].exists)
        XCTAssertFalse(app.staticTexts["Continue your learning path"].exists)
        XCTAssertTrue(app.tabBars.buttons["Library"].exists)
        XCTAssertTrue(app.tabBars.buttons["Search"].exists)
        XCTAssertFalse(app.tabBars.buttons["Practice"].exists)
        XCTAssertFalse(app.tabBars.buttons["Saved"].exists)
        capture("library-light")
        app.buttons["educator-studio"].tap()
        XCTAssertTrue(app.buttons["Done"].waitForExistence(timeout: 15))
        capture("educator-studio")
        app.buttons["Done"].tap()
        XCTAssertTrue(app.buttons["language-English"].exists)
    }

    func testAInlinePlaylistFlow() {
        let english = app.buttons["language-English"]
        XCTAssertTrue(english.waitForExistence(timeout: 30))
        english.tap()
        XCTAssertTrue(app.staticTexts["English Resources"].waitForExistence(timeout: 10))
        XCTAssertTrue(app.staticTexts["SELECT RESOURCE FORMAT"].exists)
        XCTAssertFalse(app.images["LanguageEnglish"].exists)
        let format = app.buttons["format-Image Diaries"]
        XCTAssertTrue(format.waitForExistence(timeout: 30))
        capture("english-formats")
        format.tap()
        let resource = app.buttons.matching(NSPredicate(format: "identifier BEGINSWITH %@", "resource-")).firstMatch
        XCTAssertTrue(resource.waitForExistence(timeout: 15))
        XCTAssertFalse(app.staticTexts.containing(NSPredicate(format: "label CONTAINS[c] %@", "imported from YouTube")).firstMatch.exists)
        capture("image-diaries-titles")
        resource.tap()
        XCTAssertTrue(app.buttons["next-clip"].waitForExistence(timeout: 5), "The first title tap must expand its player inside the list.")
        XCTAssertFalse(app.navigationBars["Video"].exists)
        XCTAssertTrue(app.staticTexts["playlist-position"].label.hasPrefix("Clip 1 of "))
        XCTAssertTrue(app.webViews.firstMatch.waitForExistence(timeout: 15))
        XCTAssertEqual(app.webViews.count, 1)
        XCTAssertTrue(resource.exists)
        XCTAssertFalse(app.buttons["Save lesson"].exists)
        XCTAssertFalse(app.staticTexts["Turn this lesson into action"].exists)
        XCTAssertFalse(app.staticTexts["Continue in Field Workbook"].exists)
        // Record the real network player outcome; TestFlight still needs device playback QA.
        let loading = app.staticTexts["playback-status"]
        let finishedLoading = NSPredicate { _, _ in
            !loading.exists || (loading.label != "Loading video…" && loading.label != "Starting video…")
        }
        let result = XCTWaiter.wait(for: [expectation(for: finishedLoading, evaluatedWith: nil)], timeout: 35)
        let outcome = loading.exists ? loading.label : "No playback warning; player reported playing/paused/ended"
        print("MLP_PLAYBACK_OBSERVATION: \(result.rawValue) / \(outcome)")
        capture("inline-first-clip")
        app.buttons["next-clip"].tap()
        XCTAssertTrue(app.staticTexts["playlist-position"].waitForExistence(timeout: 10))
        XCTAssertTrue(app.staticTexts["playlist-position"].label.hasPrefix("Clip 2 of "))
        XCTAssertFalse(app.navigationBars["Video"].exists)
        XCTAssertEqual(app.webViews.count, 1)
        capture("inline-next-clip")
        if !resource.isHittable { app.swipeDown() }
        resource.tap()
        XCTAssertTrue(app.staticTexts["playlist-position"].label.hasPrefix("Clip 1 of "))
        XCTAssertEqual(app.webViews.count, 1)
        app.navigationBars.buttons.element(boundBy: 0).tap()
        XCTAssertTrue(app.staticTexts["English Resources"].waitForExistence(timeout: 10))
    }

    func testSearchOpensVideo() {
        app.tabBars.buttons["Search"].tap()
        XCTAssertTrue(app.navigationBars["Search Resources"].waitForExistence(timeout: 10))
        let resource = app.buttons.matching(NSPredicate(format: "identifier BEGINSWITH %@", "resource-")).firstMatch
        XCTAssertTrue(resource.waitForExistence(timeout: 30))
        resource.tap()
        XCTAssertTrue(app.buttons["next-clip"].waitForExistence(timeout: 10))
        XCTAssertTrue(app.navigationBars["Search Resources"].exists)
        XCTAssertFalse(app.navigationBars["Video"].exists)
        XCTAssertTrue(app.webViews.firstMatch.waitForExistence(timeout: 15))
    }

    func testEveryEnglishFormatOpensAResource() {
        let english = app.buttons["language-English"]
        XCTAssertTrue(english.waitForExistence(timeout: 30))
        english.tap()
        for name in ["Image Diaries", "Doodle", "Animation", "VideoScribe", "Vocations"] {
            let format = app.buttons["format-\(name)"]
            XCTAssertTrue(format.waitForExistence(timeout: 30))
            if !format.isHittable { app.swipeUp() }
            format.tap()
            let resource = app.buttons.matching(NSPredicate(format: "identifier BEGINSWITH %@", "resource-")).firstMatch
            XCTAssertTrue(resource.waitForExistence(timeout: 10))
            resource.tap()
            XCTAssertTrue(app.buttons["next-clip"].waitForExistence(timeout: 10))
            XCTAssertFalse(app.navigationBars["Video"].exists)
            XCTAssertTrue(app.webViews.firstMatch.waitForExistence(timeout: 15))
            app.navigationBars.buttons.element(boundBy: 0).tap()
            XCTAssertTrue(app.staticTexts["English Resources"].waitForExistence(timeout: 10))
        }
    }

    private func capture(_ name: String) {
        let attachment = XCTAttachment(screenshot: app.screenshot())
        attachment.name = name
        attachment.lifetime = .keepAlways
        add(attachment)
    }
}
