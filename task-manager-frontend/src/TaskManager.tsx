import React, { useState, useEffect, useRef } from 'react';
import { User } from 'firebase/auth';
import {
  collection,
  query,
  where,
  onSnapshot,
  addDoc,
  updateDoc,
  doc,
  deleteDoc,
  serverTimestamp
} from 'firebase/firestore';
import { db, signOut } from './firebase';
import { Task, TaskStatus, Priority } from './types';
import { colors, getPriorityColor, getUrgencyStyle } from './colors';

interface TaskManagerProps {
  user: User;
}

const TaskManager: React.FC<TaskManagerProps> = ({ user }) => {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [currentView, setCurrentView] = useState<'today' | 'upcoming' | 'backlog' | 'completed'>('today');
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  const [isTablet, setIsTablet] = useState(window.innerWidth >= 768 && window.innerWidth < 1024);
  const [swipeStartX, setSwipeStartX] = useState<number | null>(null);
  const [swipeStartY, setSwipeStartY] = useState<number | null>(null);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [showTaskDetail, setShowTaskDetail] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const formRef = useRef<HTMLDivElement>(null);

  // Form state
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    priority: Priority.P2,
    dueDate: '',
    status: TaskStatus.BACKLOG
  });

  // Handle screen size changes with more granular breakpoints
  useEffect(() => {
    const handleResize = () => {
      const width = window.innerWidth;
      setIsMobile(width < 768);
      setIsTablet(width >= 768 && width < 1024);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Auto-scroll form into view on mobile
  useEffect(() => {
    if ((showForm || editingTask) && isMobile && formRef.current) {
      setTimeout(() => {
        formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 100);
    }
  }, [showForm, editingTask, isMobile]);

  // Pre-fill form when editing a task
  useEffect(() => {
    if (editingTask) {
      setFormData({
        title: editingTask.title,
        description: editingTask.description || '',
        priority: editingTask.priority,
        dueDate: editingTask.dueDate ? editingTask.dueDate.toISOString().split('T')[0] : '',
        status: editingTask.status
      });
      setShowForm(true);
    }
  }, [editingTask]);

  // Load tasks from Firestore
  useEffect(() => {
    if (!user) return;

    const tasksQuery = query(
      collection(db, 'tasks'),
      where('owner', '==', user.uid)
    );

    const unsubscribe = onSnapshot(
      tasksQuery,
      (snapshot) => {
        const loadedTasks: Task[] = [];
        snapshot.forEach((doc) => {
          const data = doc.data();
          loadedTasks.push({
            id: doc.id,
            projectId: data.projectId || '',
            owner: data.owner,
            title: data.title,
            description: data.description,
            priority: data.priority,
            status: data.status,
            createdOn: data.createdOn?.toDate() || new Date(),
            dueDate: data.dueDate?.toDate(),
            completedOn: data.completedOn?.toDate(),
            urls: data.urls || [],
            attachments: data.attachments || []
          });
        });

        // Sort by priority, then due date, then created date
        loadedTasks.sort((a, b) => {
          // First by priority
          const priorityOrder: { [key: string]: number } = { 'P1': 0, 'P2': 1, 'P3': 2, 'P4': 3 };
          if (a.priority !== b.priority) {
            return priorityOrder[a.priority] - priorityOrder[b.priority];
          }

          // Then by due date (tasks with due dates first)
          if (a.dueDate && !b.dueDate) return -1;
          if (!a.dueDate && b.dueDate) return 1;
          if (a.dueDate && b.dueDate) {
            return a.dueDate.getTime() - b.dueDate.getTime();
          }

          // Finally by created date
          return b.createdOn.getTime() - a.createdOn.getTime();
        });

        setTasks(loadedTasks);
        setLoading(false);
      },
      (error) => {
        console.error('Error loading tasks:', error);
        setError('Failed to load tasks');
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [user]);

  // Filter tasks by current view
  const getFilteredTasks = () => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const tomorrow = new Date(today.getTime() + 24 * 60 * 60 * 1000);
    const nextWeek = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000);

    switch (currentView) {
      case 'today':
        return tasks.filter(task => {
          // Explicitly set to TODAY status
          if (task.status === TaskStatus.TODAY) return true;

          // Due today or overdue, but ONLY if not explicitly set to BACKLOG
          if (task.dueDate && task.status !== TaskStatus.DONE && task.status !== TaskStatus.BACKLOG) {
            // Normalize task due date to midnight for comparison
            const taskDueDate = new Date(task.dueDate);
            taskDueDate.setHours(0, 0, 0, 0);
            return taskDueDate <= today;
          }
          return false;
        });
      case 'upcoming':
        return tasks.filter(task => {
          if (!task.dueDate || task.status === TaskStatus.DONE) return false;
          // Normalize task due date to midnight for comparison
          const taskDueDate = new Date(task.dueDate);
          taskDueDate.setHours(0, 0, 0, 0);
          return taskDueDate >= tomorrow && taskDueDate <= nextWeek;
        });
      case 'backlog':
        return tasks.filter(task => task.status === TaskStatus.BACKLOG);
      case 'completed':
        return tasks.filter(task => task.status === TaskStatus.DONE);
      default:
        return tasks;
    }
  };

  // Get task counts for navigation
  const getTaskCounts = () => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const tomorrow = new Date(today.getTime() + 24 * 60 * 60 * 1000);
    const nextWeek = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000);

    const todayTasks = tasks.filter(task => {
      // Explicitly set to TODAY status
      if (task.status === TaskStatus.TODAY) return true;

      // Due today or overdue, but ONLY if not explicitly set to BACKLOG
      if (task.dueDate && task.status !== TaskStatus.DONE && task.status !== TaskStatus.BACKLOG) {
        // Normalize task due date to midnight for comparison
        const taskDueDate = new Date(task.dueDate);
        taskDueDate.setHours(0, 0, 0, 0);
        return taskDueDate <= today;
      }
      return false;
    });

    const upcomingTasks = tasks.filter(task => {
      if (!task.dueDate || task.status === TaskStatus.DONE) return false;
      // Normalize task due date to midnight for comparison
      const taskDueDate = new Date(task.dueDate);
      taskDueDate.setHours(0, 0, 0, 0);
      return taskDueDate >= tomorrow && taskDueDate <= nextWeek;
    });

    // Calculate priority distribution for Today tasks
    const todayByPriority = {
      P1: todayTasks.filter(t => t.priority === 'P1').length,
      P2: todayTasks.filter(t => t.priority === 'P2').length,
      P3: todayTasks.filter(t => t.priority === 'P3').length,
      P4: todayTasks.filter(t => t.priority === 'P4').length,
    };

    return {
      today: todayTasks.length,
      upcoming: upcomingTasks.length,
      backlog: tasks.filter(task => task.status === TaskStatus.BACKLOG).length,
      completed: tasks.filter(task => task.status === TaskStatus.DONE).length,
      todayByPriority
    };
  };

  // Create new task
  const createTask = async () => {
    if (!formData.title.trim()) return;

    try {
      setError(null);

      const taskData: any = {
        title: formData.title.trim(),
        description: formData.description.trim(),
        priority: formData.priority,
        status: formData.status,
        owner: user.uid,
        createdOn: serverTimestamp(),
        urls: [],
        attachments: []
      };

      if (formData.dueDate) {
        taskData.dueDate = new Date(formData.dueDate);
      }

      await addDoc(collection(db, 'tasks'), taskData);

      // Reset form
      resetForm();
    } catch (error) {
      console.error('Error creating task:', error);
      setError('Failed to create task');
    }
  };

  // Update existing task
  const updateTask = async () => {
    if (!formData.title.trim() || !editingTask) return;

    try {
      setError(null);

      const taskRef = doc(db, 'tasks', editingTask.id);
      const updateData: any = {
        title: formData.title.trim(),
        description: formData.description.trim(),
        priority: formData.priority,
        status: formData.status
      };

      if (formData.dueDate) {
        updateData.dueDate = new Date(formData.dueDate);
      } else {
        updateData.dueDate = null;
      }

      await updateDoc(taskRef, updateData);

      // Reset form
      resetForm();
    } catch (error) {
      console.error('Error updating task:', error);
      setError('Failed to update task');
    }
  };

  // Reset form and editing state
  const resetForm = () => {
    setFormData({
      title: '',
      description: '',
      priority: Priority.P2,
      dueDate: '',
      status: TaskStatus.BACKLOG
    });
    setShowForm(false);
    setEditingTask(null);
  };

  // Handle form submission (create or update)
  const handleFormSubmit = () => {
    if (editingTask) {
      updateTask();
    } else {
      createTask();
    }
  };

  // Start editing a task
  const startEditingTask = (task: Task) => {
    setEditingTask(task);
  };

  // Swipe gesture handlers for mobile task actions
  const handleTouchStart = (e: React.TouchEvent, taskId: string) => {
    if (!isMobile) return;
    const touch = e.touches[0];
    setSwipeStartX(touch.clientX);
    setSwipeStartY(touch.clientY);
  };

  const handleTouchEnd = (e: React.TouchEvent, task: Task) => {
    if (!isMobile || swipeStartX === null || swipeStartY === null) return;

    const touch = e.changedTouches[0];
    const deltaX = touch.clientX - swipeStartX;
    const deltaY = touch.clientY - swipeStartY;

    // Only trigger swipe if horizontal movement is greater than vertical
    if (Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > 50) {
      if (deltaX > 0 && task.status !== TaskStatus.DONE) {
        // Swipe right to complete
        updateTaskStatus(task.id, TaskStatus.DONE);
      } else if (deltaX < 0 && task.status === TaskStatus.BACKLOG) {
        // Swipe left to move to today
        updateTaskStatus(task.id, TaskStatus.TODAY);
      }
    }

    setSwipeStartX(null);
    setSwipeStartY(null);
  };

  // Update task status
  const updateTaskStatus = async (taskId: string, newStatus: TaskStatus) => {
    try {
      setError(null);
      const taskRef = doc(db, 'tasks', taskId);
      const updates: any = { status: newStatus };

      if (newStatus === TaskStatus.DONE) {
        updates.completedOn = new Date();
      }

      await updateDoc(taskRef, updates);
    } catch (error) {
      console.error('Error updating task:', error);
      setError('Failed to update task');
    }
  };

  // Delete task
  const deleteTask = async (taskId: string) => {
    if (!window.confirm('Are you sure you want to delete this task?')) return;

    try {
      setError(null);
      await deleteDoc(doc(db, 'tasks', taskId));
    } catch (error) {
      console.error('Error deleting task:', error);
      setError('Failed to delete task');
    }
  };

  // Get days until due
  const getDaysUntilDue = (dueDate: Date) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0); // Reset time to start of day
    const dueDateOnly = new Date(dueDate);
    dueDateOnly.setHours(0, 0, 0, 0); // Reset time to start of day
    const diffTime = dueDateOnly.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  };

  if (loading) {
    return (
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        height: '100vh',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
      }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '2rem', marginBottom: '1rem' }}>🔄</div>
          <div>Loading your tasks...</div>
        </div>
      </div>
    );
  }

  const filteredTasks = getFilteredTasks();
  const taskCounts = getTaskCounts();

  return (
    <div style={{
      minHeight: '100vh',
      backgroundColor: colors.neutral[25],
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      display: 'flex',
      flexDirection: isMobile ? 'column' : 'row'
    }}>
      {/* Desktop Sidebar Navigation */}
      {!isMobile && (
        <aside style={{
          width: '280px',
          backgroundColor: 'white',
          borderRight: '1px solid #e2e8f0',
          minHeight: '100vh',
          position: 'sticky',
          top: 0,
          display: 'flex',
          flexDirection: 'column'
        }}>
          {/* Sidebar Header */}
          <div style={{
            padding: '2rem 1.5rem 1.5rem 1.5rem',
            borderBottom: '1px solid #e2e8f0'
          }}>
            <h1 style={{
              margin: 0,
              color: '#1a202c',
              fontSize: '1.5rem',
              fontWeight: '700',
              lineHeight: 1.2,
              marginBottom: '0.5rem'
            }}>
              ✅ TaskFlow
            </h1>
            <p style={{
              margin: 0,
              color: '#64748b',
              fontSize: '0.85rem'
            }}>
              Hi {user.displayName?.split(' ')[0] || 'there'}! Let's get things done.
            </p>
          </div>

          {/* Sidebar Navigation */}
          <nav style={{
            padding: '1.5rem 1rem',
            flex: 1
          }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {[
                { key: 'today', label: 'Today & Overdue', icon: '📅', count: taskCounts.today },
                { key: 'upcoming', label: 'Upcoming', icon: '⏰', count: taskCounts.upcoming },
                { key: 'backlog', label: 'Backlog', icon: '📋', count: taskCounts.backlog },
                { key: 'completed', label: 'Completed', icon: '✅', count: taskCounts.completed }
              ].map(({ key, label, icon, count }) => (
                <button
                  key={key}
                  onClick={() => setCurrentView(key as any)}
                  style={{
                    backgroundColor: currentView === key ? colors.actions.primary.bg : 'transparent',
                    color: currentView === key ? 'white' : colors.neutral[700],
                    border: 'none',
                    padding: '1rem 1.25rem',
                    borderRadius: '12px',
                    cursor: 'pointer',
                    fontSize: '0.9rem',
                    fontWeight: '500',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.75rem',
                    textAlign: 'left',
                    transition: 'all 0.2s ease',
                    width: '100%',
                    position: 'relative'
                  }}
                  onMouseOver={(e) => {
                    if (currentView !== key) {
                      e.currentTarget.style.backgroundColor = colors.neutral[100];
                    }
                  }}
                  onMouseOut={(e) => {
                    if (currentView !== key) {
                      e.currentTarget.style.backgroundColor = 'transparent';
                    }
                  }}
                >
                  <span style={{ fontSize: '1.1rem' }}>{icon}</span>
                  <span style={{ flex: 1 }}>{label}</span>

                  {/* Priority Distribution for Today */}
                  {key === 'today' && taskCounts.todayByPriority && (
                    <div style={{
                      display: 'flex',
                      gap: '0.25rem',
                      flexWrap: 'wrap'
                    }}>
                      {Object.entries(taskCounts.todayByPriority).map(([priority, priorityCount]) => (
                        priorityCount > 0 && (
                          <span
                            key={priority}
                            style={{
                              backgroundColor: currentView === key ? 'rgba(255,255,255,0.2)' : getPriorityColor(priority as Priority).bg,
                              color: currentView === key ? 'white' : getPriorityColor(priority as Priority).text,
                              borderRadius: '4px',
                              padding: '0.125rem 0.25rem',
                              fontSize: '0.6rem',
                              fontWeight: '600',
                              minWidth: '14px',
                              textAlign: 'center'
                            }}
                          >
                            {priority}:{priorityCount}
                          </span>
                        )
                      ))}
                    </div>
                  )}

                  {/* Regular Count Badge */}
                  {key !== 'today' && count > 0 && (
                    <span style={{
                      backgroundColor: currentView === key ? 'rgba(255,255,255,0.2)' : colors.actions.primary.bg,
                      color: 'white',
                      borderRadius: '12px',
                      padding: '0.125rem 0.4rem',
                      fontSize: '0.7rem',
                      fontWeight: '600',
                      minWidth: '18px',
                      textAlign: 'center'
                    }}>
                      {count}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </nav>

          {/* Sidebar Footer */}
          <div style={{
            padding: '1rem',
            borderTop: '1px solid #e2e8f0',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.5rem'
          }}>
            <button
              onClick={() => setShowHelp(true)}
              style={{
                backgroundColor: 'transparent',
                color: colors.neutral[600],
                border: `1px solid ${colors.neutral[300]}`,
                padding: '0.75rem 1rem',
                borderRadius: '8px',
                cursor: 'pointer',
                fontSize: '0.85rem',
                fontWeight: '500',
                transition: 'all 0.2s ease',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.5rem'
              }}
              onMouseOver={(e) => {
                e.currentTarget.style.backgroundColor = colors.neutral[100];
                e.currentTarget.style.borderColor = colors.neutral[400];
              }}
              onMouseOut={(e) => {
                e.currentTarget.style.backgroundColor = 'transparent';
                e.currentTarget.style.borderColor = colors.neutral[300];
              }}
            >
              <span>?</span>
              <span>Help</span>
            </button>

            <button
              onClick={signOut}
              style={{
                backgroundColor: '#ef4444',
                color: 'white',
                border: 'none',
                padding: '0.75rem 1rem',
                borderRadius: '8px',
                cursor: 'pointer',
                fontSize: '0.85rem',
                fontWeight: '500',
                transition: 'all 0.2s ease',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.5rem'
              }}
              onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#dc2626'}
              onMouseOut={(e) => e.currentTarget.style.backgroundColor = '#ef4444'}
            >
              <span>👋</span>
              <span>Sign Out</span>
            </button>
          </div>
        </aside>
      )}

      {/* Main Content Area */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        {/* Mobile Header */}
        {isMobile && (
          <header style={{
            backgroundColor: 'white',
            borderBottom: '1px solid #e2e8f0',
            padding: '1rem 1rem 0.75rem 1rem',
            position: 'sticky',
            top: 0,
            zIndex: 100,
            boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)'
          }}>
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}>
              <div style={{ flex: 1 }}>
                <h1 style={{
                  margin: 0,
                  color: '#1a202c',
                  fontSize: '1.25rem',
                  fontWeight: '700',
                  lineHeight: 1.2
                }}>
                  ✅ TaskFlow
                </h1>
              </div>

              <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                <button
                  onClick={() => setShowHelp(true)}
                  style={{
                    backgroundColor: 'transparent',
                    color: colors.neutral[600],
                    border: `2px solid ${colors.neutral[300]}`,
                    padding: '0.75rem',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    fontSize: '1rem',
                    fontWeight: '600',
                    transition: 'all 0.2s ease',
                    minHeight: '44px',
                    minWidth: '44px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}
                  onMouseOver={(e) => {
                    e.currentTarget.style.backgroundColor = colors.neutral[100];
                    e.currentTarget.style.borderColor = colors.neutral[400];
                  }}
                  onMouseOut={(e) => {
                    e.currentTarget.style.backgroundColor = 'transparent';
                    e.currentTarget.style.borderColor = colors.neutral[300];
                  }}
                >
                  ?
                </button>

                <button
                  onClick={signOut}
                  style={{
                    backgroundColor: '#ef4444',
                    color: 'white',
                    border: 'none',
                    padding: '0.75rem 1rem',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    fontSize: '0.8rem',
                    fontWeight: '500',
                    transition: 'all 0.2s ease',
                    minHeight: '44px',
                    minWidth: '80px'
                  }}
                  onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#dc2626'}
                  onMouseOut={(e) => e.currentTarget.style.backgroundColor = '#ef4444'}
                >
                  Sign Out
                </button>
              </div>
            </div>
          </header>
        )}

        {/* Content Container */}
        <div style={{
          padding: isMobile ? '1rem' : '2rem',
          flex: 1,
          maxWidth: isMobile ? '100%' : '1000px',
          margin: isMobile ? '0' : '0 auto',
          width: '100%'
        }}>
          {/* Mobile Navigation */}
          {isMobile && (
            <nav
              className="mobile-nav"
              style={{
                backgroundColor: 'white',
                borderRadius: '16px',
                padding: '0.75rem',
                marginBottom: '1.5rem',
                boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
                display: 'flex',
                gap: '0.5rem',
                overflowX: 'auto'
              }}>
              {[
                { key: 'today', label: 'Today & Overdue', shortLabel: 'Today', count: taskCounts.today },
                { key: 'upcoming', label: 'Upcoming', shortLabel: 'Upcoming', count: taskCounts.upcoming },
                { key: 'backlog', label: 'Backlog', shortLabel: 'Backlog', count: taskCounts.backlog },
                { key: 'completed', label: 'Completed', shortLabel: 'Done', count: taskCounts.completed }
              ].map(({ key, label, shortLabel, count }) => (
                <button
                  key={key}
                  onClick={() => setCurrentView(key as any)}
                  style={{
                    backgroundColor: currentView === key ? '#3b82f6' : 'transparent',
                    color: currentView === key ? 'white' : '#64748b',
                    border: 'none',
                    padding: '1rem 0.75rem',
                    borderRadius: '12px',
                    cursor: 'pointer',
                    fontSize: '0.8rem',
                    fontWeight: '500',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '0.25rem',
                    whiteSpace: 'nowrap',
                    flex: '1',
                    justifyContent: 'center',
                    transition: 'all 0.2s ease',
                    minHeight: '44px',
                    position: 'relative'
                  }}
                >
                  <span style={{ fontSize: '0.8rem', lineHeight: 1, fontWeight: '600' }}>{shortLabel}</span>

                  {/* Priority Distribution for Today */}
                  {key === 'today' && taskCounts.todayByPriority && (
                    <div style={{
                      display: 'flex',
                      gap: '0.25rem',
                      marginTop: '0.25rem'
                    }}>
                      {Object.entries(taskCounts.todayByPriority).map(([priority, priorityCount]) => (
                        priorityCount > 0 && (
                          <span
                            key={priority}
                            style={{
                              backgroundColor: currentView === key ? 'rgba(255,255,255,0.2)' : getPriorityColor(priority as Priority).bg,
                              color: currentView === key ? 'white' : getPriorityColor(priority as Priority).text,
                              borderRadius: '4px',
                              padding: '0.125rem 0.25rem',
                              fontSize: '0.6rem',
                              fontWeight: '600',
                              minWidth: '14px',
                              textAlign: 'center'
                            }}
                          >
                            {priority}:{priorityCount}
                          </span>
                        )
                      ))}
                    </div>
                  )}

                  {/* Regular Count Badge */}
                  {key !== 'today' && count > 0 && (
                    <span style={{
                      backgroundColor: currentView === key ? 'rgba(255,255,255,0.2)' : '#3b82f6',
                      color: 'white',
                      borderRadius: '12px',
                      padding: '0.125rem 0.4rem',
                      fontSize: '0.7rem',
                      fontWeight: '600',
                      minWidth: '18px',
                      textAlign: 'center',
                      position: 'absolute',
                      top: '0.25rem',
                      right: '0.25rem'
                    }}>
                      {count}
                    </span>
                  )}
                </button>
              ))}
            </nav>
          )}

          {/* Error Display */}
          {error && (
            <div style={{
              backgroundColor: '#fee2e2',
              border: '1px solid #fecaca',
              color: '#dc2626',
              padding: '1rem',
              borderRadius: '8px',
              marginBottom: '2rem',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}>
              <span>⚠️ {error}</span>
              <button
                onClick={() => setError(null)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#dc2626',
                  cursor: 'pointer',
                  fontSize: '1.25rem',
                  fontWeight: 'bold'
                }}
              >
                ×
              </button>
            </div>
          )}

          {/* Add Task Button */}
          <div style={{ marginBottom: isMobile ? '1.5rem' : '2rem' }}>
            <button
              onClick={() => {
                if (showForm || editingTask) {
                  resetForm();
                } else {
                  setShowForm(true);
                }
              }}
              style={{
                backgroundColor: (showForm || editingTask) ? colors.neutral[500] : colors.actions.primary.bg,
                color: 'white',
                border: 'none',
                padding: isMobile ? '1rem 1.5rem' : '1rem 2rem',
                borderRadius: '16px',
                cursor: 'pointer',
                fontSize: isMobile ? '0.9rem' : '1rem',
                fontWeight: '600',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.5rem',
                boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
                transition: 'all 0.2s ease',
                width: isMobile ? '100%' : 'auto',
                minHeight: '48px' // Larger touch target for mobile
              }}
              onMouseOver={(e) => {
                if (!isMobile) {
                  e.currentTarget.style.transform = 'translateY(-1px)';
                  e.currentTarget.style.boxShadow = '0 8px 12px -1px rgba(0, 0, 0, 0.15)';
                }
              }}
              onMouseOut={(e) => {
                if (!isMobile) {
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow = '0 4px 6px -1px rgba(0, 0, 0, 0.1)';
                }
              }}
            >
              {(showForm || editingTask) ? 'Cancel' : 'Add New Task'}
            </button>
          </div>

          {/* Task Form */}
          {showForm && (
            <div
              ref={formRef}
              style={{
                backgroundColor: 'white',
                borderRadius: '16px',
                padding: isMobile ? '1.5rem' : '2rem',
                marginBottom: isMobile ? '1.5rem' : '2rem',
                boxShadow: '0 10px 25px -3px rgba(0, 0, 0, 0.1)',
                border: '1px solid #e2e8f0'
              }}>
              <h2 style={{
                margin: '0 0 1.5rem 0',
                color: '#1a202c',
                fontSize: '1.5rem',
                fontWeight: '600'
              }}>
                {editingTask ? 'Edit Task' : 'Create New Task'}
              </h2>

              <div style={{ display: 'grid', gap: '1.5rem' }}>
                {/* Title */}
                <div>
                  <label style={{
                    display: 'block',
                    marginBottom: '0.5rem',
                    fontWeight: '600',
                    color: '#374151',
                    fontSize: '0.9rem'
                  }}>
                    Task Title *
                  </label>
                  <input
                    type="text"
                    value={formData.title}
                    onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
                    placeholder="What needs to be done?"
                    style={{
                      width: '100%',
                      padding: isMobile ? '1.25rem 1rem' : '1rem',
                      border: '2px solid #e2e8f0',
                      borderRadius: '12px',
                      fontSize: isMobile ? '1rem' : '1rem',
                      boxSizing: 'border-box',
                      transition: 'border-color 0.2s ease',
                      minHeight: isMobile ? '48px' : 'auto',
                      WebkitAppearance: 'none', // Remove iOS styling
                      appearance: 'none'
                    }}
                    onFocus={(e) => e.currentTarget.style.borderColor = '#3b82f6'}
                    onBlur={(e) => e.currentTarget.style.borderColor = '#e2e8f0'}
                  />
                </div>

                {/* Description */}
                <div>
                  <label style={{
                    display: 'block',
                    marginBottom: '0.5rem',
                    fontWeight: '600',
                    color: '#374151',
                    fontSize: '0.9rem'
                  }}>
                    Description
                  </label>
                  <textarea
                    value={formData.description}
                    onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                    placeholder="Add more details (optional)"
                    style={{
                      width: '100%',
                      padding: isMobile ? '1.25rem 1rem' : '1rem',
                      border: '2px solid #e2e8f0',
                      borderRadius: '12px',
                      fontSize: isMobile ? '1rem' : '1rem',
                      boxSizing: 'border-box',
                      minHeight: isMobile ? '120px' : '100px',
                      resize: isMobile ? 'none' : 'vertical',
                      fontFamily: 'inherit',
                      transition: 'border-color 0.2s ease',
                      WebkitAppearance: 'none', // Remove iOS styling
                      appearance: 'none'
                    }}
                    onFocus={(e) => e.currentTarget.style.borderColor = '#3b82f6'}
                    onBlur={(e) => e.currentTarget.style.borderColor = '#e2e8f0'}
                  />
                </div>

                {/* Priority, Due Date, Status */}
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: isMobile ? '1fr' : isTablet ? '1fr 1fr' : '1fr 1fr 1fr',
                  gap: isMobile ? '1.5rem' : '1rem'
                }}>
                  <div>
                    <label style={{
                      display: 'block',
                      marginBottom: '0.5rem',
                      fontWeight: '600',
                      color: '#374151',
                      fontSize: '0.9rem'
                    }}>
                      Priority
                    </label>
                    <select
                      value={formData.priority}
                      onChange={(e) => setFormData(prev => ({ ...prev, priority: e.target.value as Priority }))}
                      style={{
                        width: '100%',
                        padding: isMobile ? '1.25rem 1rem' : '1rem',
                        border: '2px solid #e2e8f0',
                        borderRadius: '12px',
                        fontSize: isMobile ? '1rem' : '1rem',
                        boxSizing: 'border-box',
                        backgroundColor: 'white',
                        minHeight: isMobile ? '48px' : 'auto',
                        WebkitAppearance: 'none',
                        appearance: 'none',
                        backgroundImage: 'url("data:image/svg+xml;charset=UTF-8,%3csvg xmlns=\'http://www.w3.org/2000/svg\' viewBox=\'0 0 24 24\' fill=\'none\' stroke=\'currentColor\' stroke-width=\'2\' stroke-linecap=\'round\' stroke-linejoin=\'round\'%3e%3cpolyline points=\'6,9 12,15 18,9\'%3e%3c/polyline%3e%3c/svg%3e")',
                        backgroundRepeat: 'no-repeat',
                        backgroundPosition: 'right 1rem center',
                        backgroundSize: '1rem',
                        paddingRight: '3rem'
                      }}
                    >
                      <option value={Priority.P1}>🔴 P1 - Urgent</option>
                      <option value={Priority.P2}>🟠 P2 - High</option>
                      <option value={Priority.P3}>🟡 P3 - Medium</option>
                      <option value={Priority.P4}>🟢 P4 - Low</option>
                    </select>
                  </div>

                  <div>
                    <label style={{
                      display: 'block',
                      marginBottom: '0.5rem',
                      fontWeight: '600',
                      color: '#374151',
                      fontSize: '0.9rem'
                    }}>
                      Due Date
                    </label>
                    <input
                      type="date"
                      value={formData.dueDate}
                      onChange={(e) => setFormData(prev => ({ ...prev, dueDate: e.target.value }))}
                      style={{
                        width: '100%',
                        padding: isMobile ? '1.25rem 1rem' : '1rem',
                        border: '2px solid #e2e8f0',
                        borderRadius: '12px',
                        fontSize: isMobile ? '1rem' : '1rem',
                        boxSizing: 'border-box',
                        minHeight: isMobile ? '48px' : 'auto',
                        WebkitAppearance: 'none',
                        appearance: 'none'
                      }}
                    />
                  </div>

                  <div>
                    <label style={{
                      display: 'block',
                      marginBottom: '0.5rem',
                      fontWeight: '600',
                      color: '#374151',
                      fontSize: '0.9rem'
                    }}>
                      Status
                    </label>
                    <select
                      value={formData.status}
                      onChange={(e) => setFormData(prev => ({ ...prev, status: e.target.value as TaskStatus }))}
                      style={{
                        width: '100%',
                        padding: isMobile ? '1.25rem 1rem' : '1rem',
                        border: '2px solid #e2e8f0',
                        borderRadius: '12px',
                        fontSize: isMobile ? '1rem' : '1rem',
                        boxSizing: 'border-box',
                        backgroundColor: 'white',
                        minHeight: isMobile ? '48px' : 'auto',
                        WebkitAppearance: 'none',
                        appearance: 'none',
                        backgroundImage: 'url("data:image/svg+xml;charset=UTF-8,%3csvg xmlns=\'http://www.w3.org/2000/svg\' viewBox=\'0 0 24 24\' fill=\'none\' stroke=\'currentColor\' stroke-width=\'2\' stroke-linecap=\'round\' stroke-linejoin=\'round\'%3e%3cpolyline points=\'6,9 12,15 18,9\'%3e%3c/polyline%3e%3c/svg%3e")',
                        backgroundRepeat: 'no-repeat',
                        backgroundPosition: 'right 1rem center',
                        backgroundSize: '1rem',
                        paddingRight: '3rem'
                      }}
                    >
                      <option value={TaskStatus.BACKLOG}>📝 Backlog</option>
                      <option value={TaskStatus.TODAY}>🔥 Today</option>
                    </select>
                  </div>
                </div>

                {/* Form Buttons */}
                <div style={{
                  display: 'flex',
                  flexDirection: isMobile ? 'column' : 'row',
                  gap: isMobile ? '0.75rem' : '1rem',
                  paddingTop: '1.5rem'
                }}>
                  <button
                    onClick={handleFormSubmit}
                    disabled={!formData.title.trim()}
                    style={{
                      backgroundColor: formData.title.trim() ? colors.actions.primary.bg : colors.neutral[300],
                      color: 'white',
                      border: 'none',
                      padding: isMobile ? '1.25rem 2rem' : '1rem 2rem',
                      borderRadius: '12px',
                      cursor: formData.title.trim() ? 'pointer' : 'not-allowed',
                      fontSize: isMobile ? '1rem' : '1rem',
                      fontWeight: '600',
                      flex: '1',
                      transition: 'all 0.2s ease',
                      minHeight: '48px',
                      order: isMobile ? 1 : 0
                    }}
                                  >
                    {editingTask ? 'Update Task' : 'Create Task'}
                  </button>
                  <button
                    onClick={resetForm}
                    style={{
                      backgroundColor: 'transparent',
                      color: colors.neutral[600],
                      border: `2px solid ${colors.neutral[200]}`,
                      padding: isMobile ? '1.25rem 2rem' : '1rem 2rem',
                      borderRadius: '12px',
                      cursor: 'pointer',
                      fontSize: isMobile ? '1rem' : '1rem',
                      fontWeight: '500',
                      flex: isMobile ? '1' : 'auto',
                      minHeight: '48px',
                      order: isMobile ? 2 : 0
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Tasks List */}
          <div style={{ display: 'grid', gap: '0.75rem' }}>
            {filteredTasks.map(task => {
              // Fix overdue logic to compare dates at day level, not including time
              const today = new Date();
              today.setHours(0, 0, 0, 0);
              const taskDueDate = task.dueDate ? new Date(task.dueDate) : null;
              if (taskDueDate) {
                taskDueDate.setHours(0, 0, 0, 0);
              }
              const isOverdue = taskDueDate && taskDueDate < today && task.status !== TaskStatus.DONE;
              const daysUntilDue = task.dueDate ? getDaysUntilDue(task.dueDate) : null;
              const urgencyStyle = getUrgencyStyle(task);

              return (
                <div
                  key={task.id}
                  style={{
                    backgroundColor: urgencyStyle.bg,
                    borderRadius: '12px',
                    padding: '1.25rem',
                    border: `1px solid ${urgencyStyle.border}`,
                    position: 'relative',
                    transition: 'all 0.2s ease'
                  }}
                  onTouchStart={(e) => handleTouchStart(e, task.id)}
                  onTouchEnd={(e) => handleTouchEnd(e, task)}
                >
                  {/* Priority Indicator - Minimal left border */}
                  <div style={{
                    position: 'absolute',
                    left: 0,
                    top: '1rem',
                    bottom: '1rem',
                    width: '3px',
                    backgroundColor: getPriorityColor(task.priority).accent,
                    borderRadius: '0 2px 2px 0',
                    opacity: task.priority === 'P1' ? 1 : task.priority === 'P2' ? 0.7 : 0.4
                  }} />

                  {/* Mobile Swipe Hints */}
                  {isMobile && task.status === TaskStatus.BACKLOG && (
                    <div style={{
                      position: 'absolute',
                      top: '0.75rem',
                      right: '1rem',
                      color: colors.neutral[400],
                      fontSize: '0.7rem',
                      fontWeight: '500'
                    }}>
                      ← Swipe
                    </div>
                  )}

                  {/* Main Content */}
                  <div style={{ paddingLeft: '1rem' }}>
                    {/* Header with Title and Due Date */}
                    <div style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'flex-start',
                      marginBottom: task.description ? '0.5rem' : '0.75rem'
                    }}>
                      <h3
                        style={{
                          margin: 0,
                          color: task.status === TaskStatus.DONE ? colors.neutral[500] : colors.neutral[900],
                          fontSize: '1.125rem',
                          fontWeight: '600',
                          lineHeight: '1.4',
                          textDecoration: task.status === TaskStatus.DONE ? 'line-through' : 'none',
                          flex: 1,
                          marginRight: '1rem',
                          cursor: 'pointer'
                        }}
                        onClick={() => {
                          setSelectedTask(task);
                          setShowTaskDetail(true);
                        }}
                      >
                        {task.title}
                      </h3>

                      {/* Minimal Due Date */}
                      {task.dueDate && (
                        <div style={{
                          fontSize: '0.8rem',
                          color: isOverdue ? colors.semantic.error.main :
                                 daysUntilDue === 0 ? colors.semantic.warning.main :
                                 colors.neutral[500],
                          fontWeight: '500',
                          whiteSpace: 'nowrap'
                        }}>
                          {isOverdue && daysUntilDue !== null ? `${Math.abs(daysUntilDue)}d overdue` :
                           daysUntilDue === 0 ? 'Today' :
                           daysUntilDue === 1 ? 'Tomorrow' :
                           task.dueDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                        </div>
                      )}
                    </div>

                    {/* Description */}
                    {task.description && (
                      <p style={{
                        color: colors.neutral[600],
                        margin: '0 0 0.75rem 0',
                        lineHeight: '1.5',
                        fontSize: '0.9rem'
                      }}>
                        {task.description}
                      </p>
                    )}

                    {/* Minimal Metadata and Quick Actions */}
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '1rem'
                    }}>
                      {/* Metadata */}
                      <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '1rem',
                        fontSize: '0.8rem',
                        color: colors.neutral[500]
                      }}>
                        <span>{task.priority}</span>
                        {task.status !== TaskStatus.BACKLOG && (
                          <span>• {task.status}</span>
                        )}
                        <span>• {task.createdOn.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                      </div>

                      {/* Quick Actions - Always Visible */}
                      <div style={{
                        display: 'flex',
                        gap: '0.5rem',
                        alignItems: 'center'
                      }}>
                        {/* Complete Button */}
                        {task.status !== TaskStatus.DONE && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              updateTaskStatus(task.id, TaskStatus.DONE);
                            }}
                            style={{
                              backgroundColor: 'transparent',
                              color: colors.semantic.success.main,
                              border: `1px solid ${colors.semantic.success.main}`,
                              padding: '0.375rem 0.75rem',
                              borderRadius: '6px',
                              cursor: 'pointer',
                              fontSize: '0.75rem',
                              fontWeight: '500',
                              transition: 'all 0.2s ease',
                              minHeight: isMobile ? '36px' : 'auto'
                            }}
                            onMouseOver={(e) => {
                              e.currentTarget.style.backgroundColor = colors.semantic.success.main;
                              e.currentTarget.style.color = 'white';
                            }}
                            onMouseOut={(e) => {
                              e.currentTarget.style.backgroundColor = 'transparent';
                              e.currentTarget.style.color = colors.semantic.success.main;
                            }}
                          >
                            ✓
                          </button>
                        )}

                        {/* Move to Today Button */}
                        {task.status === TaskStatus.BACKLOG && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              updateTaskStatus(task.id, TaskStatus.TODAY);
                            }}
                            style={{
                              backgroundColor: 'transparent',
                              color: colors.actions.primary.bg,
                              border: `1px solid ${colors.actions.primary.bg}`,
                              padding: '0.375rem 0.75rem',
                              borderRadius: '6px',
                              cursor: 'pointer',
                              fontSize: '0.75rem',
                              fontWeight: '500',
                              transition: 'all 0.2s ease',
                              minHeight: isMobile ? '36px' : 'auto'
                            }}
                            onMouseOver={(e) => {
                              e.currentTarget.style.backgroundColor = colors.actions.primary.bg;
                              e.currentTarget.style.color = 'white';
                            }}
                            onMouseOut={(e) => {
                              e.currentTarget.style.backgroundColor = 'transparent';
                              e.currentTarget.style.color = colors.actions.primary.bg;
                            }}
                          >
                            →
                          </button>
                        )}

                        {/* Move to Backlog Button */}
                        {task.status === TaskStatus.TODAY && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              updateTaskStatus(task.id, TaskStatus.BACKLOG);
                            }}
                            style={{
                              backgroundColor: 'transparent',
                              color: colors.neutral[600],
                              border: `1px solid ${colors.neutral[400]}`,
                              padding: '0.375rem 0.75rem',
                              borderRadius: '6px',
                              cursor: 'pointer',
                              fontSize: '0.75rem',
                              fontWeight: '500',
                              transition: 'all 0.2s ease',
                              minHeight: isMobile ? '36px' : 'auto'
                            }}
                            onMouseOver={(e) => {
                              e.currentTarget.style.backgroundColor = colors.neutral[100];
                              e.currentTarget.style.borderColor = colors.neutral[500];
                            }}
                            onMouseOut={(e) => {
                              e.currentTarget.style.backgroundColor = 'transparent';
                              e.currentTarget.style.borderColor = colors.neutral[400];
                            }}
                          >
                            ←
                          </button>
                        )}

                        {/* View Details Button */}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedTask(task);
                            setShowTaskDetail(true);
                          }}
                          style={{
                            backgroundColor: 'transparent',
                            color: colors.neutral[500],
                            border: `1px solid ${colors.neutral[300]}`,
                            padding: '0.375rem 0.75rem',
                            borderRadius: '6px',
                            cursor: 'pointer',
                            fontSize: '0.75rem',
                            fontWeight: '500',
                            transition: 'all 0.2s ease',
                            minHeight: isMobile ? '36px' : 'auto'
                          }}
                          onMouseOver={(e) => {
                            e.currentTarget.style.backgroundColor = colors.neutral[100];
                            e.currentTarget.style.borderColor = colors.neutral[400];
                          }}
                          onMouseOut={(e) => {
                            e.currentTarget.style.backgroundColor = 'transparent';
                            e.currentTarget.style.borderColor = colors.neutral[300];
                          }}
                        >
                          ⋯
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Empty State */}
          {filteredTasks.length === 0 && (
            <div style={{
              backgroundColor: 'white',
              borderRadius: '16px',
              padding: '4rem 2rem',
              textAlign: 'center',
              border: `1px solid ${colors.neutral[200]}`
            }}>
              <div style={{
                fontSize: '4rem',
                marginBottom: '1rem',
                color: colors.neutral[300]
              }}>
                {currentView === 'today' ? '⏰' :
                 currentView === 'upcoming' ? '📋' :
                 currentView === 'backlog' ? '📝' : '✓'}
              </div>
              <h3 style={{ color: colors.neutral[900], margin: '0 0 1rem 0' }}>
                No {currentView} tasks yet!
              </h3>
              <p style={{ color: colors.neutral[600], margin: '0 0 2rem 0' }}>
                {currentView === 'today' && "Tasks due today or overdue will appear here."}
                {currentView === 'upcoming' && "Tasks due in the next 7 days will appear here."}
                {currentView === 'backlog' && "Your backlog tasks will appear here."}
                {currentView === 'completed' && "Completed tasks will appear here."}
              </p>
              <button
                onClick={() => setShowForm(true)}
                style={{
                  backgroundColor: colors.actions.primary.bg,
                  color: 'white',
                  border: 'none',
                  padding: isMobile ? '1.25rem 2rem' : '1rem 2rem',
                  borderRadius: '12px',
                  cursor: 'pointer',
                  fontSize: '1rem',
                  fontWeight: '600',
                  minHeight: '48px',
                  width: isMobile ? '100%' : 'auto'
                }}
              >
                Create Your First Task
              </button>
            </div>
          )}

          {/* Task Detail Modal */}
          {showTaskDetail && selectedTask && (
            <div style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: 'rgba(0, 0, 0, 0.5)',
              zIndex: 1000,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: isMobile ? '1rem' : '2rem'
            }}>
              <div style={{
                backgroundColor: 'white',
                borderRadius: '16px',
                padding: isMobile ? '1.5rem' : '2rem',
                maxWidth: isMobile ? '100%' : '600px',
                width: '100%',
                maxHeight: '90vh',
                overflowY: 'auto',
                boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
                position: 'relative'
              }}>
                {/* Header */}
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'flex-start',
                  marginBottom: '1.5rem'
                }}>
                  <h2 style={{
                    margin: 0,
                    color: colors.neutral[900],
                    fontSize: '1.5rem',
                    fontWeight: '600',
                    flex: 1,
                    marginRight: '1rem'
                  }}>
                    Task Details
                  </h2>
                  <button
                    onClick={() => {
                      setShowTaskDetail(false);
                      setSelectedTask(null);
                    }}
                    style={{
                      backgroundColor: 'transparent',
                      border: 'none',
                      color: colors.neutral[500],
                      cursor: 'pointer',
                      fontSize: '1.5rem',
                      padding: '0.25rem',
                      borderRadius: '6px',
                      minHeight: '44px',
                      minWidth: '44px'
                    }}
                  >
                    ×
                  </button>
                </div>

                {/* Task Content */}
                <div style={{ marginBottom: '2rem' }}>
                  {/* Title */}
                  <h3 style={{
                    margin: '0 0 1rem 0',
                    color: selectedTask.status === TaskStatus.DONE ? colors.neutral[500] : colors.neutral[900],
                    fontSize: '1.25rem',
                    fontWeight: '600',
                    lineHeight: '1.4',
                    textDecoration: selectedTask.status === TaskStatus.DONE ? 'line-through' : 'none'
                  }}>
                    {selectedTask.title}
                  </h3>

                  {/* Description */}
                  {selectedTask.description && (
                    <p style={{
                      color: colors.neutral[600],
                      margin: '0 0 1.5rem 0',
                      lineHeight: '1.6',
                      fontSize: '1rem'
                    }}>
                      {selectedTask.description}
                    </p>
                  )}

                  {/* Metadata Grid */}
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr',
                    gap: '1rem',
                    marginBottom: '1.5rem'
                  }}>
                    <div>
                      <label style={{
                        display: 'block',
                        fontSize: '0.8rem',
                        fontWeight: '600',
                        color: colors.neutral[500],
                        marginBottom: '0.25rem',
                        textTransform: 'uppercase',
                        letterSpacing: '0.05em'
                      }}>
                        Priority
                      </label>
                      <div style={{
                        padding: '0.5rem 0.75rem',
                        backgroundColor: getPriorityColor(selectedTask.priority).bg,
                        color: getPriorityColor(selectedTask.priority).text,
                        borderRadius: '8px',
                        fontSize: '0.9rem',
                        fontWeight: '500'
                      }}>
                        {selectedTask.priority} - {
                          selectedTask.priority === 'P1' ? 'Urgent' :
                          selectedTask.priority === 'P2' ? 'High' :
                          selectedTask.priority === 'P3' ? 'Medium' : 'Low'
                        }
                      </div>
                    </div>

                    <div>
                      <label style={{
                        display: 'block',
                        fontSize: '0.8rem',
                        fontWeight: '600',
                        color: colors.neutral[500],
                        marginBottom: '0.25rem',
                        textTransform: 'uppercase',
                        letterSpacing: '0.05em'
                      }}>
                        Status
                      </label>
                      <div style={{
                        padding: '0.5rem 0.75rem',
                        backgroundColor: colors.neutral[100],
                        color: colors.neutral[700],
                        borderRadius: '8px',
                        fontSize: '0.9rem',
                        fontWeight: '500'
                      }}>
                        {selectedTask.status}
                      </div>
                    </div>

                    {selectedTask.dueDate && (
                      <div>
                        <label style={{
                          display: 'block',
                          fontSize: '0.8rem',
                          fontWeight: '600',
                          color: colors.neutral[500],
                          marginBottom: '0.25rem',
                          textTransform: 'uppercase',
                          letterSpacing: '0.05em'
                        }}>
                          Due Date
                        </label>
                        <div style={{
                          padding: '0.5rem 0.75rem',
                          backgroundColor: colors.neutral[100],
                          color: colors.neutral[700],
                          borderRadius: '8px',
                          fontSize: '0.9rem',
                          fontWeight: '500'
                        }}>
                          {selectedTask.dueDate.toLocaleDateString('en-US', {
                            weekday: 'short',
                            year: 'numeric',
                            month: 'short',
                            day: 'numeric'
                          })}
                        </div>
                      </div>
                    )}

                    <div>
                      <label style={{
                        display: 'block',
                        fontSize: '0.8rem',
                        fontWeight: '600',
                        color: colors.neutral[500],
                        marginBottom: '0.25rem',
                        textTransform: 'uppercase',
                        letterSpacing: '0.05em'
                      }}>
                        Created
                      </label>
                      <div style={{
                        padding: '0.5rem 0.75rem',
                        backgroundColor: colors.neutral[100],
                        color: colors.neutral[700],
                        borderRadius: '8px',
                        fontSize: '0.9rem',
                        fontWeight: '500'
                      }}>
                        {selectedTask.createdOn.toLocaleDateString('en-US', {
                          year: 'numeric',
                          month: 'short',
                          day: 'numeric'
                        })}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Actions */}
                <div style={{
                  display: 'flex',
                  flexDirection: isMobile ? 'column' : 'row',
                  gap: '0.75rem',
                  paddingTop: '1.5rem',
                  borderTop: `1px solid ${colors.neutral[200]}`
                }}>
                  {/* Primary Actions */}
                  {selectedTask.status !== TaskStatus.DONE && (
                    <button
                      onClick={() => {
                        updateTaskStatus(selectedTask.id, TaskStatus.DONE);
                        setShowTaskDetail(false);
                        setSelectedTask(null);
                      }}
                      style={{
                        backgroundColor: colors.actions.success.bg,
                        color: colors.actions.success.text,
                        border: 'none',
                        padding: isMobile ? '1rem 1.5rem' : '0.75rem 1.5rem',
                        borderRadius: '8px',
                        cursor: 'pointer',
                        fontSize: '0.9rem',
                        fontWeight: '600',
                        transition: 'all 0.2s ease',
                        minHeight: '44px',
                        flex: isMobile ? '1' : 'auto'
                      }}
                    >
                      ✓ Mark Complete
                    </button>
                  )}

                  <button
                    onClick={() => {
                      startEditingTask(selectedTask);
                      setShowTaskDetail(false);
                      setSelectedTask(null);
                    }}
                    style={{
                      backgroundColor: colors.actions.primary.bg,
                      color: 'white',
                      border: 'none',
                      padding: isMobile ? '1rem 1.5rem' : '0.75rem 1.5rem',
                      borderRadius: '8px',
                      cursor: 'pointer',
                      fontSize: '0.9rem',
                      fontWeight: '600',
                      transition: 'all 0.2s ease',
                      minHeight: '44px',
                      flex: isMobile ? '1' : 'auto'
                    }}
                  >
                    Edit Task
                  </button>

                  {selectedTask.status === TaskStatus.BACKLOG && (
                    <button
                      onClick={() => {
                        updateTaskStatus(selectedTask.id, TaskStatus.TODAY);
                        setShowTaskDetail(false);
                        setSelectedTask(null);
                      }}
                      style={{
                        backgroundColor: 'transparent',
                        color: colors.actions.primary.bg,
                        border: `2px solid ${colors.actions.primary.bg}`,
                        padding: isMobile ? '1rem 1.5rem' : '0.75rem 1.5rem',
                        borderRadius: '8px',
                        cursor: 'pointer',
                        fontSize: '0.9rem',
                        fontWeight: '600',
                        transition: 'all 0.2s ease',
                        minHeight: '44px',
                        flex: isMobile ? '1' : 'auto'
                      }}
                    >
                      Move to Today
                    </button>
                  )}

                  <button
                    onClick={() => {
                      deleteTask(selectedTask.id);
                      setShowTaskDetail(false);
                      setSelectedTask(null);
                    }}
                    style={{
                      backgroundColor: 'transparent',
                      color: colors.semantic.error.main,
                      border: `2px solid ${colors.semantic.error.main}`,
                      padding: isMobile ? '1rem 1.5rem' : '0.75rem 1.5rem',
                      borderRadius: '8px',
                      cursor: 'pointer',
                      fontSize: '0.9rem',
                      fontWeight: '600',
                      transition: 'all 0.2s ease',
                      minHeight: '44px',
                      flex: isMobile ? '1' : 'auto'
                    }}
                  >
                    Delete Task
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Help Modal */}
          {showHelp && (
            <div style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: 'rgba(0, 0, 0, 0.5)',
              zIndex: 1000,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: isMobile ? '1rem' : '2rem'
            }}>
              <div style={{
                backgroundColor: 'white',
                borderRadius: '16px',
                padding: isMobile ? '1.5rem' : '2rem',
                maxWidth: isMobile ? '100%' : '700px',
                width: '100%',
                maxHeight: '90vh',
                overflowY: 'auto',
                boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
                position: 'relative'
              }}>
                {/* Header */}
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'flex-start',
                  marginBottom: '1.5rem'
                }}>
                  <h2 style={{
                    margin: 0,
                    color: colors.neutral[900],
                    fontSize: '1.5rem',
                    fontWeight: '600',
                    flex: 1,
                    marginRight: '1rem'
                  }}>
                    📚 How TaskFlow Works
                  </h2>
                  <button
                    onClick={() => setShowHelp(false)}
                    style={{
                      backgroundColor: 'transparent',
                      border: 'none',
                      color: colors.neutral[500],
                      cursor: 'pointer',
                      fontSize: '1.5rem',
                      padding: '0.25rem',
                      borderRadius: '6px',
                      minHeight: '44px',
                      minWidth: '44px'
                    }}
                  >
                    ×
                  </button>
                </div>

                {/* Help Content */}
                <div style={{ lineHeight: '1.6', color: colors.neutral[700] }}>
                  {/* Core Principles */}
                  <section style={{ marginBottom: '2rem' }}>
                    <h3 style={{
                      color: colors.neutral[900],
                      fontSize: '1.2rem',
                      fontWeight: '600',
                      marginBottom: '1rem',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.5rem'
                    }}>
                      🎯 Core Principles
                    </h3>
                    <p style={{ marginBottom: '1rem' }}>
                      TaskFlow uses <strong>Work-in-Progress (WIP) limits</strong> and <strong>priority-based task management</strong> to help you focus on what matters most without getting overwhelmed.
                    </p>
                    <ul style={{ paddingLeft: '1.5rem', marginBottom: '1rem' }}>
                      <li style={{ marginBottom: '0.5rem' }}><strong>Limit your daily focus</strong> - Only work on a limited number of high-priority tasks each day</li>
                      <li style={{ marginBottom: '0.5rem' }}><strong>Respect priority limits</strong> - Maintain healthy quotas for each priority level</li>
                      <li style={{ marginBottom: '0.5rem' }}><strong>Complete before adding</strong> - Finish tasks before pulling new ones from backlog</li>
                      <li style={{ marginBottom: '0.5rem' }}><strong>Daily triage</strong> - Review and organize tasks regularly</li>
                    </ul>
                  </section>

                  {/* Priority System */}
                  <section style={{ marginBottom: '2rem' }}>
                    <h3 style={{
                      color: colors.neutral[900],
                      fontSize: '1.2rem',
                      fontWeight: '600',
                      marginBottom: '1rem',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.5rem'
                    }}>
                      🚦 Priority System & Daily Quotas
                    </h3>

                    <div style={{
                      backgroundColor: colors.neutral[50],
                      padding: '1.5rem',
                      borderRadius: '12px',
                      marginBottom: '1rem'
                    }}>
                      <div style={{ display: 'grid', gap: '1rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                          <div style={{
                            backgroundColor: colors.priority.p1.border,
                            color: colors.priority.p1.accent,
                            padding: '0.5rem 0.75rem',
                            borderRadius: '8px',
                            fontWeight: '600',
                            fontSize: '0.9rem',
                            minWidth: '60px',
                            textAlign: 'center'
                          }}>P1</div>
                          <div style={{ flex: 1 }}>
                            <strong>Urgent</strong> - Critical, time-sensitive tasks
                            <div style={{ fontSize: '0.9rem', color: colors.neutral[600] }}>
                              <strong>Daily Quota: Maximum 3 tasks</strong> - Automatically enforced by the system
                            </div>
                          </div>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                          <div style={{
                            backgroundColor: colors.priority.p2.border,
                            color: colors.priority.p2.accent,
                            padding: '0.5rem 0.75rem',
                            borderRadius: '8px',
                            fontWeight: '600',
                            fontSize: '0.9rem',
                            minWidth: '60px',
                            textAlign: 'center'
                          }}>P2</div>
                          <div style={{ flex: 1 }}>
                            <strong>High</strong> - Important tasks with clear deadlines
                            <div style={{ fontSize: '0.9rem', color: colors.neutral[600] }}>
                              <strong>Daily Quota: Maximum 5 tasks</strong> - Automatically enforced by the system
                            </div>
                          </div>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                          <div style={{
                            backgroundColor: colors.priority.p3.border,
                            color: colors.priority.p3.accent,
                            padding: '0.5rem 0.75rem',
                            borderRadius: '8px',
                            fontWeight: '600',
                            fontSize: '0.9rem',
                            minWidth: '60px',
                            textAlign: 'center'
                          }}>P3</div>
                          <div style={{ flex: 1 }}>
                            <strong>Medium</strong> - Valuable but flexible timing
                            <div style={{ fontSize: '0.9rem', color: colors.neutral[600] }}>
                              <strong>Daily Quota: Unlimited</strong> - No automatic limits
                            </div>
                          </div>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                          <div style={{
                            backgroundColor: colors.priority.p4.border,
                            color: colors.priority.p4.accent,
                            padding: '0.5rem 0.75rem',
                            borderRadius: '8px',
                            fontWeight: '600',
                            fontSize: '0.9rem',
                            minWidth: '60px',
                            textAlign: 'center'
                          }}>P4</div>
                          <div style={{ flex: 1 }}>
                            <strong>Low</strong> - Nice to have, no time pressure
                            <div style={{ fontSize: '0.9rem', color: colors.neutral[600] }}>
                              <strong>Daily Quota: Unlimited</strong> - No automatic limits
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div style={{
                      backgroundColor: colors.semantic.warning.light,
                      border: `1px solid ${colors.semantic.warning.main}`,
                      padding: '1rem',
                      borderRadius: '8px',
                      fontSize: '0.9rem',
                      marginBottom: '1rem'
                    }}>
                      <strong>⚠️ Automatic WIP Enforcement:</strong> The system will automatically prevent you from moving more than 3 P1 or 5 P2 tasks to Today. If you try to exceed these limits, the action will be reverted.
                    </div>

                    <div style={{
                      backgroundColor: colors.semantic.info.light,
                      border: `1px solid ${colors.semantic.info.main}`,
                      padding: '1rem',
                      borderRadius: '8px',
                      fontSize: '0.9rem'
                    }}>
                      <strong>💡 Pro Tip:</strong> The Today section shows your priority breakdown (e.g., "P1:2 P2:3") to help you maintain healthy quotas. If you're over quota, consider moving some tasks back to Backlog.
                    </div>
                  </section>

                  {/* Automated System Rules */}
                  <section style={{ marginBottom: '2rem' }}>
                    <h3 style={{
                      color: colors.neutral[900],
                      fontSize: '1.2rem',
                      fontWeight: '600',
                      marginBottom: '1rem',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.5rem'
                    }}>
                      🤖 Automated System Rules
                    </h3>

                    <div style={{
                      backgroundColor: colors.neutral[50],
                      padding: '1.5rem',
                      borderRadius: '12px',
                      marginBottom: '1rem'
                    }}>
                      <div style={{ display: 'grid', gap: '1.5rem' }}>
                        <div>
                          <h4 style={{
                            margin: '0 0 0.5rem 0',
                            color: colors.neutral[900],
                            fontSize: '1rem',
                            fontWeight: '600',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.5rem'
                          }}>
                            🛡️ WIP Limit Enforcement
                          </h4>
                          <p style={{ margin: '0', fontSize: '0.9rem', lineHeight: '1.5' }}>
                            The system automatically prevents you from exceeding daily quotas. If you try to move more than 3 P1 or 5 P2 tasks to Today, the action will be automatically reverted. This ensures you maintain focus and don't overcommit.
                          </p>
                        </div>

                        <div>
                          <h4 style={{
                            margin: '0 0 0.5rem 0',
                            color: colors.neutral[900],
                            fontSize: '1rem',
                            fontWeight: '600',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.5rem'
                          }}>
                            🌅 Daily Triage (6:00 AM Paris Time)
                          </h4>
                          <p style={{ margin: '0 0 0.5rem 0', fontSize: '0.9rem', lineHeight: '1.5' }}>
                            Every morning at 6 AM, the system automatically:
                          </p>
                          <ul style={{ margin: '0 0 1rem 0', paddingLeft: '1.5rem', fontSize: '0.9rem' }}>
                            <li>Moves all unfinished Today tasks back to Backlog</li>
                            <li>Promotes new tasks from Backlog to Today (up to 3 P1s and 5 P2s per user)</li>
                            <li><strong>Selection is based on creation date - oldest tasks first</strong></li>
                            <li>This ensures fair rotation and prevents tasks from being stuck forever</li>
                          </ul>
                          <div style={{
                            backgroundColor: colors.semantic.info.light,
                            border: `1px solid ${colors.semantic.info.main}`,
                            padding: '0.75rem',
                            borderRadius: '6px',
                            fontSize: '0.85rem',
                            marginTop: '0.5rem'
                          }}>
                            <strong>📅 Promotion Logic:</strong> The system queries all Backlog tasks ordered by <code>createdOn</code> date (ascending), then takes the first 3 P1s and first 5 P2s for each user. This means your oldest P1 and P2 tasks will always be promoted first.
                          </div>
                        </div>

                        <div>
                          <h4 style={{
                            margin: '0 0 0.5rem 0',
                            color: colors.neutral[900],
                            fontSize: '1rem',
                            fontWeight: '600',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.5rem'
                          }}>
                            🗄️ Auto-Archive (90 Days)
                          </h4>
                          <p style={{ margin: '0', fontSize: '0.9rem', lineHeight: '1.5' }}>
                            Tasks that remain in Backlog for more than 90 days are automatically moved to Archive. This keeps your backlog fresh and prevents it from becoming overwhelming with stale tasks.
                          </p>
                        </div>

                        <div>
                          <h4 style={{
                            margin: '0 0 0.5rem 0',
                            color: colors.neutral[900],
                            fontSize: '1rem',
                            fontWeight: '600',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.5rem'
                          }}>
                            ⏰ Completion Timestamps
                          </h4>
                          <p style={{ margin: '0', fontSize: '0.9rem', lineHeight: '1.5' }}>
                            When you mark a task as complete, the system automatically records the completion timestamp for progress tracking and analytics.
                          </p>
                        </div>
                      </div>
                    </div>

                    <div style={{
                      backgroundColor: colors.semantic.success.light,
                      border: `1px solid ${colors.semantic.success.main}`,
                      padding: '1rem',
                      borderRadius: '8px',
                      fontSize: '0.9rem'
                    }}>
                      <strong>✨ Why This Works:</strong> These automated rules implement proven productivity principles from Kanban and Getting Things Done (GTD), ensuring you maintain sustainable work habits without manual overhead.
                    </div>
                  </section>

                  {/* Task Sections */}
                  <section style={{ marginBottom: '2rem' }}>
                    <h3 style={{
                      color: colors.neutral[900],
                      fontSize: '1.2rem',
                      fontWeight: '600',
                      marginBottom: '1rem',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.5rem'
                    }}>
                      📋 Task Sections
                    </h3>

                    <div style={{ display: 'grid', gap: '1rem' }}>
                      <div style={{
                        padding: '1rem',
                        backgroundColor: colors.neutral[50],
                        borderRadius: '8px',
                        borderLeft: `4px solid ${colors.actions.primary.bg}`
                      }}>
                        <strong>📅 Today & Overdue</strong>
                        <p style={{ margin: '0.5rem 0 0 0', fontSize: '0.9rem' }}>
                          Tasks you're actively working on today, plus any overdue items. Respect your priority quotas here.
                        </p>
                      </div>

                      <div style={{
                        padding: '1rem',
                        backgroundColor: colors.neutral[50],
                        borderRadius: '8px',
                        borderLeft: `4px solid ${colors.semantic.info.main}`
                      }}>
                        <strong>📋 Upcoming</strong>
                        <p style={{ margin: '0.5rem 0 0 0', fontSize: '0.9rem' }}>
                          Tasks due in the next 7 days. Plan ahead but don't work on these until they're moved to Today.
                        </p>
                      </div>

                      <div style={{
                        padding: '1rem',
                        backgroundColor: colors.neutral[50],
                        borderRadius: '8px',
                        borderLeft: `4px solid ${colors.neutral[400]}`
                      }}>
                        <strong>📝 Backlog</strong>
                        <p style={{ margin: '0.5rem 0 0 0', fontSize: '0.9rem' }}>
                          All tasks waiting to be scheduled. This is your "someday/maybe" list. Pull tasks to Today when you have capacity.
                        </p>
                      </div>

                      <div style={{
                        padding: '1rem',
                        backgroundColor: colors.neutral[50],
                        borderRadius: '8px',
                        borderLeft: `4px solid ${colors.semantic.success.main}`
                      }}>
                        <strong>✅ Completed</strong>
                        <p style={{ margin: '0.5rem 0 0 0', fontSize: '0.9rem' }}>
                          Finished tasks. Review these to celebrate progress and identify patterns.
                        </p>
                      </div>
                    </div>
                  </section>

                  {/* Quick Actions */}
                  <section style={{ marginBottom: '2rem' }}>
                    <h3 style={{
                      color: colors.neutral[900],
                      fontSize: '1.2rem',
                      fontWeight: '600',
                      marginBottom: '1rem',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.5rem'
                    }}>
                      ⚡ Quick Actions
                    </h3>

                    <div style={{ display: 'grid', gap: '0.75rem', fontSize: '0.9rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                        <span style={{
                          backgroundColor: colors.semantic.success.main,
                          color: 'white',
                          padding: '0.25rem 0.5rem',
                          borderRadius: '4px',
                          fontWeight: '600',
                          minWidth: '24px',
                          textAlign: 'center'
                        }}>✓</span>
                        <span>Mark task as complete</span>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                        <span style={{
                          backgroundColor: colors.actions.primary.bg,
                          color: 'white',
                          padding: '0.25rem 0.5rem',
                          borderRadius: '4px',
                          fontWeight: '600',
                          minWidth: '24px',
                          textAlign: 'center'
                        }}>→</span>
                        <span>Move from Backlog to Today</span>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                        <span style={{
                          backgroundColor: colors.neutral[500],
                          color: 'white',
                          padding: '0.25rem 0.5rem',
                          borderRadius: '4px',
                          fontWeight: '600',
                          minWidth: '24px',
                          textAlign: 'center'
                        }}>←</span>
                        <span>Move from Today back to Backlog</span>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                        <span style={{
                          backgroundColor: colors.neutral[400],
                          color: 'white',
                          padding: '0.25rem 0.5rem',
                          borderRadius: '4px',
                          fontWeight: '600',
                          minWidth: '24px',
                          textAlign: 'center'
                        }}>⋯</span>
                        <span>View task details and all actions</span>
                      </div>
                    </div>
                  </section>

                  {/* Best Practices */}
                  <section>
                    <h3 style={{
                      color: colors.neutral[900],
                      fontSize: '1.2rem',
                      fontWeight: '600',
                      marginBottom: '1rem',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.5rem'
                    }}>
                      ✨ Best Practices
                    </h3>

                    <ul style={{ paddingLeft: '1.5rem', fontSize: '0.9rem' }}>
                      <li style={{ marginBottom: '0.5rem' }}>Start each day by reviewing your Today section and priority distribution</li>
                      <li style={{ marginBottom: '0.5rem' }}>If you're over quota, move lower-priority tasks back to Backlog</li>
                      <li style={{ marginBottom: '0.5rem' }}>Complete tasks before pulling new ones from Backlog</li>
                      <li style={{ marginBottom: '0.5rem' }}>Use due dates to plan ahead, but don't let them override priority limits</li>
                      <li style={{ marginBottom: '0.5rem' }}>Review your Completed section weekly to track progress</li>
                      <li style={{ marginBottom: '0.5rem' }}>Keep P1 tasks rare - if everything is urgent, nothing is</li>
                      <li style={{ marginBottom: '0.5rem' }}>Trust the automated daily triage - it ensures fair task rotation</li>
                    </ul>
                  </section>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default TaskManager;
