"use client";
import { useState } from "react";

const SparkleIcon = ({ pulse }: { pulse?: boolean }) => (
  <svg
    className={pulse ? "sparkle-pulse" : ""}
    width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="#007AFF" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
  >
    <path d="M8 1l1.5 3 3.5.5-2.5 2.5.5 3.5L8 9l-3 1.5.5-3.5L3 4.5l3.5-.5z"/>
  </svg>
);

const ExpandIcon = ({ expanded }: { expanded: boolean }) => (
  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="#86868B" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
    style={{ transition: "transform 200ms ease", transform: expanded ? "rotate(180deg)" : "rotate(0deg)" }}>
    <path d="M3 5l3 3 3-3"/>
  </svg>
);

interface AIPanelProps {
  title?: string;
  content: string;
  timestamp?: string;
  onRefresh?: () => void;
  onForceRefresh?: () => void;
  refreshLoading?: boolean;
  collapsedHeight?: number;
  hasCachedAnalysis?: boolean;
}

export default function AIPanel({
  title = "Analyse IA",
  content,
  timestamp,
  onRefresh,
  onForceRefresh,
  refreshLoading = false,
  collapsedHeight = 400,
  hasCachedAnalysis = false,
}: AIPanelProps) {
  const [expanded, setExpanded] = useState(false);
  const isLong = content.length > 800;

  return (
    <div className="rounded-apple" style={{ background: "#F5F5F7", border: "1px solid rgba(0,122,255,0.10)", overflow: "hidden" }}>
      <div className="flex items-center justify-between px-5 py-3" style={{ borderBottom: "1px solid rgba(0,0,0,0.04)" }}>
        <div className="flex items-center gap-2">
          <SparkleIcon pulse={refreshLoading} />
          <span style={{ fontSize: 13, fontWeight: 500, color: "#007AFF" }}>
            {refreshLoading ? "Analyse en cours\u2026" : title}
          </span>
        </div>
        <div className="flex items-center gap-3">
          {timestamp && (
            <span style={{ fontSize: 11, color: "#AEAEB2" }}>Généré le {timestamp}</span>
          )}
          {hasCachedAnalysis && onForceRefresh && (
            <button
              onClick={onForceRefresh}
              disabled={refreshLoading}
              style={{
                fontSize: 11, fontWeight: 500, color: "white",
                background: refreshLoading ? "#AEAEB2" : "#007AFF",
                border: "none", borderRadius: 6, padding: "4px 12px",
                cursor: refreshLoading ? "default" : "pointer",
                transition: "background 150ms ease",
              }}
            >
              {refreshLoading ? "Analyse en cours\u2026" : "Regénérer"}
            </button>
          )}
          {!hasCachedAnalysis && onRefresh && (
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
              {refreshLoading ? "Analyse en cours\u2026" : "Générer"}
            </button>
          )}
        </div>
      </div>

      <div style={{
        position: "relative",
        maxHeight: (!isLong || expanded) ? "none" : collapsedHeight,
        overflow: "hidden",
        transition: "max-height 300ms ease",
      }}>
        <div className="px-5 py-4">
          <div
            className="ai-content"
            style={{ fontSize: 12, color: "#86868B", lineHeight: 1.6 }}
            dangerouslySetInnerHTML={{ __html: content }}
          />
        </div>

        {isLong && !expanded && (
          <div style={{
            position: "absolute", bottom: 0, left: 0, right: 0, height: 80,
            background: "linear-gradient(transparent, #F5F5F7)",
            pointerEvents: "none",
          }} />
        )}
      </div>

      {isLong && (
        <button
          onClick={() => setExpanded(!expanded)}
          style={{
            width: "100%", padding: "10px 20px",
            display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
            background: "transparent", border: "none", borderTop: "1px solid rgba(0,0,0,0.04)",
            cursor: "pointer", fontSize: 12, fontWeight: 500, color: "#007AFF",
          }}
        >
          {expanded ? "Réduire" : "Voir l\u2019analyse compl\u00e8te"}
          <ExpandIcon expanded={expanded} />
        </button>
      )}
    </div>
  );
}
