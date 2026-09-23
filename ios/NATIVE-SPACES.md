# Native spaces redesign

Latest verification: the corrected redesign builds with Xcode 26.3 and all
14 remaining-spaces UI tests pass on iPhone 14 / iOS 26.3. Fresh screenshots
passed independent visual review. The final unit run passed: 179 total,
177 passed, two explicitly skipped and no failures. The final build and 13
recaptures are complete; the latest app is installed and running on the user's
original preview simulator, with the More screen visually verified.

## Screen structure

The remaining spaces use the existing graphite SwiftUI theme. Their navigation
has a compact native inline title, profile on the left and a contextual add
button on the right. Profile opens account details, settings, backups and help.
Today and Calendar retain their approved content; the profile entry is added
to their navigation.

- Nutrition: date navigation, calories eaten/remaining/target, macro totals and
  remaining amounts, a compact water control, then breakfast/lunch/dinner/snacks.
  Each meal shows its own totals and an add button. Existing goals, analysis,
  saved meals and barcode capture remain available.
- More: space tiles immediately below navigation, without the old summary.
  The add menu opens the chosen space's editor after the menu has closed.
- Notes: search, folders, pinned notes and archive.
- Sport: a week rail, planned/completed sessions and training totals.
- Goals: category selection, progress, history and milestone editing.
- Work: focus, projects, status filters, tasks and existing priorities.
- Travel: trip status, itinerary editing/order and packing.
- Health: daily check-in, recent energy history and reminders.
- Affairs: matters, payments/subscriptions, documents, vehicles and budget.

## Implemented gesture mappings

These mappings describe the source implementation; the verified interaction
subset is listed below. Tap opens the item; a hold menu exposes relevant named
alternatives. Destructive actions use confirmation or undo. Horizontal record
actions preserve vertical scrolling and have named accessibility actions.

| Space / item | Swipe right | Swipe left | Drag |
| --- | --- | --- | --- |
| Nutrition entry | Edit | Confirm removal | Move to another meal category |
| More tile | — | — | Reorder tiles, saved per account |
| Note | Pin / unpin | Archive / restore | Move to a folder |
| Workout | Complete / undo | Edit | Reschedule onto a day in the week rail |
| Goal | Record progress / restore archived | Edit | Move to a category |
| Goal milestone | — | — | Reorder milestones |
| Work task | Complete / undo | Edit | Change project or status |
| Trip | Complete / restore | Edit | — |
| Itinerary item | Confirm / undo reservation | Edit | Reorder within the same trip |
| Health check-in | Edit | Confirm removal | — |
| Health reminder | Complete / undo | Edit | — |
| Matter / one-time payment | Complete or paid / undo | Edit | — |
| Recurring payment / subscription | Pause / resume | Edit | — |
| Document | Edit | Confirm removal | — |
| Vehicle reminder | Complete / undo | Edit | — |

Moving a work task with subtasks across projects is restricted to preserve the
existing task hierarchy. There is no artificial drag action for records where
position has no domain meaning.

## Verification status

The latest build and all 14 `RemainingSpacesUITests` passed on Xcode 26.3 /
iPhone 14 / iOS 26.3. Coverage includes More and its add chooser, Notes CRUD
with hold/swipe actions and relaunch persistence, Sport drag-to-date and swipe
actions with relaunch persistence, all seven module preview/add flows,
Today/Calendar profile controls, and the corrected header/nutrition flows.
The previous three UI failures are resolved. Reports and captures are in
`output/ios-spaces/20260923T210209775Z-721a6a8f/artifacts-ui/`.

Fresh independent visual review returned **ship**. Adaptive placeholder contrast
measured 8.15:1 in Notes and 7.01:1 in Work; Health now has one heading. Two
light-mode and two XXXL Dynamic Type samples showed no material clipping.
The reviewed forms use persistent labels, labeled `Katalog` / `Wpis ręczny`
nutrition modes, a native optional matter date, and one deletion confirmation
for Workout, Goal and Health reminder details.

The final `RootineTests` run passed: **179 total, 177 passed, two skipped,
zero failures**. Its report is `artifacts-unit-final/test-summary.json` beside
the UI evidence. It includes `TravelInteractionTests` and
`RemainingSpacesModelTests`, plus corrections for lossless sync mapping, opaque
IDs and null notes, account-scoped cursors, reconnect/legacy flags, notification
metadata and DST, and two stale Today test expectations. These changes did not
alter SwiftUI screen layouts after the passing UI run.

The skips are the opt-in native application smoke test (`ROOTINE_UI_SMOKE` was
not enabled; UI tests ran separately) and the file-protection capability check
because Simulator Foundation returned no protection attribute. Physical-device
file protection still needs a device check; deletion checks remain unconditional.

Unit test-host launch is unblocked by the per-invocation argument
`-IDERunOperationLaunchesWithoutSuspendingCausingPossibleLossOfEarlyDiagnostics=YES`.
The runner uses this with its disposable headless scheme. Local
`node scripts/ios-project-audit.mjs` and `git diff --check` checks also pass.

The trusted Mac is reachable at `rafal@172.20.10.4`, configured in
`.local/ios-remote.json`. Tests use the separate verification simulator
`35728ECB-E355-4583-9361-8D10A04C0E2A`. Final evidence is in `artifacts-final/`:
the build passed, 13 static recaptures completed, and the latest app was installed
and launched on the original preview `0DD46927-6D07-493E-BD3E-7EEDEF491BDD`.
Simulator is open, and `opened-more.png` was visually checked for a valid More
screen. The latest 13 captures are also included in the review folder and gallery.

## Repeatable verification and review

From Windows, with the SSH destination saved in `.local/ios-remote.json`, run:

```powershell
.\scripts\ios-verify-spaces.ps1 -Device 35728ECB-E355-4583-9361-8D10A04C0E2A
```

Alternatively supply `-Mac user@address`, and `-IdentityFile <path>` if needed.
`-Device <UDID>` selects the dedicated verification simulator. Run this
workflow sequentially with other preview builds. The script sends the current
Windows iOS source to an isolated Mac run, runs remaining-spaces UI tests first
and unit tests separately, then builds independently for review and captures
the spaces with selected light-mode and larger Dynamic Type samples. Each test
suite has its own logs, report and attachments. Raw `.xcresult` bundles remain
on the Mac and download as `.tar.gz` archives to avoid Windows path-length
limits. Results return to `output/ios-spaces/<run>/`. The runner restores the
selected simulator's appearance/text size and relaunches its preview app.

The latest reviewed PNG evidence is in `output/ios-spaces/review/`. The
[review gallery](../output/ios-spaces/gallery/index.html) contains 36 actual PNG
captures without source-image crops, including the corrected screens and the
light/XXXL samples. Screenshots document appearance; the separate test reports
establish execution results.

Preview launch arguments: `--rootine-preview-nutrition`,
`--rootine-preview-more`, and `--rootine-preview-module=<module>`, where module is
`notes`, `sport`, `goals`, `work`, `travel`, `health` or `affairs`.

Source boundaries: `AppShellView.swift` owns navigation/profile/More;
`RootineTheme.swift` owns shared chrome and swipe recognition;
`NutritionView.swift`, `ProductivityModules.swift` and `LifeModules.swift` own the
domain screens. The surface brief is `.impeccable/surfaces/ios-spaces.md`.
