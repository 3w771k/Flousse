"use client";
import { createContext, useContext, useState, useCallback, type ReactNode } from "react";

export interface ChatPageContext {
  page: "dashboard" | "transactions" | "patrimoine" | "import" | "settings" | "analysis";
  period?: { from: string; to: string };
  filters?: Record<string, string>;
  explorerCatId?: string;
}

interface ChatState {
  isOpen: boolean;
  openChat: () => void;
  closeChat: () => void;
  toggleChat: () => void;
  pageContext: ChatPageContext;
  setPageContext: (ctx: ChatPageContext) => void;
}

const ChatCtx = createContext<ChatState | null>(null);

export function ChatProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [pageContext, setPageContext] = useState<ChatPageContext>({ page: "dashboard" });

  const openChat = useCallback(() => setIsOpen(true), []);
  const closeChat = useCallback(() => setIsOpen(false), []);
  const toggleChat = useCallback(() => setIsOpen((v) => !v), []);

  return (
    <ChatCtx.Provider value={{ isOpen, openChat, closeChat, toggleChat, pageContext, setPageContext }}>
      {children}
    </ChatCtx.Provider>
  );
}

export function useChatContext() {
  const ctx = useContext(ChatCtx);
  if (!ctx) throw new Error("useChatContext must be used inside ChatProvider");
  return ctx;
}
