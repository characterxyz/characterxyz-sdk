# Character XYZ for Android — scaffold

A Gradle project with one library module, `:sdk` (`xyz.character.sdk`), holding the session client
and models from the shared contract ([`spec/sdk-v1.openapi.yaml`](../spec/sdk-v1.openapi.yaml)).

**Not built yet.** No Android toolchain was available where this was written, so the Gradle files have
never run. First steps:

1. `gradle wrapper --gradle-version 8.10` here, and commit `gradlew` + `gradle/wrapper/` (the root
   `.gitignore` keeps `gradle-wrapper.jar`).
2. `./gradlew :sdk:assembleRelease`.
3. Build out chat (SSE over OkHttp), calls (the agent socket + `AudioRecord` at 16 kHz mono PCM16,
   `AudioTrack` for the reply), and a Compose `CharacterXYZView`.

Apps have no browser `Origin`, so a native app always mints its session on its own server with a
secret key (`@characterxyz/web/server` `createSession`) and passes the token to the SDK.

# Apple (`../swift`)

The Swift package (`CharacterXYZ`, iOS 15 / macOS 12) is declared by [`Package.swift`](../Package.swift)
at the repository root, as Swift Package Manager requires, with sources under `swift/`. Same state:
written, never compiled here. `swift build && swift test` on a Mac is the first step.
