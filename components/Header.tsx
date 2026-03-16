"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/transactions", label: "Opérations" },
  { href: "/cashflow", label: "Cash-flow" },
  { href: "/banks", label: "Banques" },
  { href: "/import", label: "Import" },
  { href: "/analysis", label: "Analyse IA" },
  { href: "/settings", label: "⚙" },
];

export default function Header() {
  const pathname = usePathname();

  return (
    <div
      className="fixed top-0 left-0 right-0 z-50"
      style={{ background: "linear-gradient(135deg, #1B7A6E 0%, #145F55 100%)" }}
    >
      {/* Top bar */}
      <div className="px-6 pt-4 pb-2 flex items-center justify-between">
        <div>
          <h1 className="font-serif text-white text-2xl leading-none">Flousse</h1>
          <p className="text-white/60 text-xs mt-0.5 font-sans">247 opérations · 38 règles apprises</p>
        </div>
        <div className="text-right">
          <div className="text-white/80 text-xs">Mars 2026</div>
          <div className="text-white/60 text-xs">Patrimoine net ~479 k€</div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex px-4 gap-1 overflow-x-auto">
        {TABS.map((t) => {
          const isActive = pathname === t.href || (pathname === "/" && t.href === "/dashboard");
          return (
            <Link
              key={t.href}
              href={t.href}
              className={`px-4 py-2.5 text-xs font-semibold whitespace-nowrap transition-colors rounded-t-md ${
                isActive
                  ? "bg-[#F8F6F3] text-[#1B7A6E]"
                  : "text-white/80 hover:text-white hover:bg-white/10"
              }`}
            >
              {t.label}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
