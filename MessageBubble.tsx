import React from "react";
import {
  View, Text, TouchableOpacity, StyleSheet, Linking,
} from "react-native";
import Markdown from "react-native-markdown-display";
import { Colors, Fonts, Spacing, Radius } from "../constants/theme";

export interface Message {
  id: number;
  role: "ai" | "user";
  text: string;
  showConnectBtn?: boolean;
  typing?: boolean;
}

interface Props {
  msg: Message;
  onConnect?: () => void;
}

export default function MessageBubble({ msg, onConnect }: Props) {
  const isAi = msg.role === "ai";

  if (msg.typing) {
    return (
      <View style={[styles.row, styles.aiRow]}>
        <View style={styles.aiBubble}>
          <View style={styles.typingDots}>
            <View style={[styles.dot, styles.dot1]} />
            <View style={[styles.dot, styles.dot2]} />
            <View style={[styles.dot, styles.dot3]} />
          </View>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.row, isAi ? styles.aiRow : styles.userRow]}>
      <View style={isAi ? styles.aiBubble : styles.userBubble}>
        <Markdown style={markdownStyles}>{msg.text}</Markdown>

        {msg.showConnectBtn && (
          <TouchableOpacity style={styles.connectBtn} onPress={onConnect}>
            <Text style={styles.connectTxt}>⚡ Connect Wallet</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", marginVertical: 4, paddingHorizontal: 12 },
  aiRow:   { justifyContent: "flex-start" },
  userRow: { justifyContent: "flex-end" },

  aiBubble: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    borderTopLeftRadius: 4,
    padding: Spacing.md,
    maxWidth: "88%",
    borderWidth: 1,
    borderColor: Colors.border,
  },
  userBubble: {
    backgroundColor: Colors.accent + "22",
    borderRadius: Radius.md,
    borderTopRightRadius: 4,
    padding: Spacing.md,
    maxWidth: "82%",
    borderWidth: 1,
    borderColor: Colors.accent + "44",
  },

  connectBtn: {
    marginTop: 10,
    backgroundColor: Colors.accent,
    borderRadius: Radius.sm,
    paddingVertical: 9,
    paddingHorizontal: 16,
    alignSelf: "flex-start",
  },
  connectTxt: {
    color: Colors.bg,
    fontWeight: "700",
    fontSize: Fonts.sizes.sm,
  },

  // Typing animation dots
  typingDots: { flexDirection: "row", gap: 4, paddingVertical: 4, paddingHorizontal: 2 },
  dot: { width: 7, height: 7, borderRadius: 3.5, backgroundColor: Colors.text3 },
  dot1: {}, dot2: {}, dot3: {},
});

const markdownStyles: any = {
  body:   { color: Colors.text1, fontSize: Fonts.sizes.base, lineHeight: 22 },
  strong: { color: Colors.accent, fontWeight: "700" },
  em:     { color: Colors.text2, fontStyle: "italic" },
  code_inline: {
    color: Colors.accent, backgroundColor: Colors.bg,
    fontFamily: "SpaceMono", fontSize: 12,
    paddingHorizontal: 5, borderRadius: 4,
  },
  fence: {
    backgroundColor: Colors.bg,
    borderRadius: Radius.sm,
    padding: Spacing.sm,
    marginVertical: 6,
    borderWidth: 1, borderColor: Colors.border,
  },
  code_block: { color: Colors.text1, fontFamily: "SpaceMono", fontSize: 12 },
  link:    { color: Colors.blue },
  heading1:{ color: Colors.text1, fontSize: 18, fontWeight: "700", marginBottom: 4 },
  heading2:{ color: Colors.text1, fontSize: 16, fontWeight: "700", marginBottom: 3 },
  heading3:{ color: Colors.accent, fontSize: 14, fontWeight: "700" },
  bullet_list_icon: { color: Colors.text3, marginTop: 4 },
  bullet_list_content: { color: Colors.text1 },
  paragraph: { marginBottom: 4 },
  hr: { borderColor: Colors.border, marginVertical: 8 },
};
