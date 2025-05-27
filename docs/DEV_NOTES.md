# TaskFlow Development Notes

## 🚨 Current Issues & Bugs

### Date Logic Issues
- **Tasks due today showing in Upcoming instead of Today**
  - Root cause: Date comparison logic may be affected by Firebase Functions running at 6:00 AM Paris time
  - Current time: 12:30 AM - tasks might be getting moved around by automated triage
  - Need to investigate interaction between client-side filtering and server-side automation
  - Location: `TaskManager.tsx` lines 145-183 (`getFilteredTasks()` function)

### Mobile Layout Testing Needed
- **Sidebar navigation on mobile needs verification**
  - New desktop sidebar implementation needs mobile testing
  - Ensure tab navigation still works properly on mobile devices
  - Verify touch interactions and responsive breakpoints
  - Test on actual mobile devices, not just browser dev tools

### ESLint Warning
- **Unused import in Auth.tsx**
  - `signOut` imported but never used (line 3:34)
  - Low priority but should be cleaned up

## 🏗️ Architecture Overview

### Frontend Structure
```
src/
├── App.tsx              # Main app component with auth wrapper
├── Auth.tsx             # Authentication component with Google sign-in
├── TaskManager.tsx      # Main task management interface (2266 lines)
├── firebase.ts          # Firebase configuration and auth
├── types.ts             # TypeScript type definitions
├── colors.ts            # Professional color system
└── mobile.css           # Mobile-specific optimizations
```

### Backend (Firebase Functions)
- **Automated Rules Engine** running at 6:00 AM Paris time:
  - WIP limit enforcement (3 P1, 5 P2 max in Today)
  - Daily triage (moves unfinished Today → Backlog, promotes oldest P1/P2)
  - Auto-archive (90+ day old Backlog tasks → Archive)
  - Completion timestamps

### State Management
- React hooks-based state (no external state management)
- Real-time Firestore subscriptions for task updates
- Local state for UI (forms, modals, mobile detection)

## 📋 Pending Tasks

### High Priority
- [ ] **Fix date logic for Today vs Upcoming filtering**
  - Debug interaction between client filtering and Firebase Functions
  - Ensure tasks due today appear in Today section regardless of automation timing
  - Test edge cases around midnight and 6 AM automation window

- [ ] **Mobile layout testing and fixes**
  - Test sidebar navigation on actual mobile devices
  - Verify responsive breakpoints work correctly
  - Ensure touch targets meet accessibility standards (44px minimum)
  - Test swipe gestures still work properly

### Medium Priority
- [ ] **Performance optimization**
  - TaskManager.tsx is 2266 lines - consider component splitting
  - Optimize re-renders with React.memo where appropriate
  - Consider virtualization for large task lists

- [ ] **Code cleanup**
  - Remove unused imports (Auth.tsx signOut)
  - Split TaskManager into smaller components
  - Extract custom hooks for complex logic

- [ ] **Enhanced mobile experience**
  - Add pull-to-refresh functionality
  - Implement better loading states
  - Add haptic feedback for mobile actions

### Low Priority
- [ ] **Documentation**
  - Add JSDoc comments to complex functions
  - Create component documentation
  - Document Firebase Functions integration

- [ ] **Testing**
  - Add unit tests for date logic
  - Add integration tests for task operations
  - Add mobile-specific tests

## ⚠️ Gotchas & Caveats

### Date Handling
- **Timezone complexity**: Firebase Functions run in Paris time (6 AM), client may be in different timezone
- **Date normalization**: Must reset hours to 00:00:00 for proper day-level comparison
- **Automation timing**: Client-side filtering may conflict with server-side task movement

### Firebase Functions Integration
- **WIP limits are enforced server-side** - client actions can be reverted
- **Daily triage is automatic** - tasks move without user action
- **Promotion logic is FIFO** - oldest tasks (by `createdOn`) are promoted first
- **No manual override** for automation rules

### Mobile Considerations
- **iOS Safari quirks**:
  - 16px font size required to prevent zoom on input focus
  - `-webkit-appearance: none` needed for custom styling
  - Safe area handling for notched devices
- **Touch targets**: Minimum 44px for accessibility
- **Viewport handling**: Proper meta tags essential for responsive design

### Performance Notes
- **Real-time subscriptions**: Firestore listeners update in real-time but can be expensive
- **Large component**: TaskManager.tsx handles too many responsibilities
- **Re-render frequency**: State changes trigger full component re-renders

## 🔧 Development Environment

### Required Tools
- Node.js 18+
- npm or yarn
- Firebase CLI (for Functions development)
- Git with SSH authentication

### Local Development
```bash
cd task-manager-frontend
npm start  # Runs on http://localhost:3000
```

### Deployment
- Frontend: Deployed via Firebase Hosting
- Backend: Firebase Functions (automatic deployment)
- Database: Firestore (real-time)

## 📱 Mobile Testing Checklist

### Responsive Design
- [ ] Test on iPhone (various sizes)
- [ ] Test on Android (various sizes)
- [ ] Test on tablet devices
- [ ] Verify breakpoints (768px, 1024px)

### Touch Interactions
- [ ] Swipe gestures work (left/right on tasks)
- [ ] Touch targets are 44px minimum
- [ ] No accidental zooming on inputs
- [ ] Smooth scrolling performance

### Navigation
- [ ] Tab navigation works on mobile
- [ ] Sidebar hidden on mobile
- [ ] Header displays correctly
- [ ] Modal interactions work

## 🎯 Future Enhancements

### User Experience
- Dark mode support
- Keyboard shortcuts
- Drag & drop task reordering
- Bulk task operations

### Features
- Task templates
- Time tracking
- Task dependencies
- Team collaboration
- Analytics dashboard

### Technical
- Offline support (PWA)
- Push notifications
- Background sync
- Performance monitoring

## 📊 Current Metrics
- **Frontend Bundle Size**: ~2.3MB (needs optimization)
- **Component Count**: 3 main components
- **Lines of Code**: ~2,500 (TaskManager needs splitting)
- **Mobile Performance**: Needs testing
- **Accessibility Score**: Needs audit

---

*Last Updated: 2025-01-27 - After sidebar navigation implementation*
