"use client";
import { useEffect, useState } from "react";
import { getTokenStats } from "@/lib/api";

interface Props {
  projectId: string;
  sessionTokens: number;
  sessionLimit: number;
}

interface Stats {
  total_raw: number;
  total_optimized: number;
  total_saved: number;
  savings_pct: number;
}

export default function TokenMeter({ projectId, sessionTokens, sessionLimit }: Props) {
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    if (projectId) {
      getTokenStats(projectId).then(setStats).catch(() => {});
    }
  }, [projectId, sessionTokens]);

  const usagePct = Math.min(100, (sessionTokens / sessionLimit) * 100);
  const barColor =
    usagePct > 80 ? "bg-red-500" : usagePct > 60 ? "bg-yellow-500" : "bg-emerald-500";

  return (
    <div className="px-4 py-2 border-t border-gray-800 bg-gray-900 text-xs text-gray-500 space-y-2">
      {/* Session usage */}
      <div>
        <div className="flex justify-between mb-1">
          <span>Session context</span>
          <span>
            {(sessionTokens / 1000).toFixed(1)}k / {(sessionLimit / 1000).toFixed(0)}k
          </span>
        </div>
        <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
          <div
            className={`h-full ${barColor} rounded-full transition-all`}
            style={{ width: `${usagePct}%` }}
          />
        </div>
      </div>

      {/* Project totals */}
      {stats && (
        <div className="flex justify-between text-gray-600">
          <span>Project saved: <span className="text-emerald-600">{(stats.total_saved / 1000).toFixed(1)}k tokens</span></span>
          <span>{stats.savings_pct}% avg</span>
        </div>
      )}
    </div>
  );
}
