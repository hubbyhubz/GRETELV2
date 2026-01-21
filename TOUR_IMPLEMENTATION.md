# G.R.E.T.E.L Onboarding Tour - Implementation Guide

## ✅ Completed

1. ✅ Installed Driver.js
2. ✅ Created OnboardingTour component
3. ✅ Created custom CSS styling (crimson theme)
4. ✅ Imported tour CSS in index.tsx

## 📋 Next Steps

### Required Element IDs to Add

Add these IDs to MainDashboardPage.tsx elements:

1. **#welcome-screen** - Initial welcome area (can be the main dashboard header)
2. **#command-palette-trigger** - Command Palette button
3. **#chat-interface** - Main chat interface container
4. **#todays-schedule** - Today's Schedule section
5. **#top-priorities** - Top Priorities section
6. **#reminders** - Reminders section
7. **#ongoing-projects** - Ongoing Projects section
8. **#delegated-tasks** - Delegated Tasks section
9. **#briefing-notes** - Briefing Notes section
10. **#daily-kickoff** - Daily Kick-off button/icon
11. **#end-of-day** - End of Day button/icon
12. **#sidebar-actions** - Sidebar quick actions container
13. **#settings-button** - Settings button
14. **#theme-toggle** - Theme toggle button

### Mobile-specific IDs:
15. **#mobile-tabs** - Bottom mobile navigation tabs
16. **#mobile-menu** - Mobile hamburger menu

## 🎯 Integration

### In MainDashboardPage.tsx:

```typescript
import { OnboardingTour } from './OnboardingTour';

// Inside your component:
<OnboardingTour 
  userProfile={userProfile} 
  onComplete={() => console.log('Tour completed!')}
/>
```

## 🚀 Usage

### Auto-start (First Login):
- Automatically starts on first login
- Saves progress if user clicks "Continue Later"
- Can resume from where they left off

### Manual Trigger:
```typescript
// From anywhere in the app:
(window as any).startGretelTour(); // Start from beginning
(window as any).continueGretelTour(); // Continue from saved position
```

### Feature Announcements:
```typescript
import { showFeatureAnnouncement } from './OnboardingTour';

showFeatureAnnouncement([
  {
    element: "#new-feature",
    popover: {
      title: "🎉 New Feature!",
      description: "Check out this new capability...",
      side: "bottom",
    },
  },
]);
```

## 🎨 Customization

Edit `styles/tour.css` to customize:
- Colors (currently using #DC143C crimson)
- Animations
- Button styles
- Mobile responsiveness

## 📱 Mobile vs Desktop

- **Desktop**: Full 14-step tour
- **Mobile**: Simplified 6-step tour
- Auto-detects screen size

## 💾 State Management

Tour state saved in localStorage:
```typescript
{
  completed: boolean,
  currentStep: number,
  dismissed: boolean,
  version: string,
  lastShown: string
}
```

## 🔧 Testing

1. Clear localStorage: `localStorage.removeItem('gretel_tour_state')`
2. Refresh page
3. Tour should auto-start

Or manually trigger: `(window as any).startGretelTour()`
