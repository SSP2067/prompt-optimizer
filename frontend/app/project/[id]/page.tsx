"use client";
import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useStore } from "@/lib/store";
import { getProject, optimizePrompt, runPrompt } from "@/lib/api";
import type { HistoryItem } from "@/lib/store";
import TemplateLibrary, { SaveTemplateForm } from "@/components/TemplateLibrary";

const TECHNIQUE_COLORS: Record<string, string> = {
  "chain-of-thought": "bg-violet-950 text-violet-200 border border-violet-800",
  "cot": "bg-violet-950 text-violet-200 border border-violet-800",
  "role-prompting": "bg-sky-950 text-sky-200 border border-sky-800",
  "role": "bg-sky-950 text-sky-200 border border-sky-800",
  "few-shot": "bg-emerald-950 text-emerald-200 border border-emerald-800",
  "zero-shot": "bg-slate-800 text-slate-200 border border-slate-700",
  "system-prompt": "bg-amber-950 text-amber-200 border border-amber-800",
  "output-format": "bg-amber-950 text-amber-200 border border-amber-800",
  "code-generation": "bg-cyan-950 text-cyan-200 border border-cyan-800",
  "contextual": "bg-teal-950 text-teal-200 border border-teal-800",
  "step-back": "bg-orange-950 text-orange-200 border border-orange-800",
  "react": "bg-fuchsia-950 text-fuchsia-200 border border-fuchsia-800",
  "prompt-chaining": "bg-rose-950 text-rose-200 border border-rose-800",
  "iterative-prompting": "bg-lime-950 text-lime-200 border border-lime-800",
};

const REQUEST_STYLE_COLORS: Record<string, string> = {
  instructional: "bg-indigo-950 text-indigo-200 border border-indigo-800",
  exploratory: "bg-violet-950 text-violet-200 border border-violet-800",
  conversational: "bg-sky-950 text-sky-200 border border-sky-800",
  structured: "bg-amber-950 text-amber-200 border border-amber-800",
  clarifying: "bg-rose-950 text-rose-200 border border-rose-800",
};

const TEMP_PRESETS = [
  { label: "Focused", value: 0.2, hint: "Stricter and more predictable" },
  { label: "Balanced", value: 0.7, hint: "Good for most tasks" },
  { label: "Creative", value: 1.0, hint: "More varied ideas" },
];

const TONES = ["auto", "professional", "technical", "creative", "casual"];

const OPTIMIZE_STEPS = [
  "Reading your request...",
  "Cleaning up the wording...",
  "Structuring the final prompt...",
  "Final checks...",
];

const RUN_STEPS = [
  "Sending the improved prompt...",
  "Waiting for the model response...",
  "Finishing up...",
];

const EXAMPLES = [
  "Write a friendly but professional reply to a customer asking why their delivery is late.",
  "Turn my rough job description into a clear hiring brief with responsibilities, requirements, and tone.",
  "Improve this sales prompt so the answer comes back as headline, key points, and call to action.",
];

function techniqueColor(value: string) {
  return TECHNIQUE_COLORS[value?.toLowerCase()] ?? "bg-slate-800 text-slate-200 border border-slate-700";
}

function requestStyleColor(value: string) {
  return REQUEST_STYLE_COLORS[value?.toLowerCase()] ?? "bg-slate-800 text-slate-200 border border-slate-700";
}

export default function ProjectPage() {
  const params = useParams();
  const router = useRouter();
  const projectId = params.id as string;

  const {
    activeProject,
    setActiveProject,
    rawInput,
    setRawInput,
    optimizeResult,
    setOptimizeResult,
    isOptimizing,
    setIsOptimizing,
    history,
    addHistory,
    loadHistory,
  } = useStore();

  const [copied, setCopied] = useState(false);
  const [copiedHistoryId, setCopiedHistoryId] = useState<string | null>(null);
  const [optimizeError, setOptimizeError] = useState<string | null>(null);
  const [temperature, setTemperature] = useState(0.7);
  const [tone, setTone] = useState("auto");
  const [showAiReceived, setShowAiReceived] = useState(false);
  const [mistakesOpen, setMistakesOpen] = useState(false);
  const [llmResponse, setLlmResponse] = useState<string | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);
  const [showLibrary, setShowLibrary] = useState(false);
  const [showSaveTemplate, setShowSaveTemplate] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [statusText, setStatusText] = useState("");

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    async function init() {
      try {
        const project = await getProject(projectId);
        setActiveProject(project);
        loadHistory(projectId);
      } catch (error) {
        console.error(error);
        router.push("/");
      }
    }

    init();
  }, [loadHistory, projectId, router, setActiveProject]);

  useEffect(() => {
    if (isOptimizing) {
      setStatusText(OPTIMIZE_STEPS[0]);
      let step = 0;
      const timer = window.setInterval(() => {
        step = Math.min(step + 1, OPTIMIZE_STEPS.length - 1);
        setStatusText(OPTIMIZE_STEPS[step]);
      }, 1400);
      return () => window.clearInterval(timer);
    }

    if (isRunning) {
      setStatusText(RUN_STEPS[0]);
      let step = 0;
      const timer = window.setInterval(() => {
        step = Math.min(step + 1, RUN_STEPS.length - 1);
        setStatusText(RUN_STEPS[step]);
      }, 1400);
      return () => window.clearInterval(timer);
    }

    setStatusText("");
    return undefined;
  }, [isOptimizing, isRunning]);

  const resetPanels = () => {
    setOptimizeResult(null);
    setOptimizeError(null);
    setLlmResponse(null);
    setShowAiReceived(false);
    setMistakesOpen(false);
    setShowSaveTemplate(false);
  };

  const saveToHistory = (result: NonNullable<typeof optimizeResult>) => {
    const item: HistoryItem = {
      id: `${Date.now()}`,
      raw: rawInput,
      optimized: result.optimized,
      technique: result.technique,
      savedTokens: result.tokens_saved,
      savingsPct: result.savings_pct,
      createdAt: new Date().toISOString(),
    };
    addHistory(item);
  };

  const handleOptimize = async () => {
    if (!rawInput.trim() || isOptimizing) return;

    setIsOptimizing(true);
    resetPanels();

    try {
      const chainContext = history.slice(0, 5).map((item) => ({ raw: item.raw, optimized: item.optimized }));
      const result = await optimizePrompt(rawInput, projectId, chainContext, temperature, tone);
      setOptimizeResult(result);
      saveToHistory(result);
    } catch (error: unknown) {
      setOptimizeError(error instanceof Error ? error.message : "Could not improve the prompt.");
    } finally {
      setIsOptimizing(false);
    }
  };

  const handleRun = async () => {
    if (!optimizeResult || isRunning) return;

    setIsRunning(true);
    setLlmResponse(null);
    setRunError(null);

    try {
      const data = await runPrompt(optimizeResult.optimized, projectId, temperature);
      setLlmResponse(data.response);
    } catch (error: unknown) {
      setRunError(error instanceof Error ? error.message : "Could not test the prompt.");
    } finally {
      setIsRunning(false);
    }
  };

  const handleRefine = async () => {
    if (!llmResponse || !rawInput.trim() || isOptimizing) return;

    setIsOptimizing(true);
    setOptimizeResult(null);
    setOptimizeError(null);
    setShowAiReceived(false);
    setMistakesOpen(false);
    setShowSaveTemplate(false);

    try {
      const chainContext = history.slice(0, 5).map((item) => ({ raw: item.raw, optimized: item.optimized }));
      const result = await optimizePrompt(rawInput, projectId, chainContext, temperature, tone, llmResponse);
      setOptimizeResult(result);
      setLlmResponse(null);
      saveToHistory(result);
    } catch (error: unknown) {
      setOptimizeError(error instanceof Error ? error.message : "Could not improve the prompt from that result.");
    } finally {
      setIsOptimizing(false);
    }
  };

  const handleCopy = async (text: string, id?: string) => {
    await navigator.clipboard.writeText(text);
    if (id) {
      setCopiedHistoryId(id);
      window.setTimeout(() => setCopiedHistoryId(null), 1500);
      return;
    }

    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  };

  const clearAll = () => {
    setRawInput("");
    resetPanels();
  };

  const applyExample = (example: string) => {
    setRawInput(example);
    resetPanels();
    textareaRef.current?.focus();
  };

  const rawTokens = rawInput ? Math.ceil(rawInput.length / 4) : 0;
  const hasMistakes = optimizeResult && optimizeResult.mistakes_found?.length > 0;

  if (!activeProject) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 text-slate-400">
        Loading project...
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="border-b border-slate-800 bg-slate-950/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-3 px-5 py-4">
          <button
            type="button"
            onClick={() => router.push("/")}
            className="rounded-full border border-slate-700 px-3 py-1.5 text-sm text-slate-300 transition-colors hover:border-slate-500 hover:text-white"
          >
            Back to projects
          </button>
          <div className="min-w-0">
            <p className="truncate text-lg font-semibold text-white">{activeProject.name}</p>
            {activeProject.description && <p className="text-sm text-slate-300">{activeProject.description}</p>}
          </div>
          <div className="ml-auto flex items-center gap-2">
            <span className="rounded-full border border-slate-700 px-3 py-1 text-xs text-cyan-200">
              Model: {activeProject.model}
            </span>
            <button
              type="button"
              onClick={() => setShowLibrary(true)}
              className="rounded-full border border-slate-700 px-3 py-1.5 text-sm text-slate-200 transition-colors hover:border-slate-500 hover:text-white"
            >
              Templates
            </button>
          </div>
        </div>
      </div>

      <div className="mx-auto grid max-w-7xl gap-6 px-5 py-6 lg:grid-cols-[1.05fr_0.95fr]">
        <section className="rounded-3xl border border-slate-800 bg-slate-900/90 p-5 shadow-2xl shadow-slate-950/30">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-300/80">Step 1</p>
              <h1 className="mt-2 text-2xl font-semibold text-white">Paste the request you want improved</h1>
              <p className="mt-2 text-sm leading-6 text-slate-300">
                Rough wording is fine. The app will clean it up, make it clearer, and add structure.
              </p>
            </div>
            <span className="rounded-full border border-slate-700 px-3 py-1 text-xs text-slate-300">
              Approx. {rawTokens} tokens
            </span>
          </div>

          <textarea
            ref={textareaRef}
            value={rawInput}
            onChange={(event) => setRawInput(event.target.value)}
            onKeyDown={(event) => {
              if ((event.ctrlKey || event.metaKey) && event.key === "Enter") handleOptimize();
            }}
            placeholder="Example: Rewrite this rough customer support request into a clear prompt that asks for a warm reply, a short explanation, and next steps."
            className="mt-5 min-h-[320px] w-full resize-none rounded-2xl border border-slate-700 bg-slate-950 px-4 py-4 text-sm leading-6 text-white outline-none transition-colors focus:border-cyan-400 placeholder:text-slate-500"
          />

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={handleOptimize}
              disabled={isOptimizing || !rawInput.trim()}
              className="rounded-full bg-cyan-500 px-5 py-2.5 text-sm font-semibold text-slate-950 transition-colors hover:bg-cyan-400 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400"
            >
              {isOptimizing ? "Improving prompt..." : "Improve prompt"}
            </button>
            <span className="text-xs text-slate-400">Shortcut: Ctrl+Enter</span>
            <button
              type="button"
              onClick={() => setShowAdvanced((value) => !value)}
              className="rounded-full border border-slate-700 px-4 py-2 text-sm text-slate-200 transition-colors hover:border-slate-500 hover:text-white"
            >
              {showAdvanced ? "Hide advanced options" : "Show advanced options"}
            </button>
            {rawInput && (
              <button
                type="button"
                onClick={clearAll}
                className="ml-auto rounded-full border border-slate-700 px-4 py-2 text-sm text-slate-200 transition-colors hover:border-slate-500 hover:text-white"
              >
                Clear
              </button>
            )}
          </div>

          {showAdvanced && (
            <div className="mt-4 rounded-2xl border border-slate-800 bg-slate-950/70 p-4">
              <p className="text-sm font-medium text-white">Advanced options</p>
              <p className="mt-1 text-xs text-slate-400">Use these only when you want tighter control.</p>

              <div className="mt-4 flex flex-wrap gap-3">
                <div>
                  <p className="mb-2 text-xs font-medium uppercase tracking-[0.16em] text-slate-400">Creativity</p>
                  <div className="flex flex-wrap gap-2">
                    {TEMP_PRESETS.map((preset) => (
                      <button
                        key={preset.value}
                        type="button"
                        title={preset.hint}
                        onClick={() => setTemperature(preset.value)}
                        className={`rounded-full px-3 py-1.5 text-xs transition-colors ${
                          temperature === preset.value
                            ? "bg-cyan-500 text-slate-950"
                            : "border border-slate-700 text-slate-300 hover:border-slate-500 hover:text-white"
                        }`}
                      >
                        {preset.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <p className="mb-2 text-xs font-medium uppercase tracking-[0.16em] text-slate-400">Tone</p>
                  <select
                    value={tone}
                    onChange={(event) => setTone(event.target.value)}
                    className="rounded-full border border-slate-700 bg-slate-950 px-4 py-1.5 text-xs capitalize text-white outline-none transition-colors focus:border-cyan-400"
                  >
                    {TONES.map((value) => (
                      <option key={value} value={value} className="capitalize">
                        {value === "auto" ? "Auto" : value}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          )}

          <div className="mt-5 rounded-2xl border border-slate-800 bg-slate-950/60 p-4">
            <p className="text-sm font-medium text-white">Need an example?</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {EXAMPLES.map((example) => (
                <button
                  key={example}
                  type="button"
                  onClick={() => applyExample(example)}
                  className="rounded-full border border-slate-700 px-3 py-1.5 text-left text-xs text-slate-300 transition-colors hover:border-cyan-500/60 hover:text-white"
                >
                  {example}
                </button>
              ))}
            </div>
          </div>
        </section>

        <section className="rounded-3xl border border-slate-800 bg-slate-900/90 p-5 shadow-2xl shadow-slate-950/30">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-300/80">Step 2</p>
              <h2 className="mt-2 text-2xl font-semibold text-white">Improved prompt</h2>
              <p className="mt-2 text-sm leading-6 text-slate-300">
                Review the improved version, copy it, or test it before using it elsewhere.
              </p>
            </div>
            {optimizeResult && (
              <button
                type="button"
                onClick={() => setShowAiReceived((value) => !value)}
                className="rounded-full border border-slate-700 px-4 py-2 text-sm text-slate-200 transition-colors hover:border-slate-500 hover:text-white"
              >
                {showAiReceived ? "Hide sent details" : "Show sent details"}
              </button>
            )}
          </div>

          {!optimizeResult && !isOptimizing && !optimizeError && (
            <div className="mt-5 flex min-h-[420px] flex-col justify-between rounded-2xl border border-dashed border-slate-700 bg-slate-950/60 p-5">
              <div>
                <p className="text-lg font-medium text-white">Your improved prompt will appear here</p>
                <p className="mt-2 max-w-lg text-sm leading-6 text-slate-300">
                  Start by pasting rough text on the left. The app will tighten wording, keep the key details, and make the request easier for AI tools to follow.
                </p>
              </div>
              <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-4">
                <p className="text-sm font-medium text-white">What a good result usually adds</p>
                <ul className="mt-3 space-y-2 text-sm text-slate-300">
                  <li>Clear role or task</li>
                  <li>Better structure and output format</li>
                  <li>Less filler and repetition</li>
                </ul>
              </div>
            </div>
          )}

          {(isOptimizing || isRunning) && (
            <div className="mt-5 flex min-h-[420px] items-center justify-center rounded-2xl border border-slate-700 bg-slate-950/70 p-5 text-center">
              <div>
                <div className="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-slate-700 border-t-cyan-400" />
                <p className="mt-4 text-base font-medium text-white">{statusText}</p>
                <p className="mt-2 text-sm text-slate-400">
                  {isOptimizing ? "This usually takes a few seconds." : "Testing the prompt with the selected model."}
                </p>
              </div>
            </div>
          )}

          {optimizeError && !isOptimizing && (
            <div className="mt-5 flex min-h-[420px] flex-col items-center justify-center rounded-2xl border border-red-900/50 bg-red-950/20 p-5 text-center">
              <p className="text-base font-semibold text-red-300">Could not improve the prompt</p>
              <p className="mt-2 max-w-md text-sm leading-6 text-slate-300">{optimizeError}</p>
              <p className="mt-2 text-xs text-slate-400">Check that the backend is running on port 8000.</p>
            </div>
          )}

          {optimizeResult && !isOptimizing && (
            <div className="mt-5 space-y-4">
              {showAiReceived ? (
                <div className="min-h-[300px] rounded-2xl border border-slate-700 bg-slate-950/70 p-4">
                  <p className="text-sm font-semibold text-white">What was sent to the AI</p>
                  <div className="mt-4 space-y-4 text-xs">
                    {[
                      { label: "System instructions", value: optimizeResult.ai_received.system_prompt },
                      { label: "Matched hint", value: optimizeResult.ai_received.technique_hint || "(none)" },
                      { label: "Project context", value: optimizeResult.ai_received.project_context || "(none)" },
                      { label: "Recent prompt context", value: optimizeResult.ai_received.chain_context || "(none)" },
                      { label: "User request", value: optimizeResult.ai_received.user_message },
                    ].map(({ label, value }) => (
                      <div key={label}>
                        <p className="mb-1 text-xs font-medium uppercase tracking-[0.16em] text-slate-400">{label}</p>
                        <pre className="whitespace-pre-wrap rounded-xl border border-slate-800 bg-slate-900 p-3 font-mono text-xs leading-6 text-slate-200">
                          {value}
                        </pre>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="min-h-[300px] rounded-2xl border border-cyan-900/60 bg-slate-950/70 p-4">
                  <p className="whitespace-pre-wrap text-sm leading-7 text-slate-100">{optimizeResult.optimized}</p>
                </div>
              )}

              <div className="flex flex-wrap items-center gap-2">
                <span className={`rounded-full px-3 py-1 text-xs ${techniqueColor(optimizeResult.technique)}`}>
                  Method: {optimizeResult.technique}
                </span>
                <span className={`rounded-full px-3 py-1 text-xs ${requestStyleColor(optimizeResult.prompt_type)}`}>
                  Request style: {optimizeResult.prompt_type}
                </span>
                <span className="rounded-full border border-slate-700 px-3 py-1 text-xs text-slate-300">
                  Final size: {optimizeResult.optimized_tokens} tokens
                </span>
                {optimizeResult.tokens_saved > 0 && (
                  <span className="rounded-full border border-emerald-800 bg-emerald-950 px-3 py-1 text-xs text-emerald-200">
                    Saved {optimizeResult.tokens_saved} tokens ({optimizeResult.savings_pct.toFixed(0)}%)
                  </span>
                )}
                {optimizeResult.skipped && (
                  <span className="rounded-full border border-slate-700 px-3 py-1 text-xs text-slate-300">
                    Already concise
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => handleCopy(optimizeResult.optimized)}
                  className="ml-auto rounded-full bg-cyan-500 px-4 py-2 text-sm font-medium text-slate-950 transition-colors hover:bg-cyan-400"
                >
                  {copied ? "Copied" : "Copy prompt"}
                </button>
              </div>

              {hasMistakes && (
                <div className="overflow-hidden rounded-2xl border border-amber-900/50">
                  <button
                    type="button"
                    onClick={() => setMistakesOpen((value) => !value)}
                    className="flex w-full items-center gap-2 bg-amber-950/30 px-4 py-3 text-left transition-colors hover:bg-amber-950/50"
                  >
                    <span className="text-sm font-medium text-amber-200">
                      What was improved ({optimizeResult.mistakes_found.length})
                    </span>
                    <span className="ml-auto text-xs text-slate-400">{mistakesOpen ? "Hide" : "Show"}</span>
                  </button>
                  {mistakesOpen && (
                    <div className="space-y-2 bg-slate-950/70 px-4 py-3">
                      {optimizeResult.mistakes_found.map((item, index) => (
                        <p key={`${item}-${index}`} className="text-sm leading-6 text-slate-300">
                          {item}
                        </p>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {optimizeResult.rationale && (
                <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4">
                  <p className="text-sm font-medium text-white">Why this version is better</p>
                  <p className="mt-2 text-sm leading-6 text-slate-300">{optimizeResult.rationale}</p>
                </div>
              )}

              {!showSaveTemplate ? (
                <button
                  type="button"
                  onClick={() => setShowSaveTemplate(true)}
                  className="text-sm text-cyan-300 transition-colors hover:text-cyan-200"
                >
                  Save this as a template
                </button>
              ) : (
                <SaveTemplateForm
                  defaultTemplate={optimizeResult.optimized}
                  defaultTechnique={optimizeResult.technique}
                  projectId={projectId}
                  onSaved={() => setShowSaveTemplate(false)}
                  onCancel={() => setShowSaveTemplate(false)}
                />
              )}

              <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4">
                <div className="flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={handleRun}
                    disabled={isRunning}
                    className="rounded-full border border-slate-700 px-4 py-2 text-sm text-slate-200 transition-colors hover:border-slate-500 hover:text-white disabled:cursor-not-allowed disabled:border-slate-800 disabled:text-slate-500"
                  >
                    {isRunning ? "Testing..." : "Test this prompt"}
                  </button>
                  <p className="text-sm text-slate-300">See how the selected model responds before you use the prompt elsewhere.</p>
                </div>

                {runError && <p className="mt-3 text-sm text-red-300">{runError}</p>}

                {llmResponse && (
                  <div className="mt-4 space-y-3">
                    <div className="rounded-2xl border border-slate-700 bg-slate-900 p-4">
                      <p className="mb-2 text-sm font-medium text-white">Model response</p>
                      <p className="whitespace-pre-wrap text-sm leading-6 text-slate-200">{llmResponse}</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-3">
                      <button
                        type="button"
                        onClick={handleRefine}
                        disabled={isOptimizing}
                        className="rounded-full bg-indigo-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-400 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400"
                      >
                        Improve prompt using this result
                      </button>
                      <p className="text-sm text-slate-300">
                        Useful when the answer is close, but still misses tone, structure, or detail.
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </section>
      </div>

      {history.length > 0 && (
        <div className="mx-auto mt-2 max-w-7xl px-5 pb-8">
          <div className="rounded-3xl border border-slate-800 bg-slate-900/90 p-5 shadow-2xl shadow-slate-950/20">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-300/80">Recent history</p>
                <h3 className="mt-2 text-xl font-semibold text-white">Recent prompt improvements</h3>
              </div>
            </div>

            <div className="mt-4 space-y-3">
              {history.map((item) => (
                <div
                  key={item.id}
                  className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4"
                >
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start">
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-400">Original</p>
                      <p className="mt-1 truncate text-sm text-slate-200">
                        {item.raw.slice(0, 100)}
                        {item.raw.length > 100 ? "..." : ""}
                      </p>
                      <p className="mt-3 text-xs font-medium uppercase tracking-[0.16em] text-slate-400">Improved</p>
                      <p className="mt-1 truncate text-sm text-slate-200">
                        {item.optimized.slice(0, 130)}
                        {item.optimized.length > 130 ? "..." : ""}
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`rounded-full px-3 py-1 text-xs ${techniqueColor(item.technique)}`}>
                        {item.technique}
                      </span>
                      {item.savedTokens > 0 && (
                        <span className="rounded-full border border-emerald-800 bg-emerald-950 px-3 py-1 text-xs text-emerald-200">
                          Saved {item.savedTokens} tokens
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={() => handleCopy(item.optimized, item.id)}
                        className="rounded-full border border-slate-700 px-3 py-1.5 text-xs text-slate-200 transition-colors hover:border-slate-500 hover:text-white"
                      >
                        {copiedHistoryId === item.id ? "Copied" : "Copy"}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setRawInput(item.raw);
                          resetPanels();
                          textareaRef.current?.focus();
                        }}
                        className="rounded-full border border-slate-700 px-3 py-1.5 text-xs text-slate-200 transition-colors hover:border-slate-500 hover:text-white"
                      >
                        Reuse
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <TemplateLibrary
        isOpen={showLibrary}
        onClose={() => setShowLibrary(false)}
        projectId={projectId}
        onLoadTemplate={(template) => {
          setRawInput(template);
          resetPanels();
          textareaRef.current?.focus();
        }}
      />
    </div>
  );
}
