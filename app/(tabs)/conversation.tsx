import { useCallback, useEffect, useRef } from "react";
import {
  FlatList,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { LazyCameraFrameFeeder } from "@/src/ui/LazyCameraFrameFeeder";
import { ChatBubble } from "@/src/ui/ChatBubble";
import { DeviceShell } from "@/src/ui/DeviceShell";
import { VoiceButton } from "@/src/ui/VoiceButton";
import { looiStatusLabels, looiTheme } from "@/src/ui/looi-theme";
import { ChatMessage, useConversationStore } from "@/src/store/conversation";
import { useUserStore } from "@/src/store/user";

export default function ConversationScreen() {
  const router = useRouter();
  const messages = useConversationStore((state) => state.messages);
  const isProcessing = useConversationStore((state) => state.isProcessing);
  const isListening = useConversationStore((state) => state.isListening);
  const currentTranscript = useConversationStore((state) => state.currentTranscript);
  const voiceState = useUserStore((state) => state.voiceState);
  const flatListRef = useRef<FlatList<ChatMessage>>(null);
  const renderMessage = useCallback(
    ({ item }: { item: ChatMessage }) => <ChatBubble message={item} isDark />,
    []
  );

  useEffect(() => {
    if (messages.length === 0) return;
    const timer = setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
    return () => clearTimeout(timer);
  }, [messages.length]);

  return (
    <DeviceShell
      title="对话"
      eyebrow="VOICE SPACE"
      scroll={false}
      onReturnHome={() => router.replace("/")}
    >
      <KeyboardAvoidingView
        style={styles.conversation}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <LazyCameraFrameFeeder />
        <View style={styles.signalHeader}>
          <View>
            <Text style={styles.signalLabel}>当前链路</Text>
            <Text style={styles.signalValue}>
              {isListening ? "正在收音" : isProcessing ? "正在推理" : looiStatusLabels[voiceState]}
            </Text>
          </View>
          <View style={styles.signalBars}>
            {[0, 1, 2, 3].map((index) => (
              <View
                key={index}
                style={[
                  styles.signalBar,
                  (isListening || isProcessing) && {
                    height: 18 + index * 5,
                    opacity: 0.9,
                  },
                ]}
              />
            ))}
          </View>
        </View>

        <FlatList
          ref={flatListRef}
          data={messages}
          style={styles.timeline}
          keyExtractor={(item) => item.id}
          renderItem={renderMessage}
          contentContainerStyle={[
            styles.timelineContent,
            messages.length === 0 && styles.timelineEmpty,
          ]}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.emptyConversation}>
              <Text style={styles.emptyTitle}>安静待命</Text>
              <Text style={styles.emptyBody}>
                {currentTranscript || "按住控制器说话，LOOI 会在这里留下必要的回应。"}
              </Text>
            </View>
          }
        />

        <View style={styles.voiceDock}>
          <VoiceButton />
        </View>
      </KeyboardAvoidingView>
    </DeviceShell>
  );
}

const styles = StyleSheet.create({
  conversation: {
    flex: 1,
  },
  signalHeader: {
    minHeight: 74,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: looiTheme.line,
    backgroundColor: looiTheme.surface,
    paddingHorizontal: 18,
    paddingVertical: 12,
    marginBottom: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  signalLabel: {
    color: looiTheme.muted,
    fontSize: 12,
    marginBottom: 4,
  },
  signalValue: {
    color: looiTheme.text,
    fontSize: 20,
    fontWeight: "700",
  },
  signalBars: {
    height: 40,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  signalBar: {
    width: 5,
    height: 12,
    borderRadius: 999,
    backgroundColor: looiTheme.cyan,
    opacity: 0.36,
  },
  timeline: {
    flex: 1,
  },
  timelineContent: {
    paddingBottom: 14,
    gap: 12,
  },
  timelineEmpty: {
    flexGrow: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyConversation: {
    maxWidth: 420,
    alignItems: "center",
    gap: 8,
  },
  emptyTitle: {
    color: looiTheme.text,
    fontSize: 24,
    fontWeight: "700",
  },
  emptyBody: {
    color: looiTheme.muted,
    fontSize: 15,
    lineHeight: 22,
    textAlign: "center",
  },
  voiceDock: {
    minHeight: 112,
    alignItems: "center",
    justifyContent: "center",
    borderTopWidth: 1,
    borderTopColor: looiTheme.line,
  },
});
