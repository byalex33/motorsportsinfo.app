import type { TelemetryDriver, TelemetryLap } from "@/domain/types";
import { formatLapTime } from "@/lib/lap-time";
import { cn } from "@/lib/utils";

interface SectorTableProps {
  a: TelemetryDriver;
  b: TelemetryDriver;
  lapA: TelemetryLap | null;
  lapB: TelemetryLap | null;
}

type Row = { label: string; a: number | null; b: number | null; kind: "time" | "speed" };

/** The two compared laps side by side: lap and sector times, then the speed traps. The better value is marked. */
export function SectorTable({ a, b, lapA, lapB }: SectorTableProps) {
  const rows: Row[] = [
    { label: "Lap", a: lapA?.time ?? null, b: lapB?.time ?? null, kind: "time" },
    { label: "Sector 1", a: lapA?.sectors[0] ?? null, b: lapB?.sectors[0] ?? null, kind: "time" },
    { label: "Sector 2", a: lapA?.sectors[1] ?? null, b: lapB?.sectors[1] ?? null, kind: "time" },
    { label: "Sector 3", a: lapA?.sectors[2] ?? null, b: lapB?.sectors[2] ?? null, kind: "time" },
    { label: "Speed trap", a: lapA?.trapSpeed ?? null, b: lapB?.trapSpeed ?? null, kind: "speed" },
    { label: "Intermediate 1", a: lapA?.i1Speed ?? null, b: lapB?.i1Speed ?? null, kind: "speed" },
    { label: "Intermediate 2", a: lapA?.i2Speed ?? null, b: lapB?.i2Speed ?? null, kind: "speed" },
  ];

  return (
    <div className="max-w-2xl overflow-x-auto">
      <table className="w-full min-w-[22rem] text-sm">
        <caption className="sr-only">
          Lap {lapA?.lap ?? "—"} of {a.name} against lap {lapB?.lap ?? "—"} of {b.name}: lap and sector times in seconds, speeds in km/h. The better of each pair is marked.
        </caption>
        <thead>
          <tr className="eyebrow border-b border-border text-muted-foreground">
            <th scope="col" className="py-2 pr-3 text-left font-normal">
              <span className="sr-only">Measure</span>
            </th>
            <th scope="col" className="px-3 py-2 text-right font-normal">
              <span className="inline-flex items-center gap-1.5">
                <span aria-hidden className="inline-block h-0.5 w-3 rounded-full bg-driver-a" />
                {a.code}
              </span>
            </th>
            <th scope="col" className="px-3 py-2 text-right font-normal">
              <span className="inline-flex items-center gap-1.5">
                <span aria-hidden className="driver-b-key inline-block h-0.5 w-3 rounded-full bg-driver-b" />
                {b.code}
              </span>
            </th>
            <th scope="col" className="py-2 pl-3 text-right font-normal">
              Better by
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((row) => {
            const both = row.a !== null && row.b !== null;
            // Lower times win; higher speeds win.
            const aBetter = both && (row.kind === "time" ? row.a! < row.b! : row.a! > row.b!);
            const bBetter = both && (row.kind === "time" ? row.b! < row.a! : row.b! > row.a!);
            const fmt = (v: number | null) => (v === null ? "—" : row.kind === "speed" ? `${v}` : row.label === "Lap" ? formatLapTime(v) : v.toFixed(3));
            return (
              <tr key={row.label}>
                <th scope="row" className="py-2.5 pr-3 text-left font-normal text-muted-foreground">
                  {row.label}
                  {row.kind === "speed" && <span className="text-xs"> km/h</span>}
                </th>
                <Cell value={fmt(row.a)} better={aBetter} which="a" />
                <Cell value={fmt(row.b)} better={bBetter} which="b" />
                <td className="py-2.5 pl-3 text-right font-mono text-xs text-muted-foreground tabular">
                  {both ? margin(row, a.code, b.code) : "—"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** Who was better and by how much: "VER by 0.148", "RUS by 2 km/h", or "Level". */
function margin(row: Row, codeA: string, codeB: string): string {
  const diff = Math.abs(row.a! - row.b!);
  if (diff < (row.kind === "time" ? 0.0005 : 0.5)) return "Level";
  const aBetter = row.kind === "time" ? row.a! < row.b! : row.a! > row.b!;
  return `${aBetter ? codeA : codeB} by ${row.kind === "time" ? diff.toFixed(3) : `${diff} km/h`}`;
}

function Cell({ value, better, which }: { value: string; better: boolean; which: "a" | "b" }) {
  return (
    <td className={cn("px-3 py-2.5 text-right font-mono tabular", better ? "font-semibold text-foreground" : "text-muted-foreground")}>
      <span className="inline-flex items-center justify-end gap-1.5">
        {better && <span aria-hidden className={cn("inline-block size-1.5 rounded-full", which === "a" ? "bg-driver-a" : "bg-driver-b")} />}
        {value}
        {better && <span className="sr-only"> (better)</span>}
      </span>
    </td>
  );
}
