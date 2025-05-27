import React, { useState, useEffect } from 'react';
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

interface TaskManagerProps {
  user: User;
}

const TaskManager: React.FC<TaskManagerProps> = ({ user }) => {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [currentView, setCurrentView] = useState<'today' | 'upcoming' | 'backlog' | 'completed'>('today');
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

  // Form state
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    priority: Priority.P2,
    dueDate: '',
    status: TaskStatus.BACKLOG
  });

  // Handle screen size changes
  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

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
    const nextWeek = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000);

    switch (currentView) {
      case 'today':
        return tasks.filter(task =>
          task.status === TaskStatus.TODAY ||
          (task.dueDate && task.dueDate <= today && task.status !== TaskStatus.DONE)
        );
      case 'upcoming':
        return tasks.filter(task =>
          task.dueDate &&
          task.dueDate > today &&
          task.dueDate <= nextWeek &&
          task.status !== TaskStatus.DONE
        );
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
    const nextWeek = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000);

    return {
      today: tasks.filter(task =>
        task.status === TaskStatus.TODAY ||
        (task.dueDate && task.dueDate <= today && task.status !== TaskStatus.DONE)
      ).length,
      upcoming: tasks.filter(task =>
        task.dueDate &&
        task.dueDate > today &&
        task.dueDate <= nextWeek &&
        task.status !== TaskStatus.DONE
      ).length,
      backlog: tasks.filter(task => task.status === TaskStatus.BACKLOG).length,
      completed: tasks.filter(task => task.status === TaskStatus.DONE).length
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
      setFormData({
        title: '',
        description: '',
        priority: Priority.P2,
        dueDate: '',
        status: TaskStatus.BACKLOG
      });
      setShowForm(false);
    } catch (error) {
      console.error('Error creating task:', error);
      setError('Failed to create task');
    }
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
    const diffTime = dueDate.getTime() - today.getTime();
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
      backgroundColor: '#f8fafc',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
    }}>
      {/* Header */}
      <header style={{
        backgroundColor: 'white',
        borderBottom: '1px solid #e2e8f0',
        padding: isMobile ? '1rem' : '1.5rem 2rem',
        position: 'sticky',
        top: 0,
        zIndex: 100,
        boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)'
      }}>
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          maxWidth: '1200px',
          margin: '0 auto'
        }}>
          <div>
            <h1 style={{
              margin: 0,
              color: '#1a202c',
              fontSize: isMobile ? '1.5rem' : '2rem',
              fontWeight: '700'
            }}>
              ✅ TaskFlow
            </h1>
            <p style={{
              margin: '0.25rem 0 0 0',
              color: '#64748b',
              fontSize: '0.9rem'
            }}>
              Hi {user.displayName?.split(' ')[0] || 'there'}! Let's get things done.
            </p>
          </div>

          <button
            onClick={signOut}
            style={{
              backgroundColor: '#ef4444',
              color: 'white',
              border: 'none',
              padding: '0.75rem 1.5rem',
              borderRadius: '8px',
              cursor: 'pointer',
              fontSize: '0.9rem',
              fontWeight: '500',
              transition: 'all 0.2s ease'
            }}
            onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#dc2626'}
            onMouseOut={(e) => e.currentTarget.style.backgroundColor = '#ef4444'}
          >
            Sign Out
          </button>
        </div>
      </header>

      <div style={{ maxWidth: '1200px', margin: '0 auto', padding: isMobile ? '1rem' : '2rem' }}>
        {/* Navigation */}
        <nav style={{
          backgroundColor: 'white',
          borderRadius: '12px',
          padding: '0.5rem',
          marginBottom: '2rem',
          boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
          display: 'flex',
          gap: '0.25rem',
          overflowX: 'auto'
        }}>
          {[
            { key: 'today', label: 'Today & Overdue', icon: '🔥', count: taskCounts.today },
            { key: 'upcoming', label: 'Upcoming', icon: '📅', count: taskCounts.upcoming },
            { key: 'backlog', label: 'Backlog', icon: '📝', count: taskCounts.backlog },
            { key: 'completed', label: 'Completed', icon: '✅', count: taskCounts.completed }
          ].map(({ key, label, icon, count }) => (
            <button
              key={key}
              onClick={() => setCurrentView(key as any)}
              style={{
                backgroundColor: currentView === key ? '#3b82f6' : 'transparent',
                color: currentView === key ? 'white' : '#64748b',
                border: 'none',
                padding: isMobile ? '0.75rem' : '1rem 1.5rem',
                borderRadius: '8px',
                cursor: 'pointer',
                fontSize: '0.9rem',
                fontWeight: '500',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                whiteSpace: 'nowrap',
                flex: isMobile ? 'none' : '1',
                justifyContent: 'center',
                transition: 'all 0.2s ease'
              }}
            >
              <span>{icon}</span>
              {!isMobile && <span>{label}</span>}
              {count > 0 && (
                <span style={{
                  backgroundColor: currentView === key ? 'rgba(255,255,255,0.2)' : '#3b82f6',
                  color: currentView === key ? 'white' : 'white',
                  borderRadius: '12px',
                  padding: '0.125rem 0.5rem',
                  fontSize: '0.75rem',
                  fontWeight: '600',
                  minWidth: '20px',
                  textAlign: 'center'
                }}>
                  {count}
                </span>
              )}
            </button>
          ))}
        </nav>

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
        <div style={{ marginBottom: '2rem' }}>
          <button
            onClick={() => setShowForm(!showForm)}
            style={{
              backgroundColor: showForm ? '#64748b' : '#10b981',
              color: 'white',
              border: 'none',
              padding: '1rem 2rem',
              borderRadius: '12px',
              cursor: 'pointer',
              fontSize: '1rem',
              fontWeight: '600',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
              transition: 'all 0.2s ease'
            }}
            onMouseOver={(e) => {
              e.currentTarget.style.transform = 'translateY(-1px)';
              e.currentTarget.style.boxShadow = '0 8px 12px -1px rgba(0, 0, 0, 0.15)';
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.boxShadow = '0 4px 6px -1px rgba(0, 0, 0, 0.1)';
            }}
          >
            <span style={{ fontSize: '1.25rem' }}>{showForm ? '❌' : '➕'}</span>
            {showForm ? 'Cancel' : 'Add New Task'}
          </button>
        </div>

        {/* Task Form */}
        {showForm && (
          <div style={{
            backgroundColor: 'white',
            borderRadius: '16px',
            padding: '2rem',
            marginBottom: '2rem',
            boxShadow: '0 10px 25px -3px rgba(0, 0, 0, 0.1)',
            border: '1px solid #e2e8f0'
          }}>
            <h2 style={{
              margin: '0 0 1.5rem 0',
              color: '#1a202c',
              fontSize: '1.5rem',
              fontWeight: '600'
            }}>
              ✨ Create New Task
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
                    padding: '1rem',
                    border: '2px solid #e2e8f0',
                    borderRadius: '8px',
                    fontSize: '1rem',
                    boxSizing: 'border-box',
                    transition: 'border-color 0.2s ease'
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
                    padding: '1rem',
                    border: '2px solid #e2e8f0',
                    borderRadius: '8px',
                    fontSize: '1rem',
                    boxSizing: 'border-box',
                    minHeight: '100px',
                    resize: 'vertical',
                    fontFamily: 'inherit',
                    transition: 'border-color 0.2s ease'
                  }}
                  onFocus={(e) => e.currentTarget.style.borderColor = '#3b82f6'}
                  onBlur={(e) => e.currentTarget.style.borderColor = '#e2e8f0'}
                />
              </div>

              {/* Priority, Due Date, Status */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr 1fr',
                gap: '1rem'
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
                      padding: '1rem',
                      border: '2px solid #e2e8f0',
                      borderRadius: '8px',
                      fontSize: '1rem',
                      boxSizing: 'border-box',
                      backgroundColor: 'white'
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
                      padding: '1rem',
                      border: '2px solid #e2e8f0',
                      borderRadius: '8px',
                      fontSize: '1rem',
                      boxSizing: 'border-box'
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
                      padding: '1rem',
                      border: '2px solid #e2e8f0',
                      borderRadius: '8px',
                      fontSize: '1rem',
                      boxSizing: 'border-box',
                      backgroundColor: 'white'
                    }}
                  >
                    <option value={TaskStatus.BACKLOG}>📝 Backlog</option>
                    <option value={TaskStatus.TODAY}>🔥 Today</option>
                  </select>
                </div>
              </div>

              {/* Form Buttons */}
              <div style={{ display: 'flex', gap: '1rem', paddingTop: '1rem' }}>
                <button
                  onClick={createTask}
                  disabled={!formData.title.trim()}
                  style={{
                    backgroundColor: formData.title.trim() ? '#10b981' : '#d1d5db',
                    color: 'white',
                    border: 'none',
                    padding: '1rem 2rem',
                    borderRadius: '8px',
                    cursor: formData.title.trim() ? 'pointer' : 'not-allowed',
                    fontSize: '1rem',
                    fontWeight: '600',
                    flex: '1',
                    transition: 'all 0.2s ease'
                  }}
                >
                  ✨ Create Task
                </button>
                <button
                  onClick={() => {
                    setShowForm(false);
                    setFormData({
                      title: '',
                      description: '',
                      priority: Priority.P2,
                      dueDate: '',
                      status: TaskStatus.BACKLOG
                    });
                  }}
                  style={{
                    backgroundColor: 'transparent',
                    color: '#64748b',
                    border: '2px solid #e2e8f0',
                    padding: '1rem 2rem',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    fontSize: '1rem',
                    fontWeight: '500'
                  }}
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Tasks List */}
        <div style={{ display: 'grid', gap: '1rem' }}>
          {filteredTasks.map(task => {
            const isOverdue = task.dueDate && task.dueDate < new Date() && task.status !== TaskStatus.DONE;
            const daysUntilDue = task.dueDate ? getDaysUntilDue(task.dueDate) : null;

            return (
              <div
                key={task.id}
                style={{
                  backgroundColor: 'white',
                  borderRadius: '12px',
                  padding: '1.5rem',
                  boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
                  border: isOverdue ? '2px solid #ef4444' : '1px solid #e2e8f0',
                  position: 'relative',
                  transition: 'all 0.2s ease'
                }}
                onMouseOver={(e) => {
                  if (!isOverdue) {
                    e.currentTarget.style.boxShadow = '0 8px 25px -3px rgba(0, 0, 0, 0.1)';
                    e.currentTarget.style.transform = 'translateY(-1px)';
                  }
                }}
                onMouseOut={(e) => {
                  e.currentTarget.style.boxShadow = '0 4px 6px -1px rgba(0, 0, 0, 0.1)';
                  e.currentTarget.style.transform = 'translateY(0)';
                }}
              >
                {/* Overdue Badge */}
                {isOverdue && (
                  <div style={{
                    position: 'absolute',
                    top: '-8px',
                    right: '1rem',
                    backgroundColor: '#ef4444',
                    color: 'white',
                    padding: '0.25rem 0.75rem',
                    borderRadius: '12px',
                    fontSize: '0.75rem',
                    fontWeight: '600'
                  }}>
                    🚨 OVERDUE
                  </div>
                )}

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '1rem' }}>
                  <div style={{ flex: 1 }}>
                    <h3 style={{
                      margin: 0,
                      color: '#1a202c',
                      fontSize: '1.25rem',
                      fontWeight: '600',
                      textDecoration: task.status === TaskStatus.DONE ? 'line-through' : 'none',
                      opacity: task.status === TaskStatus.DONE ? 0.6 : 1
                    }}>
                      {task.title}
                    </h3>

                    {task.description && (
                      <p style={{
                        color: '#64748b',
                        margin: '0.5rem 0 0 0',
                        lineHeight: '1.5'
                      }}>
                        {task.description}
                      </p>
                    )}

                    <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1rem', flexWrap: 'wrap' }}>
                      {/* Priority Badge */}
                      <span style={{
                        backgroundColor: task.priority === Priority.P1 ? '#ef4444' :
                                        task.priority === Priority.P2 ? '#f97316' :
                                        task.priority === Priority.P3 ? '#eab308' : '#22c55e',
                        color: 'white',
                        padding: '0.5rem 1rem',
                        borderRadius: '20px',
                        fontSize: '0.85rem',
                        fontWeight: '600'
                      }}>
                        {task.priority === Priority.P1 ? '🔴' :
                         task.priority === Priority.P2 ? '🟠' :
                         task.priority === Priority.P3 ? '🟡' : '🟢'} {task.priority}
                      </span>

                      {/* Status Badge */}
                      <span style={{
                        backgroundColor: task.status === TaskStatus.TODAY ? '#3b82f6' :
                                        task.status === TaskStatus.DONE ? '#10b981' : '#64748b',
                        color: 'white',
                        padding: '0.5rem 1rem',
                        borderRadius: '20px',
                        fontSize: '0.85rem',
                        fontWeight: '600'
                      }}>
                        {task.status === TaskStatus.TODAY ? '🔥' :
                         task.status === TaskStatus.DONE ? '✅' : '📝'} {task.status}
                      </span>

                      {/* Due Date Badge */}
                      {task.dueDate && (
                        <span style={{
                          backgroundColor: isOverdue ? '#ef4444' :
                                          daysUntilDue !== null && daysUntilDue <= 3 ? '#f97316' : '#64748b',
                          color: 'white',
                          padding: '0.5rem 1rem',
                          borderRadius: '20px',
                          fontSize: '0.85rem',
                          fontWeight: '600'
                        }}>
                          📅 {task.dueDate.toLocaleDateString()}
                          {daysUntilDue !== null && (
                            <span style={{ marginLeft: '0.5rem' }}>
                              ({isOverdue ? `${Math.abs(daysUntilDue)} days overdue` :
                                daysUntilDue === 0 ? 'Due today' :
                                daysUntilDue === 1 ? 'Due tomorrow' :
                                `${daysUntilDue} days left`})
                            </span>
                          )}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Action Buttons */}
                <div style={{
                  display: 'flex',
                  gap: '0.75rem',
                  paddingTop: '1rem',
                  borderTop: '1px solid #e2e8f0',
                  flexWrap: 'wrap'
                }}>
                  {task.status === TaskStatus.BACKLOG && (
                    <button
                      onClick={() => updateTaskStatus(task.id, TaskStatus.TODAY)}
                      style={{
                        backgroundColor: '#3b82f6',
                        color: 'white',
                        border: 'none',
                        padding: '0.75rem 1.5rem',
                        borderRadius: '8px',
                        cursor: 'pointer',
                        fontSize: '0.9rem',
                        fontWeight: '500',
                        transition: 'all 0.2s ease'
                      }}
                    >
                      🔥 Move to Today
                    </button>
                  )}

                  {task.status === TaskStatus.TODAY && (
                    <button
                      onClick={() => updateTaskStatus(task.id, TaskStatus.BACKLOG)}
                      style={{
                        backgroundColor: '#64748b',
                        color: 'white',
                        border: 'none',
                        padding: '0.75rem 1.5rem',
                        borderRadius: '8px',
                        cursor: 'pointer',
                        fontSize: '0.9rem',
                        fontWeight: '500',
                        transition: 'all 0.2s ease'
                      }}
                    >
                      📝 Move to Backlog
                    </button>
                  )}

                  {task.status !== TaskStatus.DONE && (
                    <button
                      onClick={() => updateTaskStatus(task.id, TaskStatus.DONE)}
                      style={{
                        backgroundColor: '#10b981',
                        color: 'white',
                        border: 'none',
                        padding: '0.75rem 1.5rem',
                        borderRadius: '8px',
                        cursor: 'pointer',
                        fontSize: '0.9rem',
                        fontWeight: '500',
                        transition: 'all 0.2s ease'
                      }}
                    >
                      ✅ Mark Complete
                    </button>
                  )}

                  <button
                    onClick={() => deleteTask(task.id)}
                    style={{
                      backgroundColor: '#ef4444',
                      color: 'white',
                      border: 'none',
                      padding: '0.75rem 1.5rem',
                      borderRadius: '8px',
                      cursor: 'pointer',
                      fontSize: '0.9rem',
                      fontWeight: '500',
                      transition: 'all 0.2s ease'
                    }}
                  >
                    🗑️ Delete
                  </button>
                </div>

                {/* Task Metadata */}
                <div style={{
                  marginTop: '1rem',
                  fontSize: '0.85rem',
                  color: '#9ca3af'
                }}>
                  Created: {task.createdOn.toLocaleDateString()}
                  {task.completedOn && (
                    <span> • Completed: {task.completedOn.toLocaleDateString()}</span>
                  )}
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
            boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
          }}>
            <div style={{ fontSize: '4rem', marginBottom: '1rem' }}>
              {currentView === 'today' ? '🔥' :
               currentView === 'upcoming' ? '📅' :
               currentView === 'backlog' ? '📝' : '✅'}
            </div>
            <h3 style={{ color: '#1a202c', margin: '0 0 1rem 0' }}>
              No {currentView} tasks yet!
            </h3>
            <p style={{ color: '#64748b', margin: '0 0 2rem 0' }}>
              {currentView === 'today' && "Tasks due today or overdue will appear here."}
              {currentView === 'upcoming' && "Tasks due in the next 7 days will appear here."}
              {currentView === 'backlog' && "Your backlog tasks will appear here."}
              {currentView === 'completed' && "Completed tasks will appear here."}
            </p>
            <button
              onClick={() => setShowForm(true)}
              style={{
                backgroundColor: '#10b981',
                color: 'white',
                border: 'none',
                padding: '1rem 2rem',
                borderRadius: '8px',
                cursor: 'pointer',
                fontSize: '1rem',
                fontWeight: '600'
              }}
            >
              ➕ Create Your First Task
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default TaskManager;
