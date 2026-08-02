export type RootineDomain =
  | "tasks"
  | "habits"
  | "nutrition"
  | "sport"
  | "work"
  | "goals"
  | "affairs"
  | "finance"
  | "notes"
  | "travel"
  | "today"
  | "undo";

export interface DomainEventPayloads {
  "task.created": { title: string; dueDate: string | null };
  "task.completed": { completed: true; occurrenceDate?: string };
  "task.uncompleted": { completed: false; occurrenceDate?: string };
  "task.rescheduled": { previousDate: string | null; nextDate: string };
  "task.priority_changed": { previousPriority: string | null; nextPriority: string };
  "habit.completed": { date: string; completed: true };
  "habit.uncompleted": { date: string; completed: false };
  "nutrition.water_added": { date: string; previousMl: number; nextMl: number; addedMl: number };
  "nutrition.meal_committed": { date: string; meal: string; entryCount: number };
  "sport.workout_completed": { workoutId: string; date: string };
  "sport.workout_rescheduled": { previousDate: string; nextDate: string };
  "sport.workout_created": { title: string; date: string };
  "work.item_created": { title: string; projectId: string };
  "work.item_completed": { completed: boolean; projectId: string };
  "goal.progress_updated": { previousValue: number; nextValue: number };
  "goal.milestone_completed": { milestoneId: string; completed: boolean };
  "affairs.matter_completed": { completed: boolean };
  "affairs.matter_rescheduled": { previousDate: string; nextDate: string };
  "affairs.payment_paid": { paid: boolean; amount: number };
  "note.created": { title: string; listId: string };
  "travel.task_completed": { tripId: string; completed: boolean };
  "undo.applied": { originalEventId: string; originalEventType: DomainEventType };
}

export type DomainEventType = keyof DomainEventPayloads;

export type DomainEvent<TType extends DomainEventType = DomainEventType> = Readonly<{
  id: string;
  type: TType;
  domain: RootineDomain;
  entityId: string;
  occurredAt: string;
  payload: Readonly<DomainEventPayloads[TType]>;
}>;

export interface DomainEventInput<TType extends DomainEventType> {
  type: TType;
  domain: RootineDomain;
  entityId: string;
  payload: DomainEventPayloads[TType];
}
