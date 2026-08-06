---
version: 1
slug: "src-app-pages-sprawy-tsx"
primary_target: "src/app/pages/Sprawy.tsx"
related_targets: ["src/app/pages/Jdg.tsx","src/app/data/affairsWorkspace.ts","src/app/data/jdgWorkspace.ts","src/styles/affairs.css"]
---

# Sprawy

- Scope: `src/app/pages/Sprawy.tsx` with embedded `src/app/pages/Jdg.tsx`, both local data stores, and `src/styles/affairs.css`.
- Mode: Operate.
- Audience and job: a person managing serious private obligations, household administration, personal finances, documents and vehicles, plus a sole proprietor completing a repeatable monthly close.
- Primary task: see every obligation that requires attention in one persistent overview, then maintain the right specialist register without turning serious obligations into ordinary tasks.
- Content: tasks and appointments, one-time payments, recurring bills, subscriptions and commitment ends, document validity, vehicle insurance/inspection/service by date or mileage, plan-versus-actual budget, travel, and the JDG sequence of documents, settlements, controls, and final close.
- Direction: one quiet responsibility cockpit with grouped local navigation: `Przegląd` and `Do załatwienia`, then `Finanse` and `Pozostałe`. JDG remains a dedicated subview of Sprawy, never a separate global module. Appointment rows expose time and place; categories and tags make subscriptions easy to scan.
- Memorable moment: `Wymaga uwagi` merges deadlines from all specialist registers into one calm, persistent agenda and lets the user schedule, snooze, or resolve each item.
- Constraints: local-only storage with migration of existing data, Polish copy, compact graphite Rootine system, no full sensitive document numbers, customizable JDG items, no legal, financial or tax advice claims. Browser notifications are best-effort while Rootine is open; the persistent in-app overview is the reliable fallback.
- Unresolved: background notifications when Rootine is closed, bank transactions, receipt or document attachments, shared household records, exports, and automatic deadline updates.
