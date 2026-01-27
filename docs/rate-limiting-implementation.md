# Rate Limiting Implementation

## Overview

Implemented a comprehensive rate limiting solution to handle OpenAI API rate limits (TPM - Tokens Per Minute) when multiple users access the application simultaneously.

---

## Problem

When multiple users use the app simultaneously, they share the same OpenAI API key. OpenAI enforces rate limits:
- **TPM (Tokens Per Minute)**: 30,000 tokens per minute per organization
- When the limit is exceeded, requests fail with a 429 error
- Error message includes wait time: "Please try again in X.XXXs"

Without proper handling, users see errors and requests fail immediately.

---

## Solution

### 1. **Request Queue System**

**Location:** `components/geminiService.ts` → `ApiRequestQueue` class

**Features:**
- **Sequential Processing**: Processes one request at a time to respect rate limits
- **Automatic Retry**: Retries failed requests with exponential backoff
- **Rate Limit Parsing**: Extracts wait time from error messages
- **Fallback Support**: Falls back to direct OpenAI API if Vercel API fails

**How It Works:**
1. All API requests are added to a queue
2. Queue processes requests one at a time
3. If a rate limit error occurs:
   - Parse the error to extract wait time
   - Wait for the specified duration (plus 10% buffer)
   - Retry the request automatically
4. Maximum 3 retries per request
5. If all retries fail, return error to user

### 2. **Rate Limit Error Parsing**

**Function:** `parseRateLimitError()`

**Extracts:**
- Wait time from error messages like "Please try again in 8.858s"
- Converts to milliseconds
- Adds 10% buffer for safety

**Example:**
```
Error: "Please try again in 8.858s"
→ Wait time: 9,744ms (8.858 * 1.1 * 1000, rounded up)
```

### 3. **Exponential Backoff**

**Strategy:**
- Base delay: 1 second
- Each retry: `baseDelay * 2^retryCount`
- For rate limits: Use parsed wait time instead

**Retry Schedule:**
- Attempt 1: Immediate
- Attempt 2: 1 second delay
- Attempt 3: 2 seconds delay
- Attempt 4: 4 seconds delay (max retries reached)

### 4. **User-Friendly Error Messages**

**Location:** `components/geminiService.ts` → Error handling section

**Messages:**
- **TPM Rate Limit**: "The AI service is currently handling many requests. Please wait X seconds and try again. Your request will be processed automatically."
- **Generic Rate Limit**: "Rate limit reached. Please wait X seconds and try again."
- **Insufficient Quota**: "OpenAI reports insufficient quota for this key. Please check billing/limits on your OpenAI account or use a new key."

---

## Implementation Details

### Request Queue Class

```typescript
class ApiRequestQueue {
  private queue: QueuedRequest[] = [];
  private processing = false;
  private readonly maxConcurrent = 1; // One at a time
  private readonly maxRetries = 3;
  private readonly baseDelay = 1000; // 1 second
}
```

### Queue Flow

```
User Request
    ↓
Add to Queue
    ↓
Process Sequentially
    ↓
API Call (Vercel or Direct)
    ↓
Rate Limit Error?
    ↓ Yes
Parse Wait Time
    ↓
Wait + Retry (up to 3 times)
    ↓
Success or Final Error
```

### Error Handling

1. **429 Rate Limit**:
   - Parse error message for wait time
   - Retry after wait time + buffer
   - Show user-friendly message

2. **Network Errors**:
   - Retry with exponential backoff
   - Fallback to direct API if available

3. **5xx Server Errors**:
   - Retry with exponential backoff
   - Maximum 3 retries

4. **4xx Client Errors** (except 429):
   - No retry
   - Return error immediately

---

## Server-Side Updates

### Enhanced Error Response

**Location:** `api/chat.js`

**Changes:**
- For 429 errors, include full `parsedError` object in response
- Allows client to extract wait time and other details

```javascript
if (upstream.status === 429) {
  return json(res, 429, { 
    error: message, 
    status: 429,
    parsedError: parsedError // Full error for client parsing
  });
}
```

---

## Benefits

### ✅ Automatic Retry
- Users don't need to manually retry
- Requests are automatically queued and retried

### ✅ Better User Experience
- Clear error messages with wait times
- Requests processed in order
- No duplicate requests

### ✅ Rate Limit Respect
- Sequential processing prevents overwhelming API
- Wait times are respected
- Exponential backoff for transient errors

### ✅ Scalability
- Handles multiple users gracefully
- Queue prevents API overload
- Automatic fallback to direct API

---

## Usage

### For Users:
- Simply send messages as normal
- If rate limited, wait message is shown
- Request is automatically retried
- No action needed from user

### For Developers:
- Queue is transparent
- All requests go through `apiQueue.add()`
- Errors are automatically handled
- No code changes needed in calling code

---

## Testing Scenarios

### Scenario 1: Single Rate Limit
- **Request 1**: Succeeds
- **Request 2**: Rate limited (wait 8s)
- **Result**: Request 2 automatically retried after 8s, succeeds

### Scenario 2: Multiple Concurrent Requests
- **Request 1, 2, 3**: All sent simultaneously
- **Result**: Processed sequentially, each waits for previous to complete

### Scenario 3: Multiple Rate Limits
- **Request 1**: Rate limited (wait 5s)
- **Request 2**: Rate limited (wait 10s)
- **Result**: Both retried with appropriate wait times

### Scenario 4: Network Error
- **Request**: Network failure
- **Result**: Retried with exponential backoff (1s, 2s, 4s)

---

## Future Enhancements

1. **Token Usage Estimation**:
   - Estimate tokens before sending request
   - Prevent hitting limits proactively
   - Queue requests if approaching limit

2. **Priority Queue**:
   - Prioritize certain requests (e.g., user-initiated over background)
   - Implement priority levels

3. **Distributed Queue**:
   - For multiple server instances
   - Use Redis or similar for shared queue

4. **Rate Limit Monitoring**:
   - Track API usage
   - Alert when approaching limits
   - Auto-scale or throttle

---

## Summary

The rate limiting implementation ensures:
- ✅ Automatic retry with proper wait times
- ✅ Sequential processing to respect limits
- ✅ User-friendly error messages
- ✅ Graceful handling of multiple users
- ✅ Fallback to direct API when needed

This provides a robust solution for handling OpenAI API rate limits in a multi-user environment.
