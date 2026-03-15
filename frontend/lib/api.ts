import axios from "axios";

const BASE = "http://localhost:8000";

export const api = axios.create({ baseURL: BASE });

// ── Projects ──────────────────────────────────────────────────────────────────

export const getProjects = () => api.get("/projects/").then((r) => r.data);
export const getProject = (id: string) => api.get(`/projects/${id}`).then((r) => r.data);
export const createProject = (data: {
  name: string;
  description?: string;
  system_context?: string;
  model?: string;
}) => api.post("/projects/", data).then((r) => r.data);
export const updateProject = (id: string, data: object) =>
  api.patch(`/projects/${id}`, data).then((r) => r.data);
export const deleteProject = (id: string) => api.delete(`/projects/${id}`);

// ── Sessions ──────────────────────────────────────────────────────────────────

export const getSessions = (projectId: string) =>
  api.get(`/projects/${projectId}/sessions/`).then((r) => r.data);
export const createSession = (projectId: string, title?: string) =>
  api
    .post(`/projects/${projectId}/sessions/`, { title: title || null })
    .then((r) => r.data);
export const deleteSession = (projectId: string, sessionId: string) =>
  api.delete(`/projects/${projectId}/sessions/${sessionId}`);

// ── Messages ──────────────────────────────────────────────────────────────────

export const getMessages = (projectId: string, sessionId: string) =>
  api
    .get(`/projects/${projectId}/sessions/${sessionId}/messages`)
    .then((r) => r.data);

export const streamMessage = (
  projectId: string,
  sessionId: string,
  rawInput: string,
  useOptimized: boolean,
  onChunk: (text: string) => void,
  onDone: (data: object) => void,
  onStart: (data: object) => void,
) => {
  const url = `${BASE}/projects/${projectId}/sessions/${sessionId}/messages/stream`;
  fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ raw_input: rawInput, use_optimized: useOptimized }),
  }).then(async (res) => {
    if (!res.body) return;
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";
      let event = "";
      for (const line of lines) {
        if (line.startsWith("event: ")) event = line.slice(7).trim();
        if (line.startsWith("data: ")) {
          const data = JSON.parse(line.slice(6));
          if (event === "chunk") onChunk(data.text);
          if (event === "done") onDone(data);
          if (event === "start") onStart(data);
        }
      }
    }
  });
};

// ── Optimize ──────────────────────────────────────────────────────────────────

export const optimizePrompt = (
  rawInput: string,
  projectId?: string,
  previousPrompts?: Array<{ raw: string; optimized: string }>,
  temperature?: number,
  tone?: string,
  llmResponse?: string,
) =>
  api
    .post("/optimize/", {
      raw_input: rawInput,
      project_id: projectId,
      previous_prompts: previousPrompts?.length ? previousPrompts : undefined,
      temperature,
      tone: tone && tone !== "auto" ? tone : undefined,
      llm_response: llmResponse || undefined,
    })
    .then((r) => r.data);

export const runPrompt = (prompt: string, projectId?: string, temperature = 0.7) =>
  api.post("/optimize/run", { prompt, project_id: projectId, temperature }).then((r) => r.data);

// ── Context / Stats ───────────────────────────────────────────────────────────

export const getTokenStats = (projectId: string) =>
  api.get(`/context/stats/${projectId}`).then((r) => r.data);

export const summarizeSession = (sessionId: string) =>
  api.post(`/context/summarize/${sessionId}`).then((r) => r.data);

// ── History ───────────────────────────────────────────────────────────────────

export const getHistory = (projectId: string, limit = 20) =>
  api.get(`/history/${projectId}`, { params: { limit } }).then((r) => r.data);

export const saveHistoryItem = (
  projectId: string,
  item: { raw: string; optimized: string; technique: string; tokens_saved: number; savings_pct: number },
) => api.post(`/history/${projectId}`, item).then((r) => r.data);

export const deleteHistoryItem = (projectId: string, itemId: string) =>
  api.delete(`/history/${projectId}/${itemId}`);

// ── Templates ─────────────────────────────────────────────────────────────────

export const getTemplates = (projectId?: string) =>
  api
    .get("/templates/", { params: projectId ? { project_id: projectId } : {} })
    .then((r) => r.data);
export const createTemplate = (data: object) =>
  api.post("/templates/", data).then((r) => r.data);
export const useTemplate = (templateId: string) =>
  api.post(`/templates/${templateId}/use`).then((r) => r.data);
export const deleteTemplate = (templateId: string) =>
  api.delete(`/templates/${templateId}`);
