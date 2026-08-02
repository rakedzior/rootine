import { domainEventBus } from "../infrastructure/events";
import * as affairsQueries from "./affairs/affairsQueries";
import * as affairsService from "./affairs/affairsService";
import * as calendarQueries from "./calendar/calendarQueries";
import * as goalQueries from "./goals/goalQueries";
import * as goalService from "./goals/goalService";
import * as noteQueries from "./notes/noteQueries";
import * as noteService from "./notes/noteService";
import * as nutritionQueries from "./nutrition/nutritionQueries";
import * as nutritionService from "./nutrition/nutritionService";
import * as sportQueries from "./sport/sportQueries";
import * as sportService from "./sport/sportService";
import * as taskQueries from "./tasks/taskQueries";
import * as taskService from "./tasks/taskService";
import * as todayQueries from "./today/todayQueries";
import * as travelQueries from "./travel/travelQueries";
import * as travelService from "./travel/travelService";
import * as workQueries from "./work/workQueries";
import * as workService from "./work/workService";
import { domainUndoManager } from "./shared/undoManager";

export function createRootineDomainServices() {
  const habits = Object.freeze({
    getHabitsForDate: taskQueries.getHabitsForDate,
    completeHabit: taskService.completeHabit,
    uncompleteHabit: taskService.uncompleteHabit,
  });
  const finance = Object.freeze({
    getFinanceSummary: affairsQueries.getFinanceSummary,
    markPaymentPaid: affairsService.markPaymentPaid,
  });
  return Object.freeze({
    events: domainEventBus,
    undo: Object.freeze({ execute: (token: string) => domainUndoManager.undo(token) }),
    tasks: Object.freeze({
      searchTasks: taskQueries.searchTasks,
      resolveTaskQuery: taskQueries.resolveTaskQuery,
      getTasksForDate: taskQueries.getTasksForDate,
      getPriorityTasks: taskQueries.getPriorityTasks,
      getOverdueTasks: taskQueries.getOverdueTasks,
      getHabitsForDate: taskQueries.getHabitsForDate,
      createTask: taskService.createTask,
      completeTask: taskService.completeTask,
      uncompleteTask: taskService.uncompleteTask,
      rescheduleTask: taskService.rescheduleTask,
      setTaskPriority: taskService.setTaskPriority,
      completeHabit: taskService.completeHabit,
      uncompleteHabit: taskService.uncompleteHabit,
    }),
    calendar: Object.freeze({
      getCalendarWeek: calendarQueries.getCalendarWeek,
      findCalendarConflicts: calendarQueries.findCalendarConflicts,
    }),
    habits,
    nutrition: Object.freeze({
      searchFoodProducts: nutritionQueries.searchFoodProducts,
      getNutritionSummary: nutritionQueries.getNutritionSummary,
      getWaterSummary: nutritionQueries.getWaterSummary,
      getRecentMeals: nutritionQueries.getRecentMeals,
      getBodySummary: nutritionQueries.getBodySummary,
      addWater: nutritionService.addWater,
      createMealDraft: nutritionService.createMealDraft,
      updateMealDraft: nutritionService.updateMealDraft,
      commitMealDraft: nutritionService.commitMealDraft,
    }),
    sport: Object.freeze({
      getUpcomingWorkouts: sportQueries.getUpcomingWorkouts,
      searchWorkouts: sportQueries.searchWorkouts,
      resolveWorkoutQuery: sportQueries.resolveWorkoutQuery,
      getSportSummary: sportQueries.getSportSummary,
      completeWorkout: sportService.completeWorkout,
      rescheduleWorkout: sportService.rescheduleWorkout,
      createWorkout: sportService.createWorkout,
    }),
    work: Object.freeze({
      searchWorkItems: workQueries.searchWorkItems,
      resolveWorkItemQuery: workQueries.resolveWorkItemQuery,
      getWorkSummary: workQueries.getWorkSummary,
      createWorkItem: workService.createWorkItem,
      setWorkItemCompletion: workService.setWorkItemCompletion,
      completeWorkItem: workService.completeWorkItem,
      uncompleteWorkItem: workService.uncompleteWorkItem,
    }),
    goals: Object.freeze({
      getGoalsSummary: goalQueries.getGoalsSummary,
      getGoalDetails: goalQueries.getGoalDetails,
      getUpcomingMilestones: goalQueries.getUpcomingMilestones,
      updateGoalProgress: goalService.updateGoalProgress,
      completeMilestone: goalService.completeMilestone,
    }),
    affairs: Object.freeze({
      searchMatters: affairsQueries.searchMatters,
      resolveMatterQuery: affairsQueries.resolveMatterQuery,
      getMattersSummary: affairsQueries.getMattersSummary,
      getFinanceSummary: affairsQueries.getFinanceSummary,
      setMatterCompletion: affairsService.setMatterCompletion,
      rescheduleMatter: affairsService.rescheduleMatter,
      markPaymentPaid: affairsService.markPaymentPaid,
    }),
    finance,
    notes: Object.freeze({
      searchNotes: noteQueries.searchNotes,
      getNoteMetadata: noteQueries.getNoteMetadata,
      createNote: noteService.createNote,
    }),
    travel: Object.freeze({
      getTravelSummary: travelQueries.getTravelSummary,
      searchTravelTasks: travelQueries.searchTravelTasks,
      resolveTravelTaskQuery: travelQueries.resolveTravelTaskQuery,
      setTravelTaskCompletion: travelService.setTravelTaskCompletion,
    }),
    today: Object.freeze({ getTodayOverview: todayQueries.getTodayOverview }),
  });
}

export type RootineDomainServices = ReturnType<typeof createRootineDomainServices>;
