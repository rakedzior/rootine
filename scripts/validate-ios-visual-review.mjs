import fs from "node:fs"
import path from "node:path"

const outputDirectory = process.argv[2]
const expectedScreenshots = [
  "visual-01-today",
  "visual-02-tasks",
  "visual-03-calendar",
  "visual-04-nutrition",
  "visual-05-more",
]

if (!outputDirectory) {
  console.error("Usage: node scripts/validate-ios-visual-review.mjs <output-directory>")
  process.exit(2)
}

const resolvedDirectory = path.resolve(outputDirectory)
const manifestPath = path.join(resolvedDirectory, "manifest.json")

if (!fs.existsSync(manifestPath)) {
  console.error(`Missing XCTest attachment manifest: ${manifestPath}`)
  process.exit(1)
}

let manifest
try {
  manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"))
} catch (error) {
  console.error(`Invalid XCTest attachment manifest: ${error.message}`)
  process.exit(1)
}

function collectPngFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name)
    if (entry.isDirectory()) return collectPngFiles(entryPath)
    return entry.isFile() && entry.name.toLowerCase().endsWith(".png") ? [entryPath] : []
  })
}

const pngFiles = collectPngFiles(resolvedDirectory)
const manifestText = JSON.stringify(manifest)
const missingManifestEntries = expectedScreenshots.filter((name) => !manifestText.includes(name))
const missingPngFiles = expectedScreenshots.filter(
  (name) => !pngFiles.some((filePath) => path.basename(filePath).includes(name))
)

if (pngFiles.length !== expectedScreenshots.length || missingManifestEntries.length > 0 || missingPngFiles.length > 0) {
  console.error("Invalid iOS visual review screenshot set")
  console.error(`PNG files: ${pngFiles.length}; expected: ${expectedScreenshots.length}`)
  if (missingManifestEntries.length > 0) console.error(`Missing manifest entries: ${missingManifestEntries.join(", ")}`)
  if (missingPngFiles.length > 0) console.error(`Missing PNG files: ${missingPngFiles.join(", ")}`)
  process.exit(1)
}

console.log(`Validated ${pngFiles.length} named iOS visual review screenshots.`)
