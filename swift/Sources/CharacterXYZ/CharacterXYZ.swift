import Foundation

/// Character XYZ for Apple platforms — SCAFFOLD.
///
/// Today: the session exchange and the agent card, the same contract as the
/// web SDK (`spec/sdk-v1.openapi.yaml`). Next: streamed chat, calls (the agent
/// socket over `URLSessionWebSocketTask` + AVAudioEngine at 16 kHz), a SwiftUI
/// view. Native apps have no Origin, so production apps mint sessions on their
/// own server with a secret key and pass the token in (`init(sessionToken:)`).
public enum CharacterXYZVersion {
    public static let current = "0.4.0"
}

public struct AgentCard: Decodable, Sendable {
    public let id: String
    public let name: String
    public let tagline: String
}

public struct Features: Decodable, Sendable {
    public let chat: Bool
    public let call: Bool
    public let maxCallMinutes: Int
}

public struct Session: Decodable, Sendable {
    public let token: String
    public let expiresAt: Int
    public let visitorId: String
    public let agent: AgentCard
    public let features: Features
}

public struct CharacterXYZError: Error, Sendable {
    public let status: Int
    public let message: String
}

public final class CharacterXYZClient: @unchecked Sendable {
    public let apiURL: URL
    private let urlSession: URLSession

    public init(apiURL: URL = URL(string: "https://api.character.xyz")!, urlSession: URLSession = .shared) {
        self.apiURL = apiURL
        self.urlSession = urlSession
    }

    /// What a token minted by your server unlocks (`GET /sdk/v1/session`).
    public func describe(sessionToken: String) async throws -> Session {
        var request = URLRequest(url: apiURL.appendingPathComponent("sdk/v1/session"))
        request.setValue("Bearer \(sessionToken)", forHTTPHeaderField: "Authorization")
        let (data, response) = try await urlSession.data(for: request)
        let status = (response as? HTTPURLResponse)?.statusCode ?? 0
        struct Envelope<T: Decodable>: Decodable { let data: T?; let message: String? }
        guard (200..<300).contains(status) else {
            let message = (try? JSONDecoder().decode(Envelope<Session>.self, from: data))?.message ?? "Request failed"
            throw CharacterXYZError(status: status, message: message)
        }
        guard let session = try JSONDecoder().decode(Envelope<Session>.self, from: data).data else {
            throw CharacterXYZError(status: status, message: "Empty response")
        }
        return session
    }
}
