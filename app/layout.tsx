import type { Metadata } from "next";
import "./globals.css";
import Sidebar from "@/components/Sidebar";
import { ChatProvider } from "@/components/ChatContext";
import ChatSlideOver from "@/components/ChatSlideOver";

export const metadata: Metadata = {
  title: "Flousse",
  description: "Suivi budgétaire familial",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body style={{ background: "#FBFBFD" }}>
        <ChatProvider>
          <div className="flex min-h-screen">
            <Sidebar />
            <main style={{ marginLeft: 220, flex: 1, minWidth: 0 }}>
              {children}
            </main>
          </div>
          <ChatSlideOver />
        </ChatProvider>
      </body>
    </html>
  );
}
