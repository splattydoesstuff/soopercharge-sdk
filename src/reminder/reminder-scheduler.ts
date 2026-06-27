import { Observation } from "../core/observation";
import { llmService, memoryService } from "../server-api/client";
import { ttsService } from "../voice/tts";
import { sendImmediateNotification } from "./notification";
import { useConversationStore } from "../store/conversation";
import { useUserStore } from "../store/user";

export interface ReminderResult {
  response: string;
  notificationId: string;
  spoke: boolean;
  ttsError?: string;
}

/**
 * ReminderScheduler — handles calendar observations and triggers reminders
 */
export class ReminderScheduler {
  /**
   * Process a calendar observation and decide whether to remind
   */
  async processCalendarObservation(observation: Observation): Promise<ReminderResult | null> {
    const conversationStore = useConversationStore.getState();
    const userStore = useUserStore.getState();

    try {
      // Search for related memories
      const relatedFacts = await memoryService.search(observation.content);

      // Generate reminder response
      const response = await llmService.generateResponse("remind", {
        facts: relatedFacts,
        transcript: observation.content,
      });

      // Add to conversation
      conversationStore.addMessage({ role: "assistant", content: response });

      // Send notification
      const notificationId = await sendImmediateNotification("LOOI 提醒", response);

      // TTS if enabled
      let spoke = false;
      let ttsError: string | undefined;
      if (userStore.preferences.ttsEnabled) {
        try {
          userStore.setVoiceState("speaking");
          await ttsService.speak({ text: response });
          spoke = true;
        } catch (error) {
          ttsError = error instanceof Error ? error.message : String(error);
          console.error("[ReminderScheduler] TTS failed:", error);
        } finally {
          userStore.setVoiceState("sleeping");
        }
      }

      console.log(
        `[ReminderScheduler] Calendar reminder sent: notification=${notificationId} spoke=${spoke}`
      );
      return { response, notificationId, spoke, ttsError };
    } catch (error) {
      console.error("[ReminderScheduler] Error processing calendar:", error);
      return null;
    }
  }
}

export const reminderScheduler = new ReminderScheduler();
