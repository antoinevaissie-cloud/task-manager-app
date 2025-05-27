// Ultra-Modern Minimal Color System for TaskFlow
// Inspired by Linear, Notion, and other premium productivity tools

export const colors = {
  // Primary brand colors (used sparingly)
  primary: {
    50: '#eff6ff',
    100: '#dbeafe',
    200: '#bfdbfe',
    300: '#93c5fd',
    400: '#60a5fa',
    500: '#3b82f6', // Main brand color
    600: '#2563eb',
    700: '#1d4ed8',
    800: '#1e40af',
    900: '#1e3a8a'
  },

  // Neutral grays (main UI colors) - more sophisticated
  neutral: {
    25: '#fcfcfd',
    50: '#f9fafb',
    100: '#f3f4f6',
    200: '#e5e7eb',
    300: '#d1d5db',
    400: '#9ca3af',
    500: '#6b7280',
    600: '#4b5563',
    700: '#374151',
    800: '#1f2937',
    900: '#111827',
    950: '#030712'
  },

  // Semantic colors (very subtle)
  semantic: {
    success: {
      light: '#f0fdf4',
      main: '#16a34a',
      dark: '#15803d'
    },
    warning: {
      light: '#fffbeb',
      main: '#d97706',
      dark: '#92400e'
    },
    error: {
      light: '#fef2f2',
      main: '#dc2626',
      dark: '#991b1b'
    },
    info: {
      light: '#eff6ff',
      main: '#2563eb',
      dark: '#1d4ed8'
    }
  },

  // Ultra-subtle priority indicators (barely visible)
  priority: {
    p1: {
      bg: '#fefefe',
      text: '#374151',
      border: '#fecaca',
      accent: '#dc2626'
    },
    p2: {
      bg: '#fefefe',
      text: '#374151',
      border: '#fed7aa',
      accent: '#d97706'
    },
    p3: {
      bg: '#fefefe',
      text: '#374151',
      border: '#fde68a',
      accent: '#ca8a04'
    },
    p4: {
      bg: '#fefefe',
      text: '#374151',
      border: '#d1d5db',
      accent: '#6b7280'
    }
  },

  // Minimal status colors (almost invisible)
  status: {
    backlog: {
      bg: 'transparent',
      text: '#6b7280',
      border: 'transparent'
    },
    today: {
      bg: 'transparent',
      text: '#374151',
      border: 'transparent'
    },
    done: {
      bg: 'transparent',
      text: '#9ca3af',
      border: 'transparent'
    }
  },

  // Action colors (only place we use real color)
  actions: {
    primary: {
      bg: '#3b82f6',
      hover: '#2563eb',
      text: '#ffffff'
    },
    secondary: {
      bg: 'transparent',
      hover: '#f3f4f6',
      text: '#6b7280',
      border: '#e5e7eb'
    },
    success: {
      bg: '#16a34a',
      hover: '#15803d',
      text: '#ffffff'
    },
    warning: {
      bg: '#d97706',
      hover: '#b45309',
      text: '#ffffff'
    },
    danger: {
      bg: '#dc2626',
      hover: '#b91c1c',
      text: '#ffffff'
    },
    ghost: {
      bg: 'transparent',
      hover: '#f9fafb',
      text: '#6b7280',
      border: 'transparent'
    }
  },

  // Urgency backgrounds (very subtle)
  urgency: {
    overdue: {
      bg: '#fef2f2',
      border: '#fecaca'
    },
    today: {
      bg: '#fffbeb',
      border: '#fed7aa'
    },
    upcoming: {
      bg: '#f0fdf4',
      border: '#bbf7d0'
    },
    normal: {
      bg: '#ffffff',
      border: '#e5e7eb'
    }
  }
};

// Helper functions for sophisticated color usage
export const getStatusColor = (status: string) => {
  switch (status.toLowerCase()) {
    case 'backlog':
      return colors.status.backlog;
    case 'today':
      return colors.status.today;
    case 'done':
      return colors.status.done;
    default:
      return colors.status.backlog;
  }
};

export const getPriorityColor = (priority: string) => {
  switch (priority.toLowerCase()) {
    case 'p1':
      return colors.priority.p1;
    case 'p2':
      return colors.priority.p2;
    case 'p3':
      return colors.priority.p3;
    case 'p4':
      return colors.priority.p4;
    default:
      return colors.priority.p2;
  }
};

export const getUrgencyStyle = (task: any) => {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  if (task.dueDate) {
    const dueDate = new Date(task.dueDate);
    dueDate.setHours(0, 0, 0, 0);

    if (dueDate < today && task.status !== 'done') {
      return colors.urgency.overdue;
    } else if (dueDate.getTime() === today.getTime()) {
      return colors.urgency.today;
    } else if (dueDate <= new Date(today.getTime() + 3 * 24 * 60 * 60 * 1000)) {
      return colors.urgency.upcoming;
    }
  }

  return colors.urgency.normal;
};
