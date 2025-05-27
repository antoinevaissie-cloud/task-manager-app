# TaskFlow - Immediate TODOs

## 🔥 Critical Issues (Fix ASAP)

### 1. Date Logic Bug
- [ ] **Tasks due today showing in Upcoming section**
  - Investigate why tasks due today appear in Upcoming instead of Today
  - Likely related to Firebase Functions automation at 6 AM Paris time
  - Current time: 12:30 AM - automation may have moved tasks
  - **File**: `src/TaskManager.tsx` lines 145-183

### 2. Mobile Testing Required
- [ ] **Test new sidebar navigation on mobile devices**
  - Verify sidebar is hidden on mobile (should show tab navigation)
  - Test responsive breakpoints (768px, 1024px)
  - Ensure touch interactions still work
  - **Priority**: High - new layout needs validation

## 🧹 Quick Fixes

### 3. Code Cleanup
- [ ] **Remove unused import in Auth.tsx**
  - Line 3:34: `signOut` imported but never used
  - **Priority**: Low - just cleanup

## 🔍 Investigation Needed

### 4. Date Filtering Logic
```typescript
// Current logic in getFilteredTasks() - line 145
case 'today':
  return tasks.filter(task => {
    // Explicitly set to TODAY status
    if (task.status === TaskStatus.TODAY) return true;

    // Due today or overdue, but ONLY if not explicitly set to BACKLOG
    if (task.dueDate && task.status !== TaskStatus.DONE && task.status !== TaskStatus.BACKLOG) {
      const taskDueDate = new Date(task.dueDate);
      taskDueDate.setHours(0, 0, 0, 0);
      return taskDueDate <= today; // ← This might be the issue
    }
    return false;
  });
```

**Potential Issues:**
- Firebase Functions may have moved tasks at 6 AM
- Client timezone vs server timezone mismatch
- Date comparison logic edge cases

### 5. Firebase Functions Interaction
- Daily triage runs at 6:00 AM Paris time
- Moves unfinished Today tasks → Backlog
- Promotes oldest P1/P2 from Backlog → Today
- **Question**: Are tasks getting moved by automation before user sees them?

## 📱 Mobile Testing Checklist

When testing on mobile:
- [ ] Sidebar navigation hidden (< 768px)
- [ ] Tab navigation visible and functional
- [ ] Touch targets 44px minimum
- [ ] Swipe gestures work (left/right on tasks)
- [ ] No zoom on input focus (16px font size)
- [ ] Responsive layout works on various screen sizes

## 🚀 Next Steps

1. **Debug date logic** - Add console logs to understand task filtering
2. **Test mobile layout** - Use actual devices, not just browser dev tools
3. **Fix any issues found** - Prioritize mobile experience
4. **Commit fixes** - Push to GitHub when resolved

---

*Created: 2025-01-27 at 12:30 AM*
*Status: New sidebar navigation implemented, needs testing*
