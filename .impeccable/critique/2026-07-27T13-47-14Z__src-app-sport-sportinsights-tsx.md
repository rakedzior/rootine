---
target: Sport > Dzisiaj — czy czegoś brakuje ekranowi po redesignie
total_score: 24
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 3
timestamp: 2026-07-27T13-47-14Z
slug: src-app-sport-sportinsights-tsx
---
## Method

Dual-agent assessment: independent design review plus independent detector/render evidence.

## Design Health Score

| # | Heuristic | Score | Key issue |
|---|---|---:|---|
| 1 | Visibility of System Status | 2 | Active session can still look pending; timer and current exercise are not visible in the main module. |
| 2 | Match Between System and Real World | 4 | “Plan dnia”, “Wykonany” and “Na jutro” follow the user’s mental model. |
| 3 | User Control and Freedom | 2 | Moving has visible undo, while marking complete and edits made from Today have weaker recovery. |
| 4 | Consistency and Standards | 3 | Components are consistent, but “Dodaj trening” competes with “Rozpocznij/Wznów”. |
| 5 | Error Prevention | 2 | Single-session conflict is handled, but unsaved plan edits can be made from Today without an available Save action. |
| 6 | Recognition Rather Than Recall | 3 | Core actions and dates are visible; record clickability and mobile week overflow are not self-evident. |
| 7 | Flexibility and Efficiency | 2 | Quick actions help, but there is no stronger resume/next-workout path and repeated row actions will not scale. |
| 8 | Aesthetic and Minimalist Design | 3 | Calm and focused, but the remaining-state copy is duplicated and primary-action hierarchy is diluted. |
| 9 | Error Recovery | 2 | Out-of-cycle messaging and move undo help; save failure and other state changes need clearer recovery. |
| 10 | Help and Documentation | 1 | Empty cycle and uncommon interactions do not provide enough contextual guidance. |
| **Total** |  | **24/40** | **Acceptable foundation; state hierarchy needs another pass.** |

## Design Specificity Verdict

The screen now feels authored for a training product rather than interchangeable with a generic dashboard. The sequence “day context → agenda → current week” and the actions “Start / Complete / Tomorrow” map well to the real task.

What is missing is not another KPI block. It is a consistent state contract: what matters now, whether a session is running, whether an edit is saved, and how the user returns after a mistake. Streaks, calories, readiness scores, records and motivational content would add dashboard noise without improving the primary job.

The deterministic detector returned zero findings for `src/app/sport/SportInsights.tsx`. That clean result confirms there are no rule-level anti-pattern matches, but it does not invalidate the state and interaction gaps found in the design review. Browser overlay injection was unavailable; supplied and fresh headless Chrome renders were used instead.

## Overall Impression

The redesigned layout is materially better: the empty right side is gone and the module has a clear operating structure. The single biggest opportunity is to turn it from a static plan into a live command center. When a workout starts, the screen should unmistakably become “resume the current session”, not continue to present the workout as pending.

## Cognitive Load

Moderate: 3 of 8 checklist items fail.

- Single focus fails because “Dodaj trening” and “Rozpocznij” both look primary.
- Visual hierarchy is weakened because a planning action in the page header can outrank the execution action.
- Minimal choices is borderline: Add, Open week, Start, Complete, Tomorrow and record-details click create six decisions in one context.
- Chunking, grouping, visible context, working-memory support and progressive disclosure are otherwise strong.
- With more workouts, repeating three actions in every row will become a wall of controls.

## Emotional Journey

Entry is calm and orienting: day, workload and week are visible. The natural peak should be Start/Resume, but the page-header Add button weakens it. The main emotional valley is returning to an active session without immediately seeing the live timer and current exercise. Completion is also too flat: “Gotowe” confirms state, but a concise close such as “65 min completed · next workout Wednesday” would create calm closure without gamification.

## What’s Working

- The two-part Today module has the right logic: context on the left, action on the right, and a natural mobile order.
- The current week adds useful context without forcing the user into the planner.
- “Na jutro” with a timed Undo is a strong model for safe, low-friction operations.

## Priority Issues

### [P1] Reversed primary-action hierarchy

**Why it matters:** Today is primarily for execution, but “Dodaj trening” can visually outrank Start/Resume.

**Fix:** Make Start or Resume the dominant action whenever a workout exists. Move Add to a quiet secondary action or use it as the primary action only in the empty-day state.

**Suggested command:** `$impeccable layout`

### [P1] Active session has no durable main-screen contract

**Why it matters:** An in-progress workout is still counted as pending because the Today summary only checks outcomes. The row can continue to say “Rozpocznij”, even though clicking it actually resumes the session.

**Fix:** Derive Today state from both outcomes and the active session. Replace pending copy and Start with a compact live strip containing elapsed time, current exercise or stage, rest timer/postęp and one “Wznów” action.

**Suggested command:** `$impeccable clarify`

### [P1] Unsaved edits can originate from Today without a visible save path

**Why it matters:** Editing or deleting through the detail panel changes the cycle draft, while Save and dirty-state messaging are exposed only in Cycle. The user can believe a change is permanent when refresh can lose it.

**Fix:** Either autosave operational edits made from Today, or expose a persistent “Niezapisane zmiany · Zapisz” notice until the draft is saved.

**Suggested command:** `$impeccable harden`

### [P2] Mobile week hides future workouts without a clear affordance

**Why it matters:** The seven-day grid intentionally scrolls horizontally, but the 500 px render gives no cue that Friday–Sunday remain offscreen.

**Fix:** Add scroll snap and a visible edge cue, or replace the mobile grid with “Today + Next workouts” while preserving the full week on desktop.

**Suggested command:** `$impeccable adapt`

### [P2] State messaging and accessibility need a cleanup pass

**Why it matters:** “1 trening przed Tobą” and “1 do wykonania” duplicate each other. The week section references a missing `sport-current-week-heading` ID, and the chart lacks a robust textual/semantic equivalent.

**Fix:** Keep one day-progress statement, repair the heading relationship, add an accessible week-scroll label and provide a textual analysis summary.

**Suggested command:** `$impeccable audit`

## Persona Red Flags

- **Alex (power user):** no immediate Resume/Next-workout accelerator; repeated row actions will become noisy; unsaved Today edits undermine trust.
- **Sam (accessibility):** the week section’s `aria-labelledby` target is missing; horizontal week navigation has no announced instruction; 9–10 px metadata is demanding for low vision.
- **Casey (mobile):** the strongest Add action sits at the top rather than in the execution flow; no sticky Resume state; future week days can remain invisibly offscreen.

## Minor Observations

- “Dzisiaj” appears in the page description, toolbar/select and Today module.
- Remaining-workout status is duplicated in the agenda heading and badge.
- With one workout, card height should be allowed to follow content rather than being filled with extra metrics.
- Clicking the workout name opens details, but the affordance is subtle.
- The week summary is visually far from its title and uses exceptionally small data text.
- Source confirms all seven days and all workouts remain rendered; the narrow cutoff is intentional scrolling, not lost data.

## Questions to Consider

- Is Today primarily an execution surface or a planning surface—and should Add ever outrank Start/Resume when a workout exists?
- What is the minimum persistent active-session summary: elapsed time, rest timer, current exercise/stage, or series progress?
- On mobile, is the useful answer a seven-column calendar or simply “today and what comes next”?
