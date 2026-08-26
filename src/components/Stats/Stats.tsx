import type { NestStats } from "src/types";
import * as S from "./Stats.styles";

interface StatsProps {
  stats: NestStats;
}

function formatTime(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

const hasRun = (stats: NestStats) => stats.iterations > 0;

export function Stats({ stats }: StatsProps) {
  const utilPct = hasRun(stats)
    ? (stats.utilization * 100).toFixed(1) + "%"
    : "—";
  const iterations = hasRun(stats) ? String(stats.iterations) : "—";
  const parts = hasRun(stats)
    ? `${stats.partsPlaced} / ${stats.partsTotal}`
    : "—";
  const sheets = hasRun(stats) ? String(stats.binsUsed) : "—";
  const elapsed = hasRun(stats) ? formatTime(stats.elapsed) : "—";

  const idbAvailable = "indexedDB" in window;

  return (
    <S.Container>
      <S.StatRow>
        <S.StatCard>
          <S.StatValue>{iterations}</S.StatValue>
          <S.StatLabel>Iterations</S.StatLabel>
          <S.Tooltip>
            Number of genetic algorithm generations completed. Each generation
            mutates and evaluates a population of part arrangements, keeping the
            best result found so far.
          </S.Tooltip>
        </S.StatCard>
        <S.StatCard>
          <S.StatValue>{elapsed}</S.StatValue>
          <S.StatLabel>Elapsed</S.StatLabel>
          <S.Tooltip>
            Total wall-clock time since the current run started. Resets when you
            click Start Nesting.
          </S.Tooltip>
        </S.StatCard>
        <S.StatCard>
          <S.StatValue>{utilPct}</S.StatValue>
          <S.StatLabel>Sheet utilization</S.StatLabel>
          {hasRun(stats) && <S.Bar $pct={stats.utilization} />}
          <S.Tooltip>
            Percentage of total sheet area covered by parts — calculated as
            combined part area ÷ combined sheet area. 100% means no material is
            wasted.
          </S.Tooltip>
        </S.StatCard>
        <S.StatCard>
          <S.StatValue>{parts}</S.StatValue>
          <S.StatLabel>Parts placed</S.StatLabel>
          <S.Tooltip>
            Parts successfully placed on sheets out of the total submitted. If
            the number is less than total, the remaining parts couldn't fit on
            any sheet at the current rotation and spacing settings.
          </S.Tooltip>
        </S.StatCard>
        <S.StatCard>
          <S.StatValue>{sheets}</S.StatValue>
          <S.StatLabel>Sheets used</S.StatLabel>
          <S.Tooltip>
            Number of sheet copies needed to place all parts in the current best
            arrangement. Fewer sheets means better material efficiency.
          </S.Tooltip>
        </S.StatCard>
      </S.StatRow>

      <S.BadgeRow>
        <S.BadgeWrap>
          <S.Badge $active={stats.gpuEnabled}>
            GPU {stats.gpuEnabled ? "✓" : "✗"}
          </S.Badge>
          <S.Tooltip>
            <strong>WebGPU acceleration</strong> — speeds up placement scoring
            using the GPU.{" "}
            {stats.gpuEnabled ? "Active." : "Not available in this browser."}
          </S.Tooltip>
        </S.BadgeWrap>
        <S.BadgeWrap>
          <S.Badge $active={stats.sharedMemEnabled}>
            SAB {stats.sharedMemEnabled ? "✓" : "✗"}
          </S.Badge>
          <S.Tooltip>
            <strong>SharedArrayBuffer</strong> — enables zero-copy data sharing
            between the main thread and web workers, reducing communication
            overhead.{" "}
            {stats.sharedMemEnabled
              ? "Active."
              : "Requires a cross-origin isolated page (COOP/COEP headers)."}
          </S.Tooltip>
        </S.BadgeWrap>
        <S.BadgeWrap>
          <S.Badge $active={idbAvailable}>
            IDB {idbAvailable ? "✓" : "✗"}
          </S.Badge>
          <S.Tooltip>
            <strong>IndexedDB cache</strong> — No-Fit Polygons (NFPs) are
            expensive to compute. This cache persists them to disk so repeated
            runs with the same shapes start instantly.{" "}
            {idbAvailable ? "Available." : "Not available in this browser."}
          </S.Tooltip>
        </S.BadgeWrap>
        <S.BadgeWrap>
          <S.Badge $active={hasRun(stats)}>
            SA {hasRun(stats) ? "✓" : "✗"}
          </S.Badge>
          <S.Tooltip>
            <strong>Simulated Annealing</strong> — after the genetic algorithm
            places parts, SA fine-tunes individual positions to squeeze out
            additional utilization. Activates once a run has produced at least
            one result.
          </S.Tooltip>
        </S.BadgeWrap>
      </S.BadgeRow>
    </S.Container>
  );
}
