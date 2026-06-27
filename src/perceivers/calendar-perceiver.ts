import { BasePerceiver } from "../core/perceiver";
import { createObservation } from "../core/observation";
import * as Calendar from "expo-calendar/legacy";

interface CalendarEvent {
  id: string;
  title: string;
  startDate: Date;
  endDate: Date;
  location?: string;
  notes?: string;
}

/**
 * CalendarPerceiver — polls system calendar and emits observations for upcoming events
 */
export class CalendarPerceiver extends BasePerceiver {
  name = "calendar";
  private pollInterval: ReturnType<typeof setInterval> | null = null;
  private notifiedEvents: Set<string> = new Set();
  private reminderMinutesBefore = 15;
  private unavailableReason: string | null = null;

  async start(): Promise<void> {
    if (this.isActive) return;
    this.isActive = true;
    this.unavailableReason = null;

    try {
      const { status } = await Calendar.getCalendarPermissionsAsync();
      if (status !== "granted") {
        this.disable("Calendar permission not granted; skipping background calendar polling");
        return;
      }

      // Check immediately before installing a poller. Some emulator images expose
      // calendar permissions but do not ship a calendar provider.
      await this.checkUpcomingEvents();
    } catch (error) {
      this.disable(this.getErrorMessage(error));
      return;
    }

    // Start polling every 60 seconds
    this.pollInterval = setInterval(() => this.checkUpcomingEvents(), 60_000);
  }

  async stop(): Promise<void> {
    this.isActive = false;
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
  }

  /**
   * Check for upcoming events and emit observations
   */
  async checkNow(): Promise<number> {
    if (!this.isActive && !this.unavailableReason) {
      await this.start();
    }
    if (this.unavailableReason) {
      console.warn(`[CalendarPerceiver] Calendar unavailable: ${this.unavailableReason}`);
      return 0;
    }
    return this.checkUpcomingEvents();
  }

  private async checkUpcomingEvents(): Promise<number> {
    try {
      const calendars = await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT);
      const calendarIds = calendars.map((c) => c.id);
      if (calendarIds.length === 0) {
        return 0;
      }

      const now = new Date();
      const lookAhead = new Date(now.getTime() + this.reminderMinutesBefore * 60 * 1000);

      const events = await Calendar.getEventsAsync(calendarIds, now, lookAhead);
      let emitted = 0;

      for (const event of events) {
        const eventKey = `${event.id}_${event.startDate}`;

        if (this.notifiedEvents.has(eventKey)) continue;

        // This event is starting soon and we haven't notified yet
        this.notifiedEvents.add(eventKey);

        const minutesUntil = Math.round(
          (new Date(event.startDate).getTime() - now.getTime()) / 60000
        );

        const content = this.buildEventDescription(event as unknown as CalendarEvent, minutesUntil);

        const observation = createObservation(content, "calendar", "calendar");
        this.emit(observation);
        emitted += 1;
      }

      // Cleanup old notified events (older than 1 hour)
      this.cleanupOldNotifications();
      return emitted;
    } catch (error) {
      if (this.isCalendarUnavailableError(error)) {
        this.disable(this.getErrorMessage(error));
        return 0;
      }

      console.warn("[CalendarPerceiver] Error checking events:", error);
      return 0;
    }
  }

  private disable(reason: string): void {
    this.unavailableReason = reason;
    this.isActive = false;
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
    console.warn(`[CalendarPerceiver] Calendar unavailable: ${reason}`);
  }

  private isCalendarUnavailableError(error: unknown): boolean {
    return this.getErrorMessage(error).includes("E_CALENDARS_NOT_FOUND");
  }

  private getErrorMessage(error: unknown): string {
    if (error instanceof Error) {
      const code = "code" in error ? String(error.code) : "";
      return [code, error.message].filter(Boolean).join(": ");
    }
    return String(error);
  }

  private buildEventDescription(event: CalendarEvent, minutesUntil: number): string {
    let desc = `日历事件：「${event.title}」将在 ${minutesUntil} 分钟后开始`;
    if (event.location) desc += `，地点：${event.location}`;
    return desc;
  }

  private cleanupOldNotifications(): void {
    // Keep set manageable — clear events older than 1 hour
    if (this.notifiedEvents.size > 100) {
      this.notifiedEvents.clear();
    }
  }
}

export const calendarPerceiver = new CalendarPerceiver();
