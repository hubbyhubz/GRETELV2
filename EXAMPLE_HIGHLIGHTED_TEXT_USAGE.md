# HighlightedText Component - Implementation Guide

## Component Created
- **File:** `components/HighlightedText.tsx`
- **CSS Class:** `.highlight-crimson` in `styles/global.css`

---

## Example Implementation in Today's Schedule

### Step 1: Import the Component

```tsx
import HighlightedText from './HighlightedText';
```

### Step 2: Add Search State (Optional)

If you want to add a search feature:

```tsx
const [searchTerm, setSearchTerm] = useState('');
```

### Step 3: Add Search Input (Optional)

```tsx
<input
  type="text"
  placeholder="Search schedule..."
  value={searchTerm}
  onChange={(e) => setSearchTerm(e.target.value)}
  className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600"
/>
```

### Step 4: Replace Plain Text with HighlightedText

**Before:**
```tsx
<span className={`leading-snug ${item.completed ? 'line-through text-gray-400' : ''}`}>
  {item.title}
</span>
```

**After:**
```tsx
<span className={`leading-snug ${item.completed ? 'line-through text-gray-400' : ''}`}>
  <HighlightedText text={item.title} highlight={searchTerm} />
</span>
```

---

## Complete Example: Today's Schedule Card

```tsx
// At the top of the file
import HighlightedText from './HighlightedText';

// Inside your component
const [searchTerm, setSearchTerm] = useState('');

// In the JSX (inside the Today's Schedule card)
<div id="todays-schedule" className="...">
  <div className="flex items-center justify-between">
    <h2>Today's Schedule</h2>
    {/* Optional: Add search input */}
    <input
      type="text"
      placeholder="Search..."
      value={searchTerm}
      onChange={(e) => setSearchTerm(e.target.value)}
      className="px-2 py-1 text-xs rounded border"
    />
  </div>
  
  <div className="mt-3">
    {displayedScheduleItems.map(item => (
      <div key={item.id} className="grid grid-cols-[auto,1fr] items-start gap-3">
        <div className="flex items-start shrink-0">
          {/* Checkbox and time */}
          <span className="font-semibold">{item.time}</span>
        </div>
        {/* Use HighlightedText instead of plain text */}
        <span className={`leading-snug ${item.completed ? 'line-through text-gray-400' : ''}`}>
          <HighlightedText text={item.title} highlight={searchTerm} />
        </span>
      </div>
    ))}
  </div>
</div>
```

---

## Usage in Other Components

### Top Priorities

```tsx
<HighlightedText text={priority.text} highlight={searchTerm} />
```

### Reminders

```tsx
<HighlightedText text={reminder.text} highlight={searchTerm} />
```

### Projects

```tsx
<HighlightedText text={project.name} highlight={searchTerm} />
```

### Delegated Tasks

```tsx
<HighlightedText text={task.text} highlight={searchTerm} />
```

---

## Component Props

| Prop | Type | Required | Description |
|------|------|----------|-------------|
| `text` | `string` | Yes | The full text content to display |
| `highlight` | `string` | No | The phrase to highlight (case-insensitive) |

---

## Features

✅ **Case-Insensitive:** Matches "Meeting", "meeting", "MEETING"
✅ **Partial Matches:** Highlights "meet" in "Meeting with team"
✅ **Special Characters:** Safely escapes regex characters
✅ **Error Handling:** Falls back to plain text if regex fails
✅ **Performance:** Lightweight, no external dependencies
✅ **Global Styling:** Works everywhere via `.highlight-crimson` class

---

## CSS Customization

The highlight style is in `styles/global.css`:

```css
.highlight-crimson {
  background-color: rgba(220, 20, 60, 0.3); /* 30% opacity */
  border-radius: 2px;
  padding: 1px 2px;
}
```

You can adjust:
- **Opacity:** Change `0.3` to `0.4` for stronger highlight
- **Border Radius:** Change `2px` for rounder corners
- **Padding:** Adjust spacing around highlighted text

---

## Example Output

**Input:**
```tsx
<HighlightedText text="Team meeting at 2pm" highlight="meeting" />
```

**Output:**
```
Team [meeting] at 2pm
      ^^^^^^^^
   (highlighted in crimson red)
```
