// ===============================================
// DATA MODELS FOR TASK MANAGER APP
// ===============================================

// These are like blueprints that define the exact shape of our data
// TypeScript will enforce these rules and catch errors before runtime

// -----------------------------------------------
// ENUMS: Fixed lists of allowed values
// -----------------------------------------------

// Project status can only be one of these 4 values
export enum ProjectStatus {
  PLANNING = 'Planning',
  ACTIVE = 'Active',
  ON_HOLD = 'On Hold',
  COMPLETED = 'Completed'
}

// Task status can only be one of these 4 values
export enum TaskStatus {
  BACKLOG = 'Backlog',
  TODAY = 'Today',
  DONE = 'Done',
  ARCHIVE = 'Archive'
}

// Priority levels - P1 is highest, P4 is lowest
export enum Priority {
  P1 = 'P1',
  P2 = 'P2',
  P3 = 'P3',
  P4 = 'P4'
}

// -----------------------------------------------
// INTERFACES: Data structure blueprints
// -----------------------------------------------

// PROJECT INTERFACE
// This defines exactly what a project object must look like
export interface Project {
  id: string;                    // Firestore document ID
  name: string;                  // Required: "Website Redesign"
  description?: string;          // Optional: ? means it can be undefined
  status: ProjectStatus;         // Must be one of the enum values above
  priority: Priority;            // P1, P2, P3, or P4
  createdOn: Date;              // When this project was created
}

// TASK INTERFACE
// This defines exactly what a task object must look like
export interface Task {
  id: string;                    // Firestore document ID
  projectId: string;             // Which project this task belongs to
  owner: string;                 // Firebase UID of the user who owns this task
  title: string;                 // Required: "Fix login bug"
  description?: string;          // Optional: detailed description
  priority: Priority;            // P1, P2, P3, or P4
  status: TaskStatus;            // Backlog, Today, Done, or Archive
  createdOn: Date;              // When this task was created
  dueDate?: Date;               // Optional: when this should be done by
  completedOn?: Date;           // Optional: when this was actually completed
}

// -----------------------------------------------
// UTILITY TYPES FOR OUR BUSINESS LOGIC
// -----------------------------------------------

// For our WIP limit validation
export interface WipLimits {
  p1MaxToday: number;           // Max P1 tasks allowed in Today status (3)
  p2MaxToday: number;           // Max P2 tasks allowed in Today status (5)
}

// For the daily triage function results
export interface TriageResult {
  movedToBacklog: Task[];       // Tasks moved from Today → Backlog
  promotedToToday: Task[];      // Tasks moved from Backlog → Today
  archivedTasks: Task[];        // Tasks moved to Archive (if stale)
  totalProcessed: number;       // How many tasks we looked at
}

// -----------------------------------------------
// CONSTANTS
// -----------------------------------------------

// Our WIP limits - these enforce focus and prevent overcommitment
export const DEFAULT_WIP_LIMITS: WipLimits = {
  p1MaxToday: 3,               // Only 3 high-priority tasks per day
  p2MaxToday: 5                // Only 5 medium-priority tasks per day
};

// How many days before a Backlog task gets archived
export const STALE_TASK_DAYS = 90;
