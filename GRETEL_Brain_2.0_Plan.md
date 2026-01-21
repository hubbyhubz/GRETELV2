# G.R.E.T.E.L "Brain" 2.0 Suggestion Plan

## 1. Cognitive Abilities (Memory, Reasoning, Learning)

### **A. Feature: Long-Term Relational Memory Graph**
*   **Concept:** Evolve `passiveMemory` from a simple list of facts to a structured graph connecting entities (People, Projects, Events) with attributes and history.
*   **Why:** Currently, the AI knows "John is on the team." It needs to know "John leads the Q3 Marketing project and prefers afternoon meetings."
*   **Technical Implementation:**
    *   **Structure:** JSON-based graph database stored in `UserProfile` (e.g., nodes for People, edges for Relationships).
    *   **Logic:** Background "Memory Worker" that parses chat history during idle time to extract relationships.
    *   **Integration:** Injected into `geminiService.ts` system prompt as a structured relationship summary.
*   **Impact:** AI can answer complex queries like "Who is working on the marketing deck?" or "When is the best time to schedule a review with John?"
*   **Challenges:** Context window limits; privacy concerns (must stay local-first).
*   **Mitigation:** Strict token budgeting; granular user controls for memory deletion.

### **B. Feature: Adaptive "Learning Style" Optimization**
*   **Concept:** The AI tracks which types of responses get positive feedback (e.g., "Good job", "Thanks") versus negative/neutral feedback (follow-up questions, corrections).
*   **Why:** Users have different learning styles (Visual vs. Textual, Detailed vs. Concise).
*   **Technical Implementation:**
    *   **Tracking:** `DashboardState` tracks `userPreferenceScore` for different response formats (Bullet points vs. Paragraphs).
    *   **Adaptation:** `geminiService.ts` dynamically adjusts the "VISUAL & FORMATTING RULES" section of the prompt based on this score.
*   **Impact:** The AI "learns" you prefer executive summaries over detailed breakdowns without being explicitly told.

---

## 2. Emotional Intelligence (Empathy, Tone Adaptation)

### **C. Feature: "Micro-Coaching" Interventions**
*   **Concept:** Real-time, subtle behavioral coaching based on user sentiment and schedule data.
*   **Why:** Users often need a nudge, not just a task manager.
*   **Technical Implementation:**
    *   **Trigger:** `WellnessCheck` logic expands to detect "Focus Blocks" (2+ hours of deep work).
    *   **Action:** If user returns after a Focus Block, AI proactively asks: "How did the deep work session go? Did you hit a flow state?"
    *   **Tone:** Uses the "Supportive Partner" persona.
*   **Impact:** Reinforces positive habits; makes the AI feel like a dedicated performance coach.

### **D. Feature: Conflict Resolution Mode**
*   **Concept:** Specialized persona for handling interpersonal stress or team friction.
*   **Why:** "Crisis Mode" handles operational fires; "Conflict Mode" handles people fires.
*   **Technical Implementation:**
    *   **Trigger:** Keyword detection (e.g., "argument", "disagreement", "tension", "mad at me").
    *   **Behavior:** Shifts system prompt to emphasize *Non-Violent Communication (NVC)* principles, empathy mapping, and de-escalation scripts.
*   **Impact:** Provides objective, emotionally intelligent advice during sensitive personnel issues.

---

## 3. Interactive Capabilities (Flow, Context)

### **E. Feature: "Contextual Continuity" Across Sessions**
*   **Concept:** The AI "remembers" the state of mind from the *previous* session immediately upon login.
*   **Why:** Currently, a refresh wipes short-term chat context.
*   **Technical Implementation:**
    *   **Storage:** Save the last 3 turns of `chatHistory` and `currentMood` to `localStorage` (persisted across reloads).
    *   **Greeting:** On login, if `currentMood` was "Stressed" < 12 hours ago, the greeting changes: "Welcome back. I hope you've had a chance to decompress since we last spoke."
*   **Impact:** Seamless experience; eliminates the "amnesia" feeling of restarting a bot.

### **F. Feature: Multi-Modal "Show Me" Capabilities**
*   **Concept:** Allow the user to upload screenshots of their calendar or messy notes for parsing.
*   **Why:** Typing is slow; showing is fast.
*   **Technical Implementation:**
    *   **Input:** Enable the `attachedFile` input in `MainDashboardPage` to accept images.
    *   **Processing:** Use Gemini 1.5 Pro's vision capabilities (already supported by the model, just need to wire the API) to analyze the image.
    *   **Action:** "I see you have a conflict on Tuesday. Shall I move the 1 PM?"
*   **Impact:** Drastically reduces friction for data entry.

---

## 4. Prioritization Matrix

| Feature | User Value | Complexity | Feasibility | Priority |
| :--- | :--- | :--- | :--- | :--- |
| **E. Contextual Continuity** | ⭐⭐⭐⭐⭐ | Low | High | **P0 (Immediate)** |
| **A. Relational Memory** | ⭐⭐⭐⭐⭐ | High | Medium | **P1 (Next Sprint)** |
| **F. Multi-Modal "Show Me"** | ⭐⭐⭐⭐ | Medium | High | **P1 (Next Sprint)** |
| **C. Micro-Coaching** | ⭐⭐⭐ | Low | High | **P2** |
| **B. Adaptive Learning** | ⭐⭐⭐ | Medium | Medium | **P2** |
| **D. Conflict Resolution** | ⭐⭐ | Low | High | **P3** |

---

## 5. Evaluation & Success Criteria

### **Evaluation Methodology**
1.  **A/B Testing:** Deploy features to a subset of users (or toggle via "Experimental Features" settings).
2.  **Sentiment Tracking:** Monitor if the user's `currentMood` shifts from "Stressed" to "Neutral/Excited" *faster* with these features enabled.
3.  **Retention:** Measure "Daily Active Users" and "Session Length."

### **Success Metrics**
*   **Memory Accuracy:** AI correctly recalls a relational fact in >90% of test cases.
*   **Empathy Score:** User feedback (via thumbs up/down on messages) improves by 15% on "supportive" responses.
*   **Task Completion:** Users complete 10% more tasks when "Micro-Coaching" is enabled.

---

## 6. Next Steps (Execution Plan)
1.  **Approve:** Confirm this plan to proceed.
2.  **Phase 1:** Implement **Contextual Continuity** (P0) to fix the "amnesia" gap immediately.
3.  **Phase 2:** Design the **Relational Memory Graph** schema.
