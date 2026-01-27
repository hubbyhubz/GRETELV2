# Assistant Free-Style Response Logic

This document explains how the AI assistant handles free-style responses and requests that fall outside the structured workflows and rules.

---

## Overview

The assistant has **two layers** of logic for handling user requests:

1. **Free-Style NLU (Natural Language Understanding)** - Pre-processes messages to detect specific intents
2. **General AI Conversation** - Falls back to the AI model's general understanding when no structured workflow matches

---

## Free-Style NLU Layer

**Location:** `components/freeStyleNlu.ts`

### Purpose

Detects common user intents from natural language **before** sending to the AI, allowing for quick, direct actions without AI processing.

### Supported Intents

1. **`finalize_plan`** - User approves a draft schedule
   - Patterns: "finalize", "confirm", "looks good", "go ahead", "approved"
   - Action: Calls `handleConfirmPlan()`

2. **`cancel_pending`** - User cancels a pending clarification
   - Patterns: "cancel", "never mind", "stop", "forget it"
   - Action: Clears pending delegation/schedule clarification

3. **`proceed`** - User wants to proceed without questions
   - Patterns: "proceed", "continue", "go ahead", "move on"
   - Action: Signals AI to make assumptions and proceed

4. **`exclude_item`** - User wants to exclude an item
   - Patterns: "don't include", "exclude", "skip", "remove", "omit"
   - Action: Removes item from schedule/reminders/Event Ops

5. **`mark_done`** - User marks something as completed
   - Patterns: "already done", "completed", "finished"
   - Action: Marks item as completed

### How It Works

1. **Text Normalization:**
   - Converts to lowercase
   - Removes special characters
   - Normalizes quotes and dashes

2. **Pattern Matching:**
   - Uses regex patterns to detect intents
   - Checks for negation words (don't, not yet, wait)

3. **Entity Extraction:**
   - For exclude/done intents, extracts the target item
   - Uses fuzzy matching to find items in schedule/reminders/Event Ops
   - Confidence threshold: 0.45 (45% match required)

4. **Direct Action:**
   - If intent detected with high confidence → Executes action directly
   - If intent unclear → Passes to AI for interpretation

---

## General AI Conversation Layer

**Location:** `components/geminiService.ts` → `buildSystemInstruction()`

### When Free-Style NLU Doesn't Match

If the user's message doesn't match any free-style intent, it's sent to the AI model with:

1. **Full Context:**
   - User profile and preferences
   - Dashboard state (all 7 cards)
   - Google Calendar events
   - Event Ops items
   - Conversation history

2. **System Instructions:**
   - Structured workflows (Daily Kick-off, Briefing)
   - Dashboard modification capabilities
   - Assistant Configuration rules (HIGHEST PRIORITY)
   - Team Management awareness

3. **General Guidance:**
   - "Your primary function is to help the user manage their day, tasks, and projects efficiently"
   - "You must be proactive, intelligent, and context-aware"

### Handling Out-of-Scope Requests

**Current Behavior:**

The assistant **does NOT have explicit instructions** for handling requests that are:
- Outside the defined workflows
- Not related to dashboard management
- General questions or conversations
- Requests the assistant cannot fulfill

**What Actually Happens:**

1. **If request matches a workflow:**
   - Follows the structured workflow exactly
   - Example: "Time for my daily kick-off" → Triggers Daily Kick-off workflow

2. **If request is dashboard-related:**
   - AI interprets the request
   - Uses available JSON fields to modify dashboard
   - Example: "Add a reminder to call John" → Uses `reminderOps`

3. **If request is unclear:**
   - AI asks for clarification
   - Uses `clarificationRequest` field

4. **If request is out of scope:**
   - AI responds conversationally
   - May attempt to help or redirect to dashboard features
   - No explicit "I can't do that" response

---

## Limitations

### What the Assistant CANNOT Do

1. **No Explicit Out-of-Scope Handling:**
   - No instruction to say "I can't help with that"
   - No guidance on redirecting to relevant features
   - No boundary definition for scope

2. **No General Knowledge Mode:**
   - Not designed for general Q&A
   - Focused on dashboard management
   - May attempt to answer but not optimized for it

3. **No Error Recovery for Unsupported Requests:**
   - If user asks for something impossible, AI may try anyway
   - No graceful degradation

---

## Current System Instruction Gaps

### Missing Instructions:

1. **Scope Definition:**
   - No explicit statement of what the assistant can/cannot do
   - No guidance on handling requests outside scope

2. **Graceful Decline:**
   - No instruction to politely decline unsupported requests
   - No guidance on suggesting alternatives

3. **General Conversation:**
   - No instruction for handling casual conversation
   - No guidance on when to be conversational vs. task-focused

---

## Recommended Enhancements

### 1. Add Scope Definition

Add to system instruction:
```
**YOUR SCOPE AND CAPABILITIES:**
- You are a productivity assistant focused on daily task management, scheduling, and project coordination
- You can modify dashboard cards (schedule, priorities, reminders, projects, delegated tasks, briefing notes)
- You can help with planning, delegation, and workflow management
- You CANNOT: access external systems, make purchases, send emails directly, or perform actions outside this app
- If a request is outside your scope, politely explain what you CAN help with instead
```

### 2. Add Graceful Decline Logic

Add to system instruction:
```
**HANDLING OUT-OF-SCOPE REQUESTS:**
If a user asks for something you cannot do:
1. Acknowledge the request politely
2. Explain what you CAN help with that's related
3. Suggest relevant dashboard features or workflows
4. Example: "I can't send emails directly, but I can add a reminder to your list or create a delegated task for follow-up."
```

### 3. Add General Conversation Mode

Add to system instruction:
```
**GENERAL CONVERSATION:**
- You can engage in friendly, helpful conversation
- Keep responses focused on productivity and task management when possible
- If user asks general questions, answer briefly and redirect to relevant features
- Maintain your identity as [Assistant Name] and stay in character
```

---

## Examples

### Example 1: Out-of-Scope Request

**User:** "Can you book a flight for me?"

**Current Behavior:**
- AI may try to help or respond conversationally
- No explicit decline
- May suggest adding a reminder instead

**With Enhancement:**
- AI: "I can't book flights directly, but I can add a reminder to your list or create a task to book the flight. Would you like me to do that?"

### Example 2: General Question

**User:** "What's the weather today?"

**Current Behavior:**
- AI may answer if it has knowledge
- Not optimized for this type of question

**With Enhancement:**
- AI: "I don't have access to weather data, but I can help you plan your day based on your schedule and priorities. Would you like to review today's plan?"

### Example 3: Unsupported Feature

**User:** "Can you send an email to my boss?"

**Current Behavior:**
- AI may try to help or suggest alternatives
- No clear boundary

**With Enhancement:**
- AI: "I can't send emails directly, but I can help you prepare briefing notes or create a delegated task for follow-up. Would either of those work?"

---

## Code Locations

- **Free-Style NLU:** `components/freeStyleNlu.ts`
- **System Instruction:** `components/geminiService.ts` → `buildSystemInstruction()`
- **Message Processing:** `components/DashboardContext.tsx` → `handleSendMessage()`

---

## Summary

**Current State:**
- ✅ Free-style NLU for common intents (finalize, cancel, exclude, mark done)
- ✅ General AI conversation for everything else
- ❌ No explicit out-of-scope handling
- ❌ No scope definition
- ❌ No graceful decline logic

**Recommendation:**
Add explicit scope definition and graceful decline instructions to the system instruction to improve handling of out-of-scope requests.
