import XCTest
@testable import CharacterXYZ

final class CharacterXYZTests: XCTestCase {
    func testSessionDecodesTheWebContract() throws {
        let json = """
        {"token":"cxs1.a.b","expiresAt":1760000000,"visitorId":"u_abc","agent":{"id":"agent_1","name":"Ananya","tagline":"Host"},"features":{"chat":true,"call":true,"maxCallMinutes":10}}
        """
        let session = try JSONDecoder().decode(Session.self, from: Data(json.utf8))
        XCTAssertEqual(session.agent.name, "Ananya")
        XCTAssertTrue(session.features.call)
    }
}
