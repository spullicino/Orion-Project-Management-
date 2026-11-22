/**
 * Presentational SVG pieces of the Gantt chart. No hooks, no browser APIs:
 * used on screen, on the public share page and rendered to a string for exports.
 */
import { BAR_HEIGHT, ellipsize, HEADER_HEIGHT, LABEL_CHAR_W, type GanttLayout, type Row, type TaskRow } from "@/lib/gantt/layout";

export const FONT = "Inter, Helvetica, Arial, sans-serif";
export const C = {
  text: "#0f172a",
  muted: "#64748b",
  grid: "#e2e8f0",
  weekend: "#f1f5f9",
  header: "#f8fafc",
  today: "#dc2626",
  dep: "#64748b",
  depLate: "#dc2626",
  done: "#15803d",
};

export type BarOverride = { taskId: string; x: number; width: number } | null;

export type TimelineHandlers = {
  onBarPointerDown?: (e: React.PointerEvent, row: TaskRow, mode: "move" | "start" | "end") => void;
  onRowClick?: (taskId: string) => void;
  onMilestoneClick?: (id: string) => void;
  onMilestonePointerDown?: (e: React.PointerEvent, id: string) => void;
  milestoneOverride?: { id: string; x: number } | null;
};

/** Left column: group names and task names (and owners, when shown). */
export function GanttLabels({
  layout,
  width,
  rows = layout.rows,
  showOwners,
  onRowClick,
  dark,
  fontFamily = FONT,
}: {
  layout: GanttLayout;
  width: number;
  rows?: Row[];
  showOwners?: boolean;
  onRowClick?: (taskId: string) => void;
  dark?: boolean;
  fontFamily?: string;
}) {
  // Room on the right for the % complete column.
  const PCT_W = 46;
  const maxChars = Math.floor((width - 28 - PCT_W) / 7.2);
  const text = dark ? "#e2e8f0" : C.text;
  const pctX = width - 12;
  const pctOf = (t: { progress: number; completed_at: string | null }) => (t.completed_at ? 100 : Math.round(t.progress));
  // A group's % = the average of its tasks (as in a programme of works).
  const groupPct = new Map<string, number>();
  {
    const sums = new Map<string, { n: number; total: number }>();
    for (const r of rows) {
      if (r.kind !== "task") continue;
      const s = sums.get(r.task.group_id) ?? { n: 0, total: 0 };
      s.n += 1;
      s.total += pctOf(r.task);
      sums.set(r.task.group_id, s);
    }
    for (const [g, s] of sums) groupPct.set(g, Math.round(s.total / s.n));
  }
  return (
    <g fontFamily={fontFamily}>
      <rect x={0} y={0} width={width} height={HEADER_HEIGHT} fill={dark ? "#1e293b" : C.header} />
      <text x={14} y={HEADER_HEIGHT - 16} fontSize={11} fontWeight={700} fill={C.muted} letterSpacing={0.6}>
        TASK
      </text>
      <text x={pctX} y={HEADER_HEIGHT - 16} fontSize={11} fontWeight={700} fill={C.muted} textAnchor="end">
        %
      </text>
      <line x1={0} x2={width} y1={HEADER_HEIGHT} y2={HEADER_HEIGHT} stroke={C.grid} />
      {rows.map((r) => {
        if (r.kind === "milestones")
          return (
            <text key="ms" x={14} y={r.y + r.height / 2 + 4} fontSize={12} fontWeight={700} fill={C.muted}>
              Milestones
            </text>
          );
        if (r.kind === "group")
          return (
            <g key={`g-${r.group.id}`}>
              <rect x={0} y={r.y} width={width} height={r.height} fill={dark ? "#1e293b" : C.header} />
              <rect x={0} y={r.y} width={4} height={r.height} fill={r.group.color} />
              <text x={14} y={r.y + r.height / 2 + 5} fontSize={13} fontWeight={700} fill={text}>
                {ellipsize(r.group.name, maxChars)}
              </text>
              {groupPct.has(r.group.id) && (
                <text x={pctX} y={r.y + r.height / 2 + 5} fontSize={12} fontWeight={700} fill={text} textAnchor="end">
                  {groupPct.get(r.group.id)}%
                </text>
              )}
            </g>
          );
        const owners = showOwners && r.task.owners?.length ? r.task.owners.join(", ") : "";
        return (
          <g
            key={`t-${r.task.id}`}
            onClick={onRowClick ? () => onRowClick(r.task.id) : undefined}
            style={onRowClick ? { cursor: "pointer" } : undefined}
          >
            <rect x={0} y={r.y} width={width} height={r.height} fill="transparent" />
            <text
              x={14}
              y={r.y + (owners ? 17 : r.height / 2 + 5)}
              fontSize={13}
              fill={r.task.completed_at ? C.muted : text}
              textDecoration={r.task.completed_at ? "line-through" : undefined}
            >
              {ellipsize(r.task.title, maxChars)}
            </text>
            <text
              x={pctX}
              y={r.y + r.height / 2 + 5}
              fontSize={12}
              fontWeight={pctOf(r.task) === 100 ? 700 : undefined}
              fill={pctOf(r.task) === 100 ? C.done : pctOf(r.task) > 0 ? text : C.muted}
              textAnchor="end"
            >
              {pctOf(r.task)}%
            </text>
            {owners && (
              <text x={14} y={r.y + 32} fontSize={10.5} fill={C.muted}>
                {ellipsize(owners, maxChars + 4)}
              </text>
            )}
            <line x1={0} x2={width} y1={r.y + r.height} y2={r.y + r.height} stroke={C.grid} />
          </g>
        );
      })}
    </g>
  );
}

/** Right side: date header, grid, bars, dependency arrows, milestones and the today line. */
export function GanttTimeline({
  layout,
  rows = layout.rows,
  height = layout.height,
  override,
  handlers = {},
  dark,
  fontFamily = FONT,
}: {
  layout: GanttLayout;
  rows?: Row[];
  height?: number;
  override?: BarOverride;
  handlers?: TimelineHandlers;
  dark?: boolean;
  fontFamily?: string;
}) {
  const { width } = layout;
  const visibleIds = new Set(rows.filter((r) => r.kind === "task").map((r) => (r as TaskRow).task.id));
  const headerFill = dark ? "#1e293b" : C.header;
  const textColor = dark ? "#e2e8f0" : C.text;
  const msRow = rows.find((r) => r.kind === "milestones");
  return (
    <g fontFamily={fontFamily}>
      <defs>
        <marker id="gantt-arrow" viewBox="0 0 8 8" refX={7} refY={4} markerWidth={7} markerHeight={7} orient="auto">
          <path d="M0,0 L8,4 L0,8 z" fill={C.dep} />
        </marker>
        <marker id="gantt-arrow-late" viewBox="0 0 8 8" refX={7} refY={4} markerWidth={7} markerHeight={7} orient="auto">
          <path d="M0,0 L8,4 L0,8 z" fill={C.depLate} />
        </marker>
      </defs>

      {/* weekend shading + vertical grid */}
      {layout.bottomTicks.map((t, i) => (
        <g key={`grid-${i}`}>
          {t.weekend && <rect x={t.x} y={HEADER_HEIGHT} width={t.width} height={height - HEADER_HEIGHT} fill={dark ? "#0f172a" : C.weekend} />}
          <line x1={t.x} x2={t.x} y1={HEADER_HEIGHT} y2={height} stroke={C.grid} strokeWidth={0.6} />
        </g>
      ))}

      {/* header */}
      <rect x={0} y={0} width={width} height={HEADER_HEIGHT} fill={headerFill} />
      {layout.topTicks.map((t, i) => (
        <g key={`top-${i}`}>
          <line x1={t.x} x2={t.x} y1={0} y2={26} stroke={C.grid} />
          <text x={t.x + 6} y={17} fontSize={11.5} fontWeight={700} fill={textColor}>
            {t.width > 40 ? t.label : ""}
          </text>
        </g>
      ))}
      {layout.bottomTicks.map((t, i) => (
        <text key={`bot-${i}`} x={t.x + t.width / 2} y={42} fontSize={10.5} fill={t.weekend ? "#94a3b8" : C.muted} textAnchor="middle">
          {t.width >= 14 ? t.label : ""}
        </text>
      ))}
      <line x1={0} x2={width} y1={26} y2={26} stroke={C.grid} />
      <line x1={0} x2={width} y1={HEADER_HEIGHT} y2={HEADER_HEIGHT} stroke={C.grid} />

      {/* row backgrounds */}
      {rows.map((r) =>
        r.kind === "group" ? (
          <rect key={`gb-${r.group.id}`} x={0} y={r.y} width={width} height={r.height} fill={headerFill} opacity={0.7} />
        ) : r.kind === "task" ? (
          <g key={`tb-${r.task.id}`}>
            <rect
              x={0}
              y={r.y}
              width={width}
              height={r.height}
              fill="transparent"
              onClick={handlers.onRowClick && !r.bar ? () => handlers.onRowClick!(r.task.id) : undefined}
            />
            <line x1={0} x2={width} y1={r.y + r.height} y2={r.y + r.height} stroke={C.grid} strokeWidth={0.6} />
          </g>
        ) : null,
      )}

      {/* milestone guide lines */}
      {layout.milestones.map((m) => {
        const x = handlers.milestoneOverride?.id === m.id ? handlers.milestoneOverride.x : m.x;
        return <line key={`ml-${m.id}`} x1={x} x2={x} y1={HEADER_HEIGHT} y2={height} stroke={m.color} strokeWidth={1} strokeDasharray="4 4" opacity={0.5} />;
      })}

      {/* dependency arrows */}
      {layout.deps
        .filter((d) => visibleIds.has(d.from) && visibleIds.has(d.to))
        .map((d) => (
          <path
            key={`dep-${d.from}-${d.to}`}
            d={d.d}
            fill="none"
            stroke={d.late ? C.depLate : C.dep}
            strokeWidth={1.4}
            markerEnd={`url(#${d.late ? "gantt-arrow-late" : "gantt-arrow"})`}
            opacity={override ? 0.35 : 0.9}
          />
        ))}

      {/* bars */}
      {rows.map((r) => {
        if (r.kind !== "task" || !r.bar) return null;
        const o = override?.taskId === r.task.id ? override : null;
        const x = o ? o.x : r.bar.x;
        const w = o ? o.width : r.bar.width;
        const y = r.y + (r.height - BAR_HEIGHT) / 2;
        const done = !!r.task.completed_at;
        // The name goes inside the bar if it fits, otherwise in full just to the right of it.
        const inside = r.task.title.length * LABEL_CHAR_W + 16 <= w;
        const draggable = !!handlers.onBarPointerDown;
        return (
          <g key={`bar-${r.task.id}`} opacity={o ? 0.85 : 1}>
            <rect
              x={x + 1}
              y={y}
              width={Math.max(w - 2, 4)}
              height={BAR_HEIGHT}
              rx={6}
              fill={r.color}
              opacity={done ? 0.55 : 0.35}
              style={draggable ? { cursor: "grab", touchAction: "pan-y" } : handlers.onRowClick ? { cursor: "pointer" } : undefined}
              onPointerDown={draggable ? (e) => handlers.onBarPointerDown!(e, r, "move") : undefined}
              onClick={!draggable && handlers.onRowClick ? () => handlers.onRowClick!(r.task.id) : undefined}
            />
            {/* progress fill */}
            <rect x={x + 1} y={y} width={Math.max((Math.max(w - 2, 4) * r.task.progress) / 100, 0)} height={BAR_HEIGHT} rx={6} fill={r.color} pointerEvents="none" />
            {inside ? (
              <text x={x + 8} y={y + 15} fontSize={11} fontWeight={700} fill={textColor} pointerEvents="none">
                {r.task.title}
              </text>
            ) : (
              // Regular weight on purpose: PDFs only have regular and bold Helvetica (anything else turns into Times).
              <text x={x + w + 14} y={y + 15} fontSize={11} fill={textColor} pointerEvents="none">
                {ellipsize(r.task.title, 48)}
              </text>
            )}
            {draggable && (
              <>
                <rect x={x - 2} y={y} width={8} height={BAR_HEIGHT} fill="transparent" style={{ cursor: "ew-resize" }} onPointerDown={(e) => handlers.onBarPointerDown!(e, r, "start")} />
                <rect x={x + w - 6} y={y} width={8} height={BAR_HEIGHT} fill="transparent" style={{ cursor: "ew-resize" }} onPointerDown={(e) => handlers.onBarPointerDown!(e, r, "end")} />
              </>
            )}
          </g>
        );
      })}

      {/* milestones */}
      {msRow &&
        layout.milestones.map((m) => {
          const x = handlers.milestoneOverride?.id === m.id ? handlers.milestoneOverride.x : m.x;
          const cy = msRow.y + msRow.height / 2;
          const s = 9;
          return (
            <g
              key={`ms-${m.id}`}
              style={handlers.onMilestoneClick || handlers.onMilestonePointerDown ? { cursor: "pointer" } : undefined}
              onPointerDown={handlers.onMilestonePointerDown ? (e) => handlers.onMilestonePointerDown!(e, m.id) : undefined}
              onClick={handlers.onMilestoneClick && !handlers.onMilestonePointerDown ? () => handlers.onMilestoneClick!(m.id) : undefined}
            >
              <title>{m.title}</title>
              <path d={`M${x},${cy - s} L${x + s},${cy} L${x},${cy + s} L${x - s},${cy} Z`} fill={m.color} stroke="#ffffff" strokeWidth={1.5} />
            </g>
          );
        })}
      {msRow &&
        layout.milestoneLabels.map((l) => {
          const cy = msRow.y + msRow.height / 2;
          const two = layout.milestoneLabels.some((x) => x.line === 1);
          const dragged = handlers.milestoneOverride && l.ids.includes(handlers.milestoneOverride.id) ? layout.milestones.find((m) => m.id === handlers.milestoneOverride!.id) : null;
          const dx = dragged ? handlers.milestoneOverride!.x - dragged.x : 0;
          return (
            <text
              key={`msl-${l.ids.join("-")}`}
              x={l.x + dx}
              y={two ? (l.line === 0 ? msRow.y + 14 : msRow.y + msRow.height - 6) : cy + 4}
              fontSize={11}
              fontWeight={700}
              fill={textColor}
              textAnchor={l.anchor}
              pointerEvents="none"
            >
              <title>{l.full}</title>
              {l.text}
            </text>
          );
        })}

      {/* today */}
      {layout.todayX !== null && (
        <g pointerEvents="none">
          <line x1={layout.todayX} x2={layout.todayX} y1={26} y2={height} stroke={C.today} strokeWidth={1.5} />
          <rect x={layout.todayX - 20} y={28} width={40} height={14} rx={7} fill={C.today} />
          <text x={layout.todayX} y={38.5} fontSize={9} fontWeight={700} fill="#ffffff" textAnchor="middle">
            TODAY
          </text>
        </g>
      )}
    </g>
  );
}
