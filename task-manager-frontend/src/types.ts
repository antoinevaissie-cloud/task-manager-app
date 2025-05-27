// ===============================================
// DATA MODELS FOR TASK MANAGER APP
// ===============================================

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

// PROJECT INTERFACE
export interface Project {
  id: string;
  name: string;
  description?: string;
  status: ProjectStatus;
  priority: Priority;
  createdOn: Date;
}

// TASK INTERFACE - Updated with URLs and Attachments
export interface Task {
  id: string;
  projectId: string;
  owner: string;
  title: string;
  description?: string;
  priority: Priority;
  status: TaskStatus;
  createdOn: Date;
  dueDate?: Date;
  completedOn?: Date;
  urls?: string[];          // NEW: Array of URLs/links
  attachments?: string[];   // NEW: Array of attachment names
}

// For our WIP limit validation
export interface WipLimits {
  p1MaxToday: number;
  p2MaxToday: number;
}

// For the daily triage function results
export interface TriageResult {
  movedToBacklog: Task[];
  promotedToToday: Task[];
  archivedTasks: Task[];
  totalProcessed: number;
}

// Our WIP limits
export const DEFAULT_WIP_LIMITS: WipLimits = {
  p1MaxToday: 3,
  p2MaxToday: 5
};

// How many days before a Backlog task gets archived
export const STALE_TASK_DAYS = 90;
