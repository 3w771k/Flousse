"use client";

const SparkleIcon = () => (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="#007AFF" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M8 1l1.5 3 3.5.5-2.5 2.5.5 3.5L8 9l-3 1.5.5-3.5L3 4.5l3.5-.5z"/>
  </svg>
);

interface AIPanelProps {
  title?: string;
  content: string;
  timestamp?: string;
  defaultOpen?: boolean;
  onRefresh?: () => void;
  refreshLoading?: boolean;
}

export default function AIPanel({
  title = "Analyse IA",
  content,
  timestamp = "il y a 2 min",
  onRefresh,
  refreshLoading = false,
}: AIPanelProps) {
  return (
    <div className="rounded-apple" style={{ background: "#F5F5F7", border: "1px solid rgba(0,122,255,0.10)", overflow: "hidden" }}>
      <div className="flex items-center justify-between px-5 py-3">
        <div className="flex items-center gap-2">
          <SparkleIcon />
          <span style={{ fontSize: 13, fontWeight: 500, color: "#007AFF" }}>{title}</span>
        </div>
        <div className="flex items-center gap-3">
          <span style={{ fontSize: 11, color: "#AEAEB2" }}>Généré {timestamp}</span>
          {onRefresh && (
            <button
              onClick={onRefresh}
              disabled={refreshLoading}
              style={{
                fontSize: 11, fontWeight: 500, color: "white",
                background: refreshLoading ? "#AEAEB2" : "#007AFF",
                border: "none", borderRadius: 6, padding: "4px 12px",
                cursor: refreshLoading ? "default" : "pointer",
                transition: "background 150ms ease",
              }}
            >
              {refreshLoading ? "Analyse…" : "Analyser"}
            </button>
          )}
        </div>
      </div>
      <div className="px-5 pb-4">
        <div
          className="ai-content"
          style={{ fontSize: 12, color: "#86868B", lineHeight: 1.6 }}
          dangerouslySetInnerHTML={{ __html: content }}
        />
      </div>
    </div>
  );
}
