"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useEffect } from "react";
import { useChatContext } from "./ChatContext";

const NAV = [
  {
    href: "/dashboard",
    label: "Dashboard",
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <rect x="1" y="1" width="6" height="6" rx="1.5"/>
        <rect x="9" y="1" width="6" height="6" rx="1.5"/>
        <rect x="1" y="9" width="6" height="6" rx="1.5"/>
        <rect x="9" y="9" width="6" height="6" rx="1.5"/>
      </svg>
    ),
  },
  {
    href: "/transactions",
    label: "Opérations",
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M2 4h12M2 8h8M2 12h5"/>
      </svg>
    ),
  },
  {
    href: "/banks",
    label: "Patrimoine",
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M1 6l7-4 7 4"/>
        <rect x="2" y="6" width="2" height="5"/>
        <rect x="7" y="6" width="2" height="5"/>
        <rect x="12" y="6" width="2" height="5"/>
        <path d="M1 11h14"/>
        <path d="M1 13h14"/>
      </svg>
    ),
  },
  {
    href: "/import",
    label: "Import",
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M8 1v9M5 7l3 3 3-3"/>
        <path d="M2 11v2a1 1 0 001 1h10a1 1 0 001-1v-2"/>
      </svg>
    ),
  },
];

const HISTORY_NAV = {
  href: "/analysis",
  label: "Historique IA",
  icon: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="8" cy="8" r="6"/>
      <path d="M8 4v4l2.5 2.5"/>
    </svg>
  ),
};

const SETTINGS_NAV = {
  href: "/settings",
  label: "Paramètres",
  icon: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="8" cy="8" r="2.5"/>
      <path d="M8 1v1.5M8 13.5V15M1 8h1.5M13.5 8H15M2.93 2.93l1.06 1.06M12.01 12.01l1.06 1.06M2.93 13.07l1.06-1.06M12.01 3.99l1.06-1.06"/>
    </svg>
  ),
};

function NavItem({ href, label, icon }: { href: string; label: string; icon: React.ReactNode }) {
  const pathname = usePathname();
  const isActive = pathname === href;

  return (
    <Link
      href={href}
      className="flex items-center gap-3 py-2 px-3 rounded-apple-sm mr-2 transition-colors"
      style={{
        background: isActive ? "rgba(0,0,0,0.04)" : "transparent",
        color: isActive ? "#1D1D1F" : "#86868B",
        fontWeight: isActive ? 500 : 400,
        fontSize: 13,
      }}
    >
      <span style={{ color: isActive ? "#007AFF" : "#86868B", opacity: isActive ? 1 : 0.55 }}>
        {icon}
      </span>
      {label}
    </Link>
  );
}

function formatPatrimoine(n: number): string {
  if (Math.abs(n) >= 1000000) return `${(n / 1000000).toFixed(1).replace(".", ",")} M€`;
  if (Math.abs(n) >= 1000) return `${Math.round(n / 1000)} k€`;
  return `${Math.round(n)} €`;
}

export default function Sidebar() {
  const [patrimoine, setPatrimoine] = useState<{ patrimoineNet: number; totalImmo: number } | null>(null);
  const { toggleChat, isOpen: chatOpen } = useChatContext();

  useEffect(() => {
    fetch("/api/patrimoine")
      .then((r) => r.json())
      .then((data) => setPatrimoine(data))
      .catch(() => {});
  }, []);

  return (
    <div
      className="glass-sidebar fixed left-0 top-0 bottom-0 flex flex-col z-50"
      style={{
        width: 220,
        borderRight: "1px solid rgba(0,0,0,0.06)",
      }}
    >
      {/* Logo */}
      <div className="px-5 pt-6 pb-4">
        <span style={{ fontSize: 20, fontWeight: 600, color: "#1D1D1F", letterSpacing: "-0.3px" }}>
          Flousse
        </span>
      </div>

      {/* Main nav */}
      <nav className="flex flex-col gap-0.5 px-2 flex-1">
        {NAV.map((item) => (
          <NavItem key={item.href} {...item} />
        ))}

        {/* Divider */}
        <div style={{ height: 1, background: "rgba(0,0,0,0.04)", margin: "8px 18px" }} />

        {/* Chat IA button */}
        <button
          onClick={toggleChat}
          className="flex items-center gap-3 py-2 px-3 rounded-apple-sm mr-2 transition-colors"
          style={{
            background: chatOpen ? "rgba(175,82,222,0.08)" : "transparent",
            color: chatOpen ? "#AF52DE" : "#86868B",
            fontWeight: chatOpen ? 500 : 400,
            fontSize: 13,
            border: "none",
            cursor: "pointer",
            textAlign: "left",
            width: "100%",
          }}
        >
          <span style={{ color: chatOpen ? "#AF52DE" : "#86868B", opacity: chatOpen ? 1 : 0.55 }}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M8 1l1.5 3 3.5.5-2.5 2.5.5 3.5L8 9l-3 1.5.5-3.5L3 4.5l3.5-.5z"/>
            </svg>
          </span>
          Chat IA
        </button>

        <NavItem {...HISTORY_NAV} />
      </nav>

      {/* Bottom: settings + patrimoine */}
      <div className="px-2 pb-4">
        <NavItem {...SETTINGS_NAV} />

        <div className="px-3 pt-4 mt-2" style={{ borderTop: "1px solid rgba(0,0,0,0.04)" }}>
          <div style={{ fontSize: 10, fontWeight: 500, color: "#AEAEB2", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 4 }}>
            Patrimoine net
          </div>
          <div style={{ fontSize: 24, fontWeight: 300, color: "#1D1D1F", letterSpacing: "-1px", lineHeight: 1 }}>
            {patrimoine ? formatPatrimoine(patrimoine.patrimoineNet) : "..."}
          </div>
          <div style={{ fontSize: 11, color: "#86868B", marginTop: 4 }}>
            {patrimoine ? `dont ${formatPatrimoine(patrimoine.totalImmo)} immobilier` : ""}
          </div>
        </div>
      </div>
    </div>
  );
}
