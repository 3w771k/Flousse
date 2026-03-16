"use client";

import { useEffect, useState, useCallback, useRef } from "react";

interface Insight {
  type: "alert" | "warning" | "positive" | "info";
  title: string;
  body: string;
  metric: string | null;
  link?: { label: string; href: string };
}

interface InsightsBannerProps {
  tab: string;
  from: string;
  to: string;
}

const TYPE_CONFIG = {
  alert: {
    bg: "rgba(255,59,48,0.05)",
    border: "rgba(255,59,48,0.15)",
    dot: "#FF3B30",
  },
  warning: {
    bg: "rgba(255,149,0,0.05)",
    border: "rgba(255,149,0,0.15)",
    dot: "#FF9500",
  },
  positive: {
    bg: "rgba(52,199,89,0.05)",
    border: "rgba(52,199,89,0.15)",
    dot: "#34C759",
  },
  info: {
    bg: "rgba(0,122,255,0.05)",
    border: "rgba(0,122,255,0.15)",
    dot: "#007AFF",
  },
} as const;

export default function InsightsBanner({ tab, from, to }: InsightsBannerProps) {
  const [insights, setInsights] = useState<Insight[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lastKeyRef = useRef("");

  const cacheKey = `insights-${tab}`;

  const fetchInsights = useCallback(
    async (force = false) => {
      if (!from || !to) return;
      setLoading(true);
      setError(null);
      try {
        const url = `/api/analyze?tab=${cacheKey}&from=${from}&to=${to}`;
        const res = await fetch(url);
        const data = await res.json();

        if (data.content) {
          const parsed = JSON.parse(data.content) as Insight[];
          setInsights(parsed);
          setLoading(false);
          return;
        }

        // No cache — generate
        if (!force) {
          const genRes = await fetch("/api/analyze", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ tab: cacheKey, from, to }),
          });
          const genData = await genRes.json();
          if (genData.content) {
            const parsed = JSON.parse(genData.content) as Insight[];
            setInsights(parsed);
          } else {
            setError(genData.message || "Impossible de générer les insights.");
          }
        } else {
          setInsights(null);
        }
      } catch (e) {
        console.error("[InsightsBanner] error", e);
        setError("Erreur lors du chargement des insights.");
      } finally {
        setLoading(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [cacheKey, from, to]
  );

  useEffect(() => {
    const key = `${cacheKey}|${from}|${to}`;
    if (key === lastKeyRef.current) return;
    lastKeyRef.current = key;
    setInsights(null);
    fetchInsights();
  }, [cacheKey, from, to, fetchInsights]);

  if (error) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "8px 14px",
          background: "rgba(255,59,48,0.05)",
          border: "1px solid rgba(255,59,48,0.15)",
          borderRadius: 10,
          marginBottom: 12,
        }}
      >
        <span style={{ fontSize: 12, color: "#FF3B30" }}>{error}</span>
        <button
          onClick={() => fetchInsights(true)}
          style={{
            marginLeft: "auto",
            fontSize: 11,
            color: "#007AFF",
            background: "none",
            border: "none",
            cursor: "pointer",
            padding: "2px 6px",
          }}
        >
          Réessayer
        </button>
      </div>
    );
  }

  if (loading || (!insights && !error)) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 12 }}>
        {[1, 2].map((i) => (
          <div
            key={i}
            style={{
              height: 52,
              borderRadius: 10,
              background: "rgba(0,0,0,0.04)",
              animation: "skeleton-pulse 1.5s ease-in-out infinite",
              animationDelay: `${i * 0.15}s`,
            }}
          />
        ))}
      </div>
    );
  }

  if (!insights || insights.length === 0) return null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 12 }}>
      {insights.map((insight, i) => {
        const cfg = TYPE_CONFIG[insight.type] ?? TYPE_CONFIG.info;
        return (
          <div
            key={i}
            style={{
              background: cfg.bg,
              border: `1px solid ${cfg.border}`,
              borderRadius: 10,
              padding: "10px 14px",
              display: "flex",
              flexDirection: "column",
              gap: 3,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              {/* dot */}
              <span
                style={{
                  width: 7,
                  height: 7,
                  borderRadius: "50%",
                  background: cfg.dot,
                  flexShrink: 0,
                }}
              />
              {/* title */}
              <span
                style={{
                  fontSize: 12,
                  fontWeight: 500,
                  color: "#1D1D1F",
                  flex: 1,
                  lineHeight: 1.3,
                }}
              >
                {insight.title}
              </span>
              {/* metric badge */}
              {insight.metric && (
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    color: cfg.dot,
                    background: `${cfg.dot}18`,
                    borderRadius: 6,
                    padding: "2px 7px",
                    flexShrink: 0,
                  }}
                >
                  {insight.metric}
                </span>
              )}
              {/* refresh button */}
              {i === 0 && (
                <button
                  onClick={() => {
                    setInsights(null);
                    fetch("/api/analyze", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ tab: cacheKey, from, to, force: true }),
                    })
                      .then((r) => r.json())
                      .then((d) => {
                        if (d.content) setInsights(JSON.parse(d.content));
                        else setError(d.message || "Erreur");
                      })
                      .catch(() => setError("Erreur réseau"))
                      .finally(() => setLoading(false));
                    setLoading(true);
                  }}
                  title="Actualiser"
                  style={{
                    marginLeft: 4,
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    padding: 2,
                    color: "#86868B",
                    lineHeight: 1,
                    fontSize: 13,
                    flexShrink: 0,
                  }}
                >
                  ↻
                </button>
              )}
            </div>
            {/* body */}
            <p
              style={{
                fontSize: 12,
                color: "#86868B",
                margin: 0,
                paddingLeft: 15,
                lineHeight: 1.45,
              }}
              dangerouslySetInnerHTML={{ __html: insight.body }}
            />
            {/* optional link */}
            {insight.link && (
              <a
                href={insight.link.href}
                style={{
                  fontSize: 12,
                  color: "#007AFF",
                  paddingLeft: 15,
                  textDecoration: "none",
                }}
              >
                {insight.link.label} →
              </a>
            )}
          </div>
        );
      })}
    </div>
  );
}
