import {onDocumentCreated, onDocumentUpdated, FirestoreEvent, Change} from "firebase-functions/v2/firestore";
import {onSchedule} from "firebase-functions/v2/scheduler";
import {initializeApp} from "firebase-admin/app";
import {getFirestore, QueryDocumentSnapshot} from "firebase-admin/firestore";
import {Task, TaskStatus, Priority, DEFAULT_WIP_LIMITS, STALE_TASK_DAYS} from "./types";

// Initialize Firebase Admin SDK
initializeApp();
const db = getFirestore();

// ===============================================
// WIP LIMIT ENFORCEMENT FUNCTIONS
// ===============================================

/**
 * FUNCTION 1: Enforce WIP limits when a task is CREATED
 *
 * This runs automatically every time someone creates a new task.
 * If the new task would exceed WIP limits, we reject the creation.
 */
export const enforceWipOnCreate = onDocumentCreated(
  "tasks/{taskId}",
  async (event: FirestoreEvent<QueryDocumentSnapshot | undefined, { taskId: string }>) => {
    const snapshot = event.data;
    if (!snapshot) return;

    const newTask = snapshot.data() as Task;

    // Only enforce limits for tasks moving into "Today" status
    if (newTask.status !== TaskStatus.TODAY) {
      console.log(`Task ${newTask.id} is not in Today status, skipping WIP check`);
      return;
    }

    console.log(`Checking WIP limits for new task: ${newTask.id} (${newTask.priority})`);

    // Check if this would exceed WIP limits
    const wouldExceedLimits = await checkWipLimits(newTask.owner, newTask.priority);

    if (wouldExceedLimits) {
      // Delete the task that was just created (rollback)
      await snapshot.ref.delete();

      // Log the violation
      console.error(`WIP limit exceeded! Deleted task ${newTask.id} for user ${newTask.owner}`);

      // In a real app, you'd also send an error message to the frontend
      // Firebase doesn't have a direct way to return errors from onCreate triggers
      // so the frontend should check WIP limits before creating tasks
    } else {
      console.log(`WIP limits OK for task ${newTask.id}`);
    }
  }
);

/**
 * FUNCTION 2: Enforce WIP limits when a task is UPDATED
 *
 * This runs automatically every time someone updates a task.
 * If the update would exceed WIP limits, we reject the change.
 */
export const enforceWipOnUpdate = onDocumentUpdated(
  "tasks/{taskId}",
  async (event: FirestoreEvent<Change<QueryDocumentSnapshot> | undefined, { taskId: string }>) => {
    const beforeData = event.data?.before.data() as Task;
    const afterData = event.data?.after.data() as Task;

    if (!beforeData || !afterData) return;

    // Only care about status changes that move tasks INTO "Today"
    const wasInToday = beforeData.status === TaskStatus.TODAY;
    const nowInToday = afterData.status === TaskStatus.TODAY;

    // If task wasn't in Today before but is now, check WIP limits
    if (!wasInToday && nowInToday) {
      console.log(`Task ${afterData.id} moved to Today status, checking WIP limits`);

      const wouldExceedLimits = await checkWipLimits(afterData.owner, afterData.priority);

      if (wouldExceedLimits) {
        // Revert the change by restoring the old data
        await event.data?.after.ref.set(beforeData);

        console.error(`WIP limit exceeded! Reverted task ${afterData.id} status change`);
      } else {
        console.log(`WIP limits OK for task ${afterData.id} status change`);
      }
    }

    // Also check if task completed - set completedOn timestamp
    if (beforeData.status !== TaskStatus.DONE && afterData.status === TaskStatus.DONE) {
      await event.data?.after.ref.update({
        completedOn: new Date(),
      });
      console.log(`Task ${afterData.id} marked as completed`);
    }
  }
);

// ===============================================
// DAILY TRIAGE FUNCTION
// ===============================================

/**
 * FUNCTION 3: Daily Triage Job
 *
 * Runs every day at 6:00 AM Paris time.
 * Resets the day by moving unfinished "Today" tasks back to "Backlog"
 * and promoting new tasks from "Backlog" to "Today" within WIP limits.
 */
export const dailyTriage = onSchedule(
  {
    schedule: "0 6 * * *", // Every day at 6:00 AM
    timeZone: "Europe/Paris",
  },
  async () => {
    console.log("Starting daily triage job...");

    try {
      // Step 1: Move all unfinished "Today" tasks back to "Backlog"
      const todayTasksQuery = db.collection("tasks")
        .where("status", "==", TaskStatus.TODAY)
        .where("status", "!=", TaskStatus.DONE); // Don't move completed tasks

      const todayTasksSnapshot = await todayTasksQuery.get();
      const batch1 = db.batch();

      todayTasksSnapshot.docs.forEach((doc) => {
        batch1.update(doc.ref, {status: TaskStatus.BACKLOG});
      });

      await batch1.commit();
      console.log(`Moved ${todayTasksSnapshot.size} unfinished tasks from Today to Backlog`);

      // Step 2: Get all users who have backlog tasks
      const backlogTasksQuery = db.collection("tasks")
        .where("status", "==", TaskStatus.BACKLOG)
        .orderBy("createdOn", "asc"); // Oldest first

      const backlogTasksSnapshot = await backlogTasksQuery.get();

      // Group tasks by user
      const tasksByUser: { [userId: string]: Task[] } = {};
      backlogTasksSnapshot.docs.forEach((doc) => {
        const task = doc.data() as Task;
        if (!tasksByUser[task.owner]) {
          tasksByUser[task.owner] = [];
        }
        tasksByUser[task.owner].push(task);
      });

      // Step 3: For each user, promote tasks to Today within WIP limits
      const batch2 = db.batch();
      let totalPromoted = 0;

      for (const [userId, userTasks] of Object.entries(tasksByUser)) {
        // Separate by priority
        const p1Tasks = userTasks.filter((t) => t.priority === Priority.P1);
        const p2Tasks = userTasks.filter((t) => t.priority === Priority.P2);

        // Promote up to 3 P1 tasks
        const p1ToPromote = p1Tasks.slice(0, DEFAULT_WIP_LIMITS.p1MaxToday);
        p1ToPromote.forEach((task) => {
          const taskRef = db.collection("tasks").doc(task.id);
          batch2.update(taskRef, {status: TaskStatus.TODAY});
          totalPromoted++;
        });

        // Promote up to 5 P2 tasks
        const p2ToPromote = p2Tasks.slice(0, DEFAULT_WIP_LIMITS.p2MaxToday);
        p2ToPromote.forEach((task) => {
          const taskRef = db.collection("tasks").doc(task.id);
          batch2.update(taskRef, {status: TaskStatus.TODAY});
          totalPromoted++;
        });

        console.log(`User ${userId}: Promoted ${p1ToPromote.length} P1 and ${p2ToPromote.length} P2 tasks`);
      }

      await batch2.commit();
      console.log(`Daily triage complete! Promoted ${totalPromoted} total tasks to Today`);
    } catch (error) {
      console.error("Daily triage failed:", error);
    }
  }
);

// ===============================================
// ARCHIVE OLD TASKS FUNCTION
// ===============================================

/**
 * FUNCTION 4: Archive Stale Tasks
 *
 * Runs daily after triage to clean up old tasks.
 * Moves tasks in "Backlog" older than 90 days to "Archive".
 */
export const archiveOldTasks = onSchedule(
  {
    schedule: "30 6 * * *", // Every day at 6:30 AM (after triage)
    timeZone: "Europe/Paris",
  },
  async () => {
    console.log("Starting archive old tasks job...");

    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - STALE_TASK_DAYS);

      const staleTasksQuery = db.collection("tasks")
        .where("status", "==", TaskStatus.BACKLOG)
        .where("createdOn", "<", cutoffDate);

      const staleTasksSnapshot = await staleTasksQuery.get();

      if (staleTasksSnapshot.empty) {
        console.log("No stale tasks to archive");
        return;
      }

      const batch = db.batch();
      staleTasksSnapshot.docs.forEach((doc) => {
        batch.update(doc.ref, {status: TaskStatus.ARCHIVE});
      });

      await batch.commit();
      console.log(`Archived ${staleTasksSnapshot.size} stale tasks`);
    } catch (error) {
      console.error("Archive old tasks failed:", error);
    }
  }
);

// ===============================================
// HELPER FUNCTIONS
// ===============================================

/**
 * Check if adding a task with the given priority would exceed WIP limits
 * for the specified user.
 */
async function checkWipLimits(userId: string, priority: Priority): Promise<boolean> {
  // Only enforce limits for P1 and P2 tasks
  if (priority !== Priority.P1 && priority !== Priority.P2) {
    return false; // P3 and P4 tasks have no limits
  }

  // Count current tasks in "Today" status for this user and priority
  const currentTasksQuery = db.collection("tasks")
    .where("owner", "==", userId)
    .where("status", "==", TaskStatus.TODAY)
    .where("priority", "==", priority);

  const currentTasksSnapshot = await currentTasksQuery.get();
  const currentCount = currentTasksSnapshot.size;

  // Check against limits
  const limit = priority === Priority.P1 ?
    DEFAULT_WIP_LIMITS.p1MaxToday :
    DEFAULT_WIP_LIMITS.p2MaxToday;

  const wouldExceed = (currentCount + 1) > limit;

  console.log(`User ${userId} has ${currentCount} ${priority} tasks in Today, limit is ${limit}, would exceed: ${wouldExceed}`);

  return wouldExceed;
}
