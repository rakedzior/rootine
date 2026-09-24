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
  console.error("Usage: node scripts/normalize-ios-visual-review.mjs <output-directory>")
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

const attachments = Array.isArray(manifest)
  ? manifest.flatMap((test) => (Array.isArray(test?.attachments) ? test.attachments : []))
  : []

function collectFiles(directory) {
  if (!fs.existsSync(directory)) return []
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name)
    if (entry.isDirectory()) return collectFiles(entryPath)
    return entry.isFile() ? [entryPath] : []
  })
}

const filesByName = new Map(collectFiles(resolvedDirectory).map((filePath) => [path.basename(filePath), filePath]))
const errors = []

for (const expectedName of expectedScreenshots) {
  const attachment = attachments.find((candidate) =>
    typeof candidate?.suggestedHumanReadableName === "string"
      && candidate.suggestedHumanReadableName.startsWith(`${expectedName}_`)
  )

  if (!attachment || typeof attachment.exportedFileName !== "string") {
    errors.push(`Missing manifest attachment for ${expectedName}`)
    continue
  }

  const exportedName = path.basename(attachment.exportedFileName)
  const sourcePath = filesByName.get(exportedName)
  const targetPath = path.join(resolvedDirectory, `${expectedName}.png`)

  if (sourcePath && sourcePath !== targetPath) {
    if (fs.existsSync(targetPath)) {
      errors.push(`Cannot normalize ${expectedName}: target already exists`)
      continue
    }
    fs.renameSync(sourcePath, targetPath)
    filesByName.delete(exportedName)
    filesByName.set(`${expectedName}.png`, targetPath)
  } else if (!sourcePath && !fs.existsSync(targetPath)) {
    errors.push(`Missing exported PNG for ${expectedName}: ${exportedName}`)
  }
}

if (errors.length > 0) {
  console.error("Unable to normalize iOS visual review screenshots")
  for (const error of errors) console.error(error)
  process.exit(1)
}

console.log(`Normalized ${expectedScreenshots.length} iOS visual review screenshot names.`)
