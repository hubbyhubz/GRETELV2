// FIX: Update import path from '../App' to './types' to resolve module export errors.
import type { ScheduleItem } from './types';

const CALENDAR_API_URL = 'https://www.googleapis.com/calendar/v3/calendars/primary/events';

/**
 * Parses a time range string (e.g., "9-10am", "11am - 1pm") into start and end Date objects.
 * It's designed to be flexible and infer missing AM/PM modifiers where possible.
 * @param timeRangeString The string representing the time range.
 * @param date The date for which the times should be set.
 * @returns An object with startTime and endTime Date objects, or null if parsing fails.
 */
const parseTimeRange = (timeRangeString: string, date: Date): { startTime: Date, endTime: Date } | null => {
    // This regex aims to be flexible, capturing start/end times and their optional am/pm modifiers.
    // It handles formats like: "9-10am", "9:30-10:30 am", "9 am to 10:30 am", "11am - 1pm"
    const regex = /(\d{1,2}(?::\d{2})?)\s*(am|pm)?\s*(?:-|to)\s*(\d{1,2}(?::\d{2})?)\s*(am|pm)?/i;
    const match = timeRangeString.match(regex);
    
    if (!match) {
        console.warn(`Could not parse time range: "${timeRangeString}"`);
        return null;
    }

    let [, startStr, startMod, endStr, endMod] = match;

    // If both modifiers are missing, we can't be sure.
    if (!startMod && !endMod) {
        // A simple heuristic for a standard workday: if start is 8-11 and end is 1-5, assume AM/PM.
        const startHour = parseInt(startStr.split(':')[0], 10);
        const endHour = parseInt(endStr.split(':')[0], 10);
        if (startHour >= 8 && startHour <= 11 && endHour >= 1 && endHour <= 5) {
            startMod = 'am';
            endMod = 'pm';
        } else {
             console.warn(`Ambiguous time range (no AM/PM): "${timeRangeString}"`);
             return null;
        }
    } else if (startMod && !endMod) {
        // If only start has a modifier, apply it to the end time too.
        endMod = startMod;
    } else if (!startMod && endMod) {
        // If only end has a modifier, apply it to start, with a special check for ranges crossing noon.
        startMod = endMod;
        const startHour = parseInt(startStr.split(':')[0], 10);
        const endHour = parseInt(endStr.split(':')[0], 10);
        // Handle cases like "11-1pm" where start should be AM.
        if (endMod.toLowerCase() === 'pm' && startHour > endHour && startHour !== 12) {
            startMod = 'am';
        }
    }

    const parsePart = (timePartStr: string, modifier: string): Date => {
        let [hours, minutes] = timePartStr.split(':').map(Number);
        minutes = minutes || 0;
        
        if (modifier.toLowerCase() === 'pm' && hours < 12) {
            hours += 12;
        }
        if (modifier.toLowerCase() === 'am' && hours === 12) {
            hours = 0; // Midnight case
        }

        const eventDate = new Date(date);
        eventDate.setHours(hours, minutes, 0, 0);
        return eventDate;
    };
    
    // We can be sure startMod and endMod are defined here due to the logic above.
    const startTime = parsePart(startStr, startMod!);
    const endTime = parsePart(endStr, endMod!);
    
    if (isNaN(startTime.getTime()) || isNaN(endTime.getTime())) {
        return null;
    }
    
    // Handle overnight events by advancing the end date by one day.
    if (endTime < startTime) {
        endTime.setDate(endTime.getDate() + 1);
    }
    
    return { startTime, endTime };
};


export const batchAddEventsToCalendar = async (accessToken: string | null, scheduleItems: ScheduleItem[]): Promise<void> => {
    if (!accessToken) {
        const err = new Error("Google Calendar sync failed: Missing authentication token.");
        (err as any).status = 401; // Simulate an auth error
        throw err;
    }
    
    if (!scheduleItems || scheduleItems.length === 0) {
        return; // Nothing to do, so we return successfully.
    }

    const userTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const today = new Date();
    
    // Helper for formatting date for all-day events
    const formatDateForGoogle = (date: Date) => date.toISOString().split('T')[0]; // YYYY-MM-DD

    const eventPromises = scheduleItems.map((item) => {
        // Do not sync Google Calendar events back to Google Calendar
        if (item.isGoogleEvent) {
            return Promise.resolve(null);
        }

        let eventBody;

        if (item.time.toLowerCase().trim() === 'all day') {
            const tomorrow = new Date(today);
            tomorrow.setDate(today.getDate() + 1);
            
            eventBody = {
                summary: item.title,
                start: {
                    date: formatDateForGoogle(today),
                },
                end: {
                    date: formatDateForGoogle(tomorrow), // End date is exclusive for all-day events
                },
            };
        } else {
            const times = parseTimeRange(item.time, today);
            
            if (!times) {
                console.error(`Skipping event due to invalid time format: "${item.title}" with time "${item.time}"`);
                return Promise.resolve(null); // Don't break the whole batch for one bad item
            }

            const { startTime, endTime } = times;

            eventBody = {
                summary: item.title,
                start: {
                    dateTime: startTime.toISOString(),
                    timeZone: userTimezone,
                },
                end: {
                    dateTime: endTime.toISOString(),
                    timeZone: userTimezone,
                },
            };
        }

        return fetch(CALENDAR_API_URL, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(eventBody),
        });
    });

    // Let Promise.all handle the async operations. If any fetch fails, it will reject.
    const responses = await Promise.all(eventPromises);
    
    // Check all responses for errors AFTER all promises have settled.
    for (const res of responses) {
        if (res === null) continue; // Skip failed-to-parse items or already existing gcal events
        if (!res.ok) {
            const errorBody = await res.json();
            console.error("Google Calendar event creation failed:", errorBody);
            const err = new Error(`Failed to create event: ${errorBody.error.message}`);
            // Attach the status code to the error for better handling upstream
            (err as any).status = res.status;
            throw err;
        }
    }
};

export const getTodaysEvents = async (accessToken: string): Promise<any[]> => {
    const now = new Date();
    const timeMin = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0).toISOString();
    const timeMax = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59).toISOString();
    
    const params = new URLSearchParams({
        timeMin,
        timeMax,
        singleEvents: 'true',
        orderBy: 'startTime',
        maxResults: '20',
    });

    const response = await fetch(`${CALENDAR_API_URL}?${params.toString()}`, {
        headers: {
            'Authorization': `Bearer ${accessToken}`,
        },
    });

    if (!response.ok) {
        const errorBody = await response.json();
        console.error("Google Calendar event fetch failed:", errorBody);
        throw new Error(`Failed to fetch calendar events: ${errorBody.error.message}`);
    }

    const data: any = await response.json();
    if (data && typeof data === 'object' && Array.isArray(data.items)) {
        return data.items;
    }
    return [];
};