// swift-tools-version:5.9
// At the repository ROOT because Swift Package Manager resolves a package by
// its git URL and reads the manifest from the top of the tree. The sources
// live under swift/ beside the other platforms.
import PackageDescription

let package = Package(
    name: "CharacterXYZ",
    platforms: [.iOS(.v15), .macOS(.v12)],
    products: [
        .library(name: "CharacterXYZ", targets: ["CharacterXYZ"]),
    ],
    targets: [
        .target(name: "CharacterXYZ", path: "swift/Sources/CharacterXYZ"),
        .testTarget(name: "CharacterXYZTests", dependencies: ["CharacterXYZ"], path: "swift/Tests/CharacterXYZTests"),
    ]
)
