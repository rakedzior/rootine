import type { AssistantPanelSpec, AssistantView } from "../panels/panel-schemas";

export type AssistantPresentationSnapshot = {
  view: AssistantView | null;
  highlightedEntityIds: string[];
};

const EMPTY_SNAPSHOT: AssistantPresentationSnapshot = {
  view: null,
  highlightedEntityIds: [],
};

export class AssistantPresentationController {
  private snapshot = EMPTY_SNAPSHOT;
  private readonly listeners = new Set<() => void>();

  getSnapshot = () => this.snapshot;

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  present(view: AssistantView) {
    this.snapshot = { ...this.snapshot, view };
    this.emit();
  }

  update(patch: { title?: string; layout?: AssistantView["layout"]; panels?: AssistantPanelSpec[] }) {
    if (!this.snapshot.view) return false;
    this.snapshot = { ...this.snapshot, view: { ...this.snapshot.view, ...patch } };
    this.emit();
    return true;
  }

  addOrReplacePanel(panel: AssistantPanelSpec, options: { title?: string; layout?: AssistantView["layout"] } = {}) {
    const current = this.snapshot.view;
    const panels = current
      ? [...current.panels.filter((candidate) => candidate.id !== panel.id), panel].slice(-6)
      : [panel];
    this.present({
      id: current?.id ?? `view-${Date.now().toString(36)}`,
      title: options.title ?? current?.title ?? panel.title ?? "Wynik",
      layout: options.layout ?? current?.layout ?? "focus_with_supporting",
      panels,
      highlightArea: current?.highlightArea,
    });
  }

  clear() {
    this.snapshot = EMPTY_SNAPSHOT;
    this.emit();
  }

  highlight(entityIds: readonly string[]) {
    this.snapshot = { ...this.snapshot, highlightedEntityIds: [...new Set(entityIds)].slice(0, 20) };
    this.emit();
  }

  private emit() {
    this.listeners.forEach((listener) => listener());
  }
}
