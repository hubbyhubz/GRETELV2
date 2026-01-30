# Email Version Formatting: Excessive `*` / `**` / `***`

## Summary
The Email Version modal displayed raw markdown markers (e.g., `**bold**` and `* bullets`) because the generated “email version” string was treated as plain text and rendered inside a `<pre>`. When a list bullet `*` appears next to bold `**...**`, it commonly results in visible `***` at the start of list lines.

This fix:
- Normalizes the Email Version output to clean, plain-text email content.
- Updates the AI email-generation prompt to request plain text with non-asterisk bullets.
- Implements a functional “Go Back” behavior (close returns to the Weekly Report modal) while keeping the existing close/exit animation.

## Root Cause (Technical)

### Data flow (input → output)
1. Weekly report email generation is triggered from the weekly report UI.
2. The app asks the model to produce JSON with an `emailVersion` field.
3. The returned `emailVersion` string is stored as-is.
4. The Email Version modal renders the string as plain text.

Key code paths:
- Generation: [handleGenerateEmailReport](file:///e:/GRETEL/components/DashboardContext.tsx#L5503-L5610)
- Modal render: [EmailVersionModal](file:///e:/GRETEL/components/EmailVersionModal.tsx#L63-L114)
- Chat rendering uses markdown, but Email Version does not: [ai-message.tsx](file:///e:/GRETEL/components/ui/ai-message.tsx#L18-L101)

### Why the asterisks show up
- The AI system instructions encourage markdown in general responses.
- The email-generation prompt included markdown-like examples (e.g., section headings using `**...**`).
- The Email Version modal uses a `<pre>` (no markdown rendering), so those markers remain visible.

## Fix (What Changed)

### 1) Plain-text normalization for Email Version output
Added `normalizeEmailPlainText()` to strip common markdown markers and normalize list bullets.

- New utility: [emailPlainText.ts](file:///e:/GRETEL/lib/emailPlainText.ts)
- Applied in modal render + Copy/Download behavior: [EmailVersionModal.tsx](file:///e:/GRETEL/components/EmailVersionModal.tsx)

Behavior:
- `**bold**` → `bold`
- `*italic*` / `_italic_` → `italic`
- `* bullet` / `- bullet` → `• bullet`

### 2) Prompt hardened to request plain text (no markdown)
Updated the email-generation prompt to explicitly request plain text and forbid markdown markers.

- Updated prompt: [DashboardContext.tsx](file:///e:/GRETEL/components/DashboardContext.tsx#L5507-L5556)

### 3) “Go Back” behavior from Email Version modal close
Closing the Email Version modal now returns the user to the Weekly Report modal (previous state) while preserving the existing close animation.

- Wiring: [MainDashboardPage.tsx](file:///e:/GRETEL/components/MainDashboardPage.tsx#L3046-L3050)

## Before / After Examples

### Example 1: Bullets + bold (corrupted)
**Before**
```
* **Operational Oversight Impairment**: Direct involvement in **event setup** ...
```

**After**
```
• Operational Oversight Impairment: Direct involvement in event setup ...
```

### Example 2: Inline emphasis (corrupted)
**Before**
```
This week was marked by successful **event setups**, including the **ASEAN function** ...
```

**After**
```
This week was marked by successful event setups, including the ASEAN function ...
```

## Reproduction Steps
1. Open Weekly Report.
2. Generate Email Version.
3. In the Email Version modal, observe markdown markers like `**...**` or list bullets starting with `*`.

## Verification

### Automated tests (in repo)
- Unit tests for normalization:
  - [emailPlainText.test.ts](file:///e:/GRETEL/tests/emailPlainText.test.ts)

### Manual email-client verification checklist
Because cross-client rendering requires real email clients (or services like Litmus/Email on Acid), use this checklist:
- Gmail (web + mobile): paste copied email into composer and verify bullets/emphasis look clean.
- Outlook (desktop): paste copied email into a new message and verify bullets/spacing.
- Apple Mail: verify spacing and bullets.
- Thunderbird: verify plain-text appearance.

Test scenarios to use:
- Bullets with emphasis in the first word.
- Mixed content: headings, multiple paragraphs, nested bullets.
- Special characters: `*`, `_`, quotes, apostrophes, emoji.
- Large body (1000+ bullets) to verify no truncation and stable performance.

