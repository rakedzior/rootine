#!/usr/bin/env node
// Usage: node scripts/ios-review-gallery.mjs <attachments-directory> <output-directory>
// Optional screenshot-map.json in the input directory:
// { "Spaces nutrition": "retry-1/attachment.png", "Spaces more": "retry-2/other.png" }
// The map overrides manifest captions; unlisted PNGs remain in the gallery.
import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile, readdir, realpath, stat, writeFile } from "node:fs/promises";
import path from "node:path";

const usage = "Usage: node scripts/ios-review-gallery.mjs <attachments-directory> <output-directory>";
const groups = [
  { id: "main", title: "Główne ekrany i przestrzenie" },
  { id: "editors", title: "Dodawanie i edycja" },
  { id: "account", title: "Profil i ustawienia" },
  { id: "states", title: "Pozostałe widoki i stany" },
];
const screens = [
  ["today", "Dzisiaj"], ["calendar", "Kalendarz"], ["nutrition", "Odżywianie"],
  ["more", "Przestrzenie"], ["notes", "Notatki"], ["sport", "Sport"],
  ["goals", "Cele"], ["work", "Praca"], ["travel", "Podróże"],
  ["health", "Zdrowie"], ["affairs", "Sprawy"],
];
const specialCaptions = new Map([
  ["today profile", "Dzisiaj"], ["calendar profile", "Kalendarz"],
  ["calendar profile menu", "Kalendarz — menu profilu"],
  ["nutrition add breakfast", "Odżywianie — dodaj śniadanie"],
  ["nutrition meal categories", "Odżywianie — kategorie posiłków"],
  ["nutrition after drag", "Odżywianie — po przesunięciu posiłku"],
  ["nutrition light large", "Odżywianie — jasny motyw"],
  ["more light large", "Przestrzenie — jasny motyw"],
  ["nutrition dark extra extra extra large", "Odżywianie — ciemny motyw, większy tekst"],
  ["health dark extra extra extra large", "Zdrowie — ciemny motyw, większy tekst"],
  ["notes from hub", "Notatki — z listy przestrzeni"],
  ["notes hold menu", "Notatki — menu kontekstowe"],
  ["notes archived temporary note", "Notatki — po archiwizacji"],
  ["sport after weekday drag", "Sport — po przesunięciu treningu"],
  ["sport completed temporary workout", "Sport — po zakończeniu treningu"],
  ["affairs add choice", "Sprawy — wybierz rodzaj wpisu"],
  ["profile", "Profil"], ["settings", "Ustawienia"],
]);

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character]);
}

function within(directory, candidate) {
  const relative = path.relative(directory, candidate);
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative));
}

async function canonicalOutput(directory) {
  try {
    return await realpath(directory);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    const parent = path.dirname(directory);
    if (parent === directory) throw error;
    return path.join(await canonicalOutput(parent), path.basename(directory));
  }
}

async function collectFiles(directory, excluded) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (within(excluded, file)) continue;
    if (entry.isDirectory()) files.push(...await collectFiles(file, excluded));
    else if (entry.isFile()) files.push(file);
  }
  return files.sort((a, b) => a.localeCompare(b, "en"));
}

function cleanName(name) {
  return name.replace(/\.png$/i, "")
    .replace(/[_-][0-9a-f]{8}-[0-9a-f-]{27,}$/i, "")
    .replace(/[_-]\d+(?:[_-].*)?$/, "")
    .replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
}

function describe(name) {
  const cleaned = cleanName(name);
  const key = cleaned.replace(/^spaces\s+/i, "").toLowerCase();
  const screenIndex = screens.findIndex(([id]) => key === id || key.startsWith(`${id} `));
  const screen = screens[screenIndex];
  const detail = screen ? key.slice(screen[0].length).trim() : key;
  let group = "states";
  if (screen && (!detail || ["from hub", "profile"].includes(detail))) group = "main";
  if (/\b(add|edit|editor|composer|categories|schedule)\b/.test(key)) group = "editors";
  if (key === "profile" || key === "settings" || /\bprofile menu\b/.test(key)) group = "account";
  const caption = specialCaptions.get(key) ?? (screen
    ? `${screen[1]}${detail ? ` — ${detail === "add" ? "dodaj wpis" : detail}` : ""}`
    : cleaned);
  return { group, caption, order: screenIndex < 0 ? 99 : screenIndex };
}

async function readJson(file) {
  try {
    return JSON.parse((await readFile(file, "utf8")).replace(/^\uFEFF/, ""));
  } catch (error) {
    throw new Error(`Cannot read JSON ${file}: ${error.message}`, { cause: error });
  }
}

function manifestEntries(value, entries = []) {
  if (Array.isArray(value)) value.forEach((entry) => manifestEntries(entry, entries));
  else if (value && typeof value === "object") {
    const filename = ["exportedFileName", "fileName", "filename", "relativePath", "path", "file"]
      .map((key) => value[key]).find((item) => typeof item === "string" && /\.png$/i.test(item));
    if (filename) {
      const name = ["suggestedHumanReadableName", "name", "title", "displayName", "fileName"]
        .map((key) => value[key]).find((item) => typeof item === "string" && item.trim());
      entries.push({ filename, name: name ?? path.basename(filename) });
    }
    Object.values(value).forEach((entry) => manifestEntries(entry, entries));
  }
  return entries;
}

function resolveScreenshot(filename, manifest, input, pngs) {
  const portable = filename.replace(/[\\/]/g, path.sep);
  const local = path.resolve(path.dirname(manifest), portable);
  if (within(input, local) && pngs.has(local)) return local;
  // Some exports put the manifest above an attachments subdirectory.
  const matches = [...pngs].filter((file) => path.basename(file) === path.basename(portable)
    && within(path.dirname(manifest), file));
  if (matches.length === 1) return matches[0];
  if (matches.length > 1) return undefined;
  const root = path.resolve(input, portable);
  return within(input, root) && pngs.has(root) ? root : undefined;
}

function pngDimensions(bytes, filename) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  if (bytes.length < 24 || !bytes.subarray(0, 8).equals(signature)
    || bytes.toString("ascii", 12, 16) !== "IHDR") {
    throw new Error(`Not a valid PNG: ${filename}`);
  }
  const width = bytes.readUInt32BE(16);
  const height = bytes.readUInt32BE(20);
  if (!width || !height) throw new Error(`Invalid PNG dimensions: ${filename}`);
  return { width, height };
}

function renderGallery(items, reviewNote = "") {
  const presentGroups = groups.filter(({ id }) => items.some((item) => item.group === id));
  const navigation = presentGroups.map(({ id, title }) => `<a href="#${id}">${title}</a>`).join("");
  const sections = presentGroups.map(({ id, title }) => {
    const figures = items.filter((item) => item.group === id).map((item) => `<figure>
      <a class="screenshot" href="${item.src}" target="_blank" rel="noopener" aria-label="${escapeHtml(`${item.caption} — otwórz pełny PNG w nowej karcie`)}">
        <img src="${item.src}" width="${item.width}" height="${item.height}" alt="${escapeHtml(item.caption)}" loading="lazy" decoding="async">
      </a>
      <figcaption><h3>${escapeHtml(item.caption)}${item.versions > 1 ? ` <span class="version">· ujęcie ${item.version}/${item.versions}</span>` : ""}</h3>
        <p class="dimensions">${item.width} × ${item.height} px <a href="${item.src}" target="_blank" rel="noopener">Pełny PNG<span class="sr-only">: ${escapeHtml(item.caption)} (nowa karta)</span></a></p>
        <details><summary>Źródło zrzutu</summary><p>${escapeHtml(item.name)}</p><p>${escapeHtml(item.source)}</p></details>
      </figcaption>
    </figure>`).join("\n");
    return `<section id="${id}" aria-labelledby="${id}-title"><h2 id="${id}-title">${title}</h2><div class="gallery">${figures}</div></section>`;
  }).join("\n");
  return `<!doctype html>
<html lang="pl">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="dark">
  <title>Rootine — przegląd iOS</title>
  <style>
    :root { color-scheme: dark; --bg: #15181b; --text: #f1f0ec; --muted: #b6b8bb; --line: #3d444c; --accent: #a1b5ee; }
    * { box-sizing: border-box; }
    html { scroll-padding-top: 24px; scrollbar-color: #606a78 var(--bg); }
    body { margin: 0; color: var(--text); background: var(--bg); font: 16px/1.5 ui-sans-serif, system-ui, sans-serif; }
    ::selection { background: #657fce; color: #fff; }
    a { color: var(--accent); text-underline-offset: 4px; }
    a:hover { color: var(--text); }
    a:focus-visible, summary:focus-visible { outline: 3px solid var(--accent); outline-offset: 5px; }
    .wrap { width: min(1600px, 100%); margin: 0 auto; padding: 40px clamp(16px, 4vw, 64px) 64px; }
    header { margin-bottom: 40px; }
    h1 { margin: 0 0 12px; font-size: clamp(28px, 3vw, 36px); line-height: 1.15; letter-spacing: -.025em; text-wrap: balance; }
    header p { max-width: 70ch; margin: 0; color: var(--muted); }
    header .review-note { margin-top: 16px; color: var(--text); }
    nav { display: flex; flex-wrap: wrap; gap: 4px 24px; margin-top: 20px; }
    nav a { display: inline-flex; align-items: center; min-height: 44px; }
    section + section { margin-top: 64px; }
    h2 { margin: 0 0 24px; padding-top: 20px; border-top: 1px solid var(--line); font-size: 24px; line-height: 1.3; }
    .gallery { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 270px), 1fr)); gap: 40px 28px; align-items: start; }
    figure { min-width: 0; width: 100%; max-width: 380px; margin: 0; }
    .screenshot { display: block; width: 100%; }
    img { display: block; width: 100%; height: auto; }
    figcaption { padding-top: 14px; }
    h3 { margin: 0 0 5px; font-size: 16px; line-height: 1.4; }
    .version { color: var(--muted); font-size: 14px; font-weight: 400; }
    .dimensions { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 16px; margin: 0; font-size: 14px; color: var(--muted); font-variant-numeric: tabular-nums; }
    .dimensions a { display: inline-flex; align-items: center; min-height: 36px; }
    details { margin-top: 6px; color: var(--muted); font-size: 13px; overflow-wrap: anywhere; }
    summary { width: fit-content; padding: 6px 0; cursor: pointer; }
    details p { margin: 6px 0; }
    footer { margin-top: 64px; padding-top: 20px; border-top: 1px solid var(--line); color: var(--muted); font-size: 14px; }
    .sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; border: 0; }
    @media (max-width: 600px) { .wrap { padding-top: 28px; } figure { margin-inline: auto; } nav { gap: 4px 16px; } section + section { margin-top: 48px; } }
  </style>
</head>
<body>
  <div class="wrap">
    <header><h1>Rootine — przegląd iOS</h1>
      <p>Zrzuty ekranu z symulatora iOS. Kliknij obraz, aby otworzyć oryginalny plik PNG w pełnej rozdzielczości.</p>
      ${reviewNote ? `<p class="review-note">${escapeHtml(reviewNote)}</p>` : ""}
      <nav aria-label="Sekcje przeglądu">${navigation}</nav>
    </header>
    <main>${sections}</main>
    <footer>Liczba zrzutów: ${items.length}. Obrazy zachowują oryginalne proporcje i rozdzielczość.</footer>
  </div>
</body>
</html>
`;
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 1 && ["--help", "-h"].includes(args[0])) {
    console.log(`${usage}\n\nReads manifest.json recursively, copies PNGs, and writes a standalone index.html.\nOptional screenshot-map.json: { "Spaces nutrition": "retry-1/attachment.png" }\nRepeated names are retained as separate captures. No test result is inferred.`);
    return;
  }
  if (args.length !== 2) throw new Error(usage);
  const input = await realpath(path.resolve(args[0]));
  if (!(await stat(input)).isDirectory()) throw new Error(`Not a directory: ${input}`);
  const output = await canonicalOutput(path.resolve(args[1]));
  if (within(output, input)) throw new Error("Output must be a separate directory, not the input directory or its parent.");
  const files = await collectFiles(input, output);
  const pngs = new Set(files.filter((file) => /\.png$/i.test(file)));
  if (!pngs.size) throw new Error(`No PNG screenshots found in ${input}`);
  const names = new Map();
  for (const manifest of files.filter((file) => path.basename(file).toLowerCase() === "manifest.json")) {
    for (const { filename, name } of manifestEntries(await readJson(manifest))) {
      const file = resolveScreenshot(filename, manifest, input, pngs);
      if (file) names.set(file, name);
      else console.warn(`Skipping missing or ambiguous PNG referenced by ${manifest}: ${filename}`);
    }
  }
  const mapFile = path.join(input, "screenshot-map.json");
  if (files.includes(mapFile)) {
    const mapping = await readJson(mapFile);
    if (!mapping || Array.isArray(mapping) || typeof mapping !== "object") throw new Error("screenshot-map.json must be an object mapping captions to relative PNG paths.");
    for (const [name, filename] of Object.entries(mapping)) {
      if (typeof filename !== "string") throw new Error(`Invalid screenshot-map.json path for ${name}`);
      const file = resolveScreenshot(filename, mapFile, input, pngs);
      if (!file) throw new Error(`Missing or ambiguous screenshot-map.json PNG: ${filename}`);
      names.set(file, name);
    }
  }
  const items = [];
  for (const file of pngs) {
    const name = names.get(file) ?? path.basename(file);
    const bytes = await readFile(file);
    const source = path.relative(input, file).split(path.sep).join("/");
    const digest = createHash("sha256").update(source).update(bytes).digest("hex").slice(0, 20);
    items.push({ file, name, source, src: `screenshots/${digest}.png`, ...describe(name), ...pngDimensions(bytes, file) });
  }
  items.sort((a, b) => groups.findIndex(({ id }) => id === a.group) - groups.findIndex(({ id }) => id === b.group)
    || a.order - b.order || a.caption.localeCompare(b.caption, "pl") || a.source.localeCompare(b.source, "en"));
  const totals = new Map();
  const versions = new Map();
  for (const item of items) totals.set(item.caption, (totals.get(item.caption) ?? 0) + 1);
  for (const item of items) {
    item.version = (versions.get(item.caption) ?? 0) + 1;
    item.versions = totals.get(item.caption);
    versions.set(item.caption, item.version);
  }
  await mkdir(path.join(output, "screenshots"), { recursive: true });
  for (const item of items) await copyFile(item.file, path.join(output, item.src));
  const noteFile = path.join(input, "review-note.txt");
  const reviewNote = files.includes(noteFile) ? (await readFile(noteFile, "utf8")).trim() : "";
  await writeFile(path.join(output, "index.html"), renderGallery(items, reviewNote), "utf8");
  console.log(`Created ${path.join(output, "index.html")} with ${items.length} screenshots.`);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
