---
version: 1
slug: "src-app-pages-notatki-tsx"
primary_target: "src/app/pages/Notatki.tsx"
related_targets: ["src/app/data/notesWorkspace.ts","src/styles/notes.css"]
---

## Intent

Operate. This surface is a fast, local-first capture desk for short notes and actionable checklists.

## Information architecture

- A compact filing sidebar switches between all, pinned, recent, archived, custom lists, and tags.
- The main canvas presents pinned notes first, followed by the current filtered collection.
- A docked detail editor is the single place for creating and editing note content, metadata, and state.

## Interaction contract

- Notes may be text or checklists, carry a restrained color marker, belong to one list, and contain multiple tags.
- Pinning, archiving, restoring, checklist completion, editing, and deletion are available without leaving the module.
- Search and sorting operate on the current collection; data is persisted in localStorage.
- Destructive deletion requires confirmation; archive is the reversible alternative.

## Visual direction

The surface uses Routine's graphite workshop language as a pinned desk with a live detail editor. Color remains metadata, expressed as a narrow top marker and subtle tint rather than decorative sticky-note styling.

## Memorable element

The pinned shelf and directly actionable checklist previews make the module feel like a working desk rather than a passive card gallery.

## Responsive behavior

The filing sidebar collapses into a view selector, note cards become a single column, and the editor takes over the viewport when open.

## Deferred

Cross-module links, sharing, export, synchronization, rich text, attachments, and collaborative editing remain outside this local MVP.
