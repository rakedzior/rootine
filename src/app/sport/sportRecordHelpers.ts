import { templateSections, type Exercise, type WorkoutTemplate } from "./model";

export function exercisePreview(exercise: Exercise | undefined) {
  if (!exercise) return "Ćwiczenie usunięte z biblioteki";
  return `${exercise.name} · ${exercise.primaryMuscle}`;
}

export function exerciseCountForTemplate(template: WorkoutTemplate, exerciseId: string) {
  return templateSections(template)
    .flatMap((section) => section.items)
    .filter((item) => item.exerciseId === exerciseId).length;
}
