# 🎨 Crimson Red Brand Color Guide

## Overview
This guide standardizes the use of our Crimson Red brand colors across the entire application using CSS custom properties (CSS variables).

---

## 📊 Color Palette Scale

All colors are defined in `styles/global.css`:

```css
:root {
  /* BACKGROUND TINTS (Use for light highlights, hover backgrounds) */
  --primary-50:  #fff0f2;  /* Lightest pink-white */
  --primary-100: #ffe3e4;  /* Very light pink */
  --primary-200: #ffcbd1;  /* Light pink */
  
  /* UI ELEMENTS (Use for borders, weak icons) */
  --primary-300: #ffa0aa;  /* Medium-light pink */
  --primary-400: #ff6b7e;  /* Medium pink-red */
  
  /* MAIN ACTIONS (Use for Buttons, Checkboxes, Active States) */
  --primary-500: #fb3855;  /* Bright crimson */
  --primary-600: #dc143c;  /* MAIN BRAND COLOR (Crimson) ⭐ */
  
  /* TEXT & HOVER STATES (Use for dark text, button hover) */
  --primary-700: #c50b34;  /* Dark crimson */
  --primary-800: #a50c33;  /* Darker crimson */
  --primary-900: #8d0e33;  /* Very dark crimson */
  --primary-950: #4f0217;  /* Deepest burgundy (almost black) */
}
```

---

## 🎯 Usage Guidelines

### **Primary Buttons**
```css
/* Normal State */
background-color: var(--primary-600);
color: white;

/* Hover State */
background-color: var(--primary-700);

/* Active/Pressed State */
background-color: var(--primary-800);
```

### **Light Backgrounds & Highlights**
```css
/* Text selection background */
background-color: var(--primary-50);

/* Hover backgrounds (subtle) */
background-color: var(--primary-100);

/* Card hover effects */
background-color: var(--primary-200);
```

### **Borders**
```css
/* Subtle borders */
border-color: var(--primary-200);

/* Standard borders */
border-color: var(--primary-600);

/* Focus borders */
border-color: var(--primary-500);
```

### **Text Selection**
```css
::selection {
  background-color: var(--primary-600);
  color: white;
}
```

### **Icons**
```css
/* Active/primary icons */
color: var(--primary-600);

/* Inactive/secondary icons */
color: var(--primary-400);

/* Hover state */
color: var(--primary-700);
```

### **Checkboxes & Toggle Elements**
```css
/* Unchecked border */
border-color: var(--primary-600);

/* Checked/active state */
background-color: var(--primary-600);

/* Checked hover */
background-color: var(--primary-700);
```

---

## 🌓 Dark Mode Considerations

When using these colors in dark mode, consider:

- **Backgrounds:** Use `--primary-950`, `--primary-900` for dark backgrounds
- **Text on dark:** Use lighter shades (`--primary-100`, `--primary-200`)
- **Borders on dark:** Use `--primary-700` or `--primary-600`

Example:
```css
.dark-mode-element {
  background-color: var(--primary-950);
  border-color: var(--primary-700);
  color: var(--primary-100);
}
```

---

## ✅ Components Already Using CSS Variables

The following components have been updated to use CSS variables:

### **✅ `styles/global.css`**
- Text selection (`::selection`)
- Text highlighting (`.highlight-crimson`)

### **✅ `styles/theme-toggle.css`**
- Toggle border
- Dark mode background (gradient `--primary-950` → `--primary-900`)
- Light mode background (gradient `--primary-50` → `--primary-200`)
- Sun (gradient `--primary-500` → `--primary-700`)
- Moon craters (`--primary-100`, `--primary-200`, `--primary-300`)
- Stars (`--primary-100` with `--primary-300` glow)
- Clouds (white → `--primary-50`)
- Background clouds (`--primary-400` → `--primary-300`)

### **✅ `styles/checkbox.css`**
- Checkbox border (`--primary-600`)
- Checkbox splash animation (`--primary-600`)

---

## 🚫 DO NOT Use

### ❌ Hardcoded Hex Values
```css
/* ❌ WRONG */
color: #DC143C;
background-color: #fff0f2;

/* ✅ CORRECT */
color: var(--primary-600);
background-color: var(--primary-50);
```

### ❌ Random Red Shades
```css
/* ❌ WRONG */
color: #ff0000;
color: #e91e63;
color: crimson; /* CSS named color */

/* ✅ CORRECT - Use the appropriate scale variable */
color: var(--primary-600);
```

---

## 📝 How to Add New Crimson Elements

### Step 1: Choose the Right Shade
Refer to the palette scale above and select based on purpose:
- **Light backgrounds?** → `--primary-50` to `--primary-200`
- **UI elements/borders?** → `--primary-300` or `--primary-400`
- **Main actions/buttons?** → `--primary-600`
- **Hover states?** → `--primary-700`
- **Dark backgrounds?** → `--primary-900` or `--primary-950`

### Step 2: Use CSS Variables
```css
.my-new-component {
  border: 2px solid var(--primary-600);
  background-color: var(--primary-50);
}

.my-new-component:hover {
  background-color: var(--primary-100);
  border-color: var(--primary-700);
}
```

### Step 3: Add Dark Mode Variants
```css
.dark .my-new-component {
  background-color: var(--primary-950);
  border-color: var(--primary-700);
  color: var(--primary-100);
}
```

---

## 🔍 Finding & Replacing Old Hex Codes

To find remaining hardcoded crimson colors in your codebase:

```bash
# Search for common crimson hex codes
grep -r "#DC143C" .
grep -r "#dc143c" .
grep -r "#fb3855" .
grep -r "#ff6b7e" .
```

Replace them with the appropriate CSS variable.

---

## 🎨 Visual Reference

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 Lightest                    Darkest
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  50   100  200  300  400  500  600  700  800  900  950
  🎀   🌸   💗   🌹   ❤️   🔴   🍷   🩸   🌑   ⚫   ⬛
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
       Backgrounds        Main     Hover    Dark
                         Brand    States   Modes
```

---

## ✨ Benefits

✅ **Consistency:** One source of truth for all brand colors  
✅ **Maintainability:** Update colors globally by changing CSS variables  
✅ **Readability:** Semantic names (`--primary-600`) vs hex codes  
✅ **Scalability:** Easy to extend with new shades  
✅ **Accessibility:** Standardized contrast ratios  

---

## 📚 Additional Resources

- [MDN: Using CSS custom properties](https://developer.mozilla.org/en-US/docs/Web/CSS/Using_CSS_custom_properties)
- [W3C: CSS Custom Properties](https://www.w3.org/TR/css-variables-1/)

---

**Last Updated:** January 2026  
**Maintained By:** BEATRIX Development Team
