interface Segment { value: number; color: string; label: string; }

interface DonutProps {
  segments: Segment[];
  size?: number;
  strokeWidth?: number;
  centerLabel?: string;
  centerSub?: string;
}

export default function DonutChart({ segments, size = 140, strokeWidth = 10, centerLabel, centerSub }: DonutProps) {
  const r = (size - strokeWidth) / 2;
  const cx = size / 2;
  const cy = size / 2;
  const circumference = 2 * Math.PI * r;

  const total = segments.reduce((s, seg) => s + seg.value, 0);
  if (total === 0) return null;

  let offset = 0;

  return (
    <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
      {/* Track */}
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="rgba(0,0,0,0.04)" strokeWidth={strokeWidth} />

      {segments.map((seg, i) => {
        const dash = (seg.value / total) * circumference;
        const gap = circumference - dash;
        const el = (
          <circle
            key={i}
            cx={cx}
            cy={cy}
            r={r}
            fill="none"
            stroke={seg.color}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={`${dash - 2} ${gap + 2}`}
            strokeDashoffset={-offset * (circumference / total) + circumference * 0.25}
            style={{ transition: "stroke-dasharray 400ms ease-out" }}
          />
        );
        offset += seg.value;
        return el;
      })}

      {(centerLabel || centerSub) && (
        <g style={{ transform: `rotate(90deg)`, transformOrigin: "50% 50%" }}>
          {centerLabel && (
            <text x={cx} y={cy - (centerSub ? 6 : 0)} textAnchor="middle" dominantBaseline="middle"
              style={{ fontSize: 18, fontWeight: 300, fill: "#1D1D1F", letterSpacing: "-0.5px" }}>
              {centerLabel}
            </text>
          )}
          {centerSub && (
            <text x={cx} y={cy + 16} textAnchor="middle" dominantBaseline="middle"
              style={{ fontSize: 10, fontWeight: 400, fill: "#86868B" }}>
              {centerSub}
            </text>
          )}
        </g>
      )}
    </svg>
  );
}
