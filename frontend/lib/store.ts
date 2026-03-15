import { create } from "zustand";
import { getHistory, saveHistoryItem } from "./api";

export interface Project {
  id: string;
  name: string;
  description?: string;
  system_context?: string;
  model: string;
  session_count: number;
  created_at: string;
  updated_at: string;
}

export interface OptimizeResult {
  optimized: string;
  technique: string;
  rationale: string;
  raw_tokens: number;
  optimized_tokens: number;
  tokens_saved: number;
  savings_pct: number;
  skipped?: boolean;
  mistakes_found: string[];
  prompt_type: string;
  ai_received: {
    system_prompt: string;
    technique_hint: string;
    chain_context: string | null;
    project_context: string | null;
    user_message: string;
  };
}

export interface HistoryItem {
  id: string;
  raw: string;
  optimized: string;
  technique: string;
  savedTokens: number;
  savingsPct: number;
  createdAt: string;
}

interface AppState {
  // Projects
  projects: Project[];
  activeProject: Project | null;
  setProjects: (p: Project[]) => void;
  setActiveProject: (p: Project | null) => void;

  // Optimizer
  rawInput: string;
  optimizeResult: OptimizeResult | null;
  isOptimizing: boolean;
  setRawInput: (s: string) => void;
  setOptimizeResult: (r: OptimizeResult | null) => void;
  setIsOptimizing: (v: boolean) => void;

  // History (backend-persisted, localStorage fallback)
  history: HistoryItem[];
  addHistory: (item: HistoryItem) => void;
  loadHistory: (projectId: string) => void;
  clearHistory: (projectId: string) => void;
}

// Map backend response to frontend HistoryItem shape
function mapBackendItem(b: {
  id: string; raw: string; optimized: string;
  technique: string; tokens_saved: number; savings_pct: number; created_at: string;
}): HistoryItem {
  return {
    id: b.id,
    raw: b.raw,
    optimized: b.optimized,
    technique: b.technique,
    savedTokens: b.tokens_saved,
    savingsPct: b.savings_pct,
    createdAt: b.created_at,
  };
}

export const useStore = create<AppState>((set, get) => ({
  projects: [],
  activeProject: null,
  setProjects: (projects) => set({ projects }),
  setActiveProject: (activeProject) => set({ activeProject }),

  rawInput: "",
  optimizeResult: null,
  isOptimizing: false,
  setRawInput: (rawInput) => set({ rawInput }),
  setOptimizeResult: (optimizeResult) => set({ optimizeResult }),
  setIsOptimizing: (isOptimizing) => set({ isOptimizing }),

  history: [],

  addHistory: (item) => {
    const projectId = get().activeProject?.id;
    if (!projectId) return;

    // Immediate local update
    const existing = get().history;
    const updated = [item, ...existing].slice(0, 20);
    set({ history: updated });

    // localStorage fallback (survives backend being down)
    const key = `optimizer-history-${projectId}`;
    localStorage.setItem(key, JSON.stringify(updated));

    // Persist to backend (fire-and-forget)
    saveHistoryItem(projectId, {
      raw: item.raw,
      optimized: item.optimized,
      technique: item.technique,
      tokens_saved: item.savedTokens,
      savings_pct: item.savingsPct,
    }).catch(() => {
      // Backend unavailable — localStorage copy already saved above
    });
  },

  loadHistory: (projectId) => {
    const key = `optimizer-history-${projectId}`;

    // Optimistically load from localStorage first (instant)
    const cached: HistoryItem[] = JSON.parse(localStorage.getItem(key) || "[]");
    if (cached.length > 0) set({ history: cached });

    // Then load from backend (authoritative — survives browser clears)
    getHistory(projectId, 20)
      .then((items: Parameters<typeof mapBackendItem>[0][]) => {
        const mapped = items.map(mapBackendItem);
        set({ history: mapped });
        // Keep localStorage in sync
        localStorage.setItem(key, JSON.stringify(mapped));
      })
      .catch(() => {
        // Backend down — keep whatever localStorage had
      });
  },

  clearHistory: (projectId) => {
    localStorage.removeItem(`optimizer-history-${projectId}`);
    set({ history: [] });
  },
}));
