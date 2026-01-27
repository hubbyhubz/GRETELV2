// Google Tasks API integration
const TASKS_API_BASE_URL = 'https://www.googleapis.com/tasks/v1';

/**
 * Finds a task list by name, or creates it if it doesn't exist.
 * @param accessToken The user's Google OAuth2 access token.
 * @param listName The name of the task list to find or create.
 * @returns The ID of the task list.
 */
export const findOrCreateTaskList = async (accessToken: string, listName: string): Promise<string> => {
  // 1. Fetch all task lists
  const response = await fetch(`${TASKS_API_BASE_URL}/users/@me/lists`, {
    headers: { 'Authorization': `Bearer ${accessToken}` },
  });
  if (!response.ok) {
    const errorBody = await response.json();
    const err = new Error(`Failed to fetch task lists: ${errorBody.error.message}`);
    const reason = errorBody?.error?.errors?.[0]?.reason;
    (err as any).status = response.status;
    (err as any).reason = reason;
    (err as any).service = 'tasks';
    throw err;
  }
  const { items: lists } = await response.json();

  // 2. Check if the list already exists
  const existingList = lists.find((list: any) => list.title === listName);
  if (existingList) {
    return existingList.id;
  }

  // 3. If not, create it
  const createResponse = await fetch(`${TASKS_API_BASE_URL}/users/@me/lists`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ title: listName }),
  });
  if (!createResponse.ok) {
    const errorBody = await createResponse.json();
    const err = new Error(`Failed to create task list: ${errorBody.error.message}`);
    const reason = errorBody?.error?.errors?.[0]?.reason;
    (err as any).status = createResponse.status;
    (err as any).reason = reason;
    (err as any).service = 'tasks';
    throw err;
  }
  const newList = await createResponse.json();
  return newList.id;
};

/**
 * Creates a new task in a specific task list.
 * @param accessToken The user's Google OAuth2 access token.
 * @param taskListId The ID of the task list where the task will be added.
 * @param title The title of the new task.
 * @param notes Additional details or notes for the task.
 * @param due An optional RFC 3339 timestamp for the task's due date.
 * @returns A promise that resolves to the newly created task object.
 */
export const createTask = async (accessToken: string, taskListId: string, title: string, notes: string, due?: string): Promise<any> => {
  const task: { title: string; notes: string; due?: string } = {
    title: title,
    notes: notes,
  };

  if (due) {
    // Google Tasks API expects the 'due' time to be an RFC 3339 timestamp.
    // e.g., '2025-10-27T10:00:00.000Z'
    // Validate the format before sending
    try {
      const date = new Date(due);
      if (isNaN(date.getTime())) {
        throw new Error(`Invalid date format: ${due}. Expected RFC 3339 format (e.g., 2025-10-27T10:00:00.000Z)`);
      }
      // Ensure it's in proper ISO format
      task.due = date.toISOString();
    } catch (error: any) {
      throw new Error(`Invalid deadline format: ${error.message}`);
    }
  }

  const response = await fetch(`${TASKS_API_BASE_URL}/lists/${taskListId}/tasks`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(task),
  });

  if (!response.ok) {
    const errorBody = await response.json();
    console.error("Google Tasks API - Create Task Error:", errorBody);
    const err = new Error(`Failed to create task: ${errorBody.error.message}`);
    const reason = errorBody?.error?.errors?.[0]?.reason;
    (err as any).status = response.status;
    (err as any).reason = reason;
    (err as any).service = 'tasks';
    throw err;
  }

  return response.json();
};

/**
 * Updates an existing task, for example to change its status.
 * @param accessToken The user's Google OAuth2 access token.
 * @param taskListId The ID of the task list containing the task.
 * @param taskId The ID of the task to update.
 * @param payload An object containing the fields to update, e.g., { status: 'completed' }.
 * @returns A promise that resolves to the updated task object.
 */
export const updateTask = async (accessToken: string, taskListId: string, taskId: string, payload: { status: 'completed' | 'needsAction' }): Promise<any> => {
    // The 'PATCH' method is used to partially update a resource.
    const response = await fetch(`${TASKS_API_BASE_URL}/lists/${taskListId}/tasks/${taskId}`, {
        method: 'PATCH',
        headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
    });

    if (!response.ok) {
        const errorBody = await response.json();
        console.error("Google Tasks API - Update Task Error:", errorBody);
        const err = new Error(`Failed to update task: ${errorBody.error.message}`);
        const reason = errorBody?.error?.errors?.[0]?.reason;
        (err as any).status = response.status;
        (err as any).reason = reason;
        (err as any).service = 'tasks';
        throw err;
    }

    return response.json();
};

/**
 * Deletes a task from a specific task list.
 * @param accessToken The user's Google OAuth2 access token.
 * @param taskListId The ID of the task list containing the task.
 * @param taskId The ID of the task to delete.
 * @returns A promise that resolves when the task is deleted. The response body is empty on success.
 */
export const deleteTask = async (accessToken: string, taskListId: string, taskId: string): Promise<void> => {
    const response = await fetch(`${TASKS_API_BASE_URL}/lists/${taskListId}/tasks/${taskId}`, {
        method: 'DELETE',
        headers: {
            'Authorization': `Bearer ${accessToken}`,
        },
    });

    // A 204 No Content is a successful response for DELETE, and response.ok handles it.
    if (!response.ok) {
        const errorBody = await response.json().catch(() => ({})); // response might be empty
        console.error("Google Tasks API - Delete Task Error:", errorBody);
        const err = new Error(`Failed to delete task: ${errorBody.error?.message || 'Unknown error'}`);
        const reason = errorBody?.error?.errors?.[0]?.reason;
        (err as any).status = response.status;
        (err as any).reason = reason;
        (err as any).service = 'tasks';
        throw err;
    }
};