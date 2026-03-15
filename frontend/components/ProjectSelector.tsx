"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getProjects, createProject, deleteProject, updateProject } from "@/lib/api";
import { useStore } from "@/lib/store";
import type { Project } from "@/lib/store";

const MODELS = [
  { value: "gemini-2.0-flash", label: "Gemini 2.0 Flash", note: "Fast and low-cost" },
  { value: "gemini-1.5-pro", label: "Gemini 1.5 Pro", note: "Better for harder tasks" },
  { value: "claude-haiku-4-5-20251001", label: "Claude Haiku 4.5", note: "Fast" },
  { value: "claude-sonnet-4-6", label: "Claude Sonnet 4.6", note: "Balanced" },
  { value: "claude-opus-4-6", label: "Claude Opus 4.6", note: "Highest quality" },
  { value: "gpt-4o-mini", label: "GPT-4o Mini", note: "Good value" },
  { value: "gpt-4o", label: "GPT-4o", note: "More capable" },
];

export default function ProjectSelector() {
  const router = useRouter();
  const { setActiveProject } = useStore();
  const [projects, setProjects] = useState<Project[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({
    name: "",
    description: "",
    system_context: "",
    model: "gemini-2.0-flash",
  });
  const [loading, setLoading] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ name: "", description: "", model: "" });
  const [editLoading, setEditLoading] = useState(false);

  useEffect(() => {
    getProjects().then(setProjects).catch(console.error);
  }, []);

  const selectProject = (project: Project) => {
    if (editingId === project.id) return;
    setActiveProject(project);
    router.push(`/project/${project.id}`);
  };

  const handleCreate = async () => {
    if (!form.name.trim()) return;
    setLoading(true);
    try {
      const project = await createProject(form);
      setActiveProject(project);
      router.push(`/project/${project.id}`);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (event: React.MouseEvent, projectId: string) => {
    event.stopPropagation();
    if (deleteConfirm !== projectId) {
      setDeleteConfirm(projectId);
      setTimeout(() => setDeleteConfirm(null), 3000);
      return;
    }

    try {
      await deleteProject(projectId);
      setProjects((prev) => prev.filter((project) => project.id !== projectId));
      setDeleteConfirm(null);
    } catch (error) {
      console.error(error);
    }
  };

  const startEdit = (event: React.MouseEvent, project: Project) => {
    event.stopPropagation();
    setEditingId(project.id);
    setEditForm({
      name: project.name,
      description: project.description || "",
      model: project.model,
    });
    setDeleteConfirm(null);
  };

  const cancelEdit = (event: React.MouseEvent) => {
    event.stopPropagation();
    setEditingId(null);
  };

  const handleSaveEdit = async (event: React.MouseEvent, projectId: string) => {
    event.stopPropagation();
    if (!editForm.name.trim()) return;

    setEditLoading(true);
    try {
      const updated = await updateProject(projectId, {
        name: editForm.name,
        description: editForm.description || null,
        model: editForm.model,
      });
      setProjects((prev) => prev.map((project) => (project.id === projectId ? { ...project, ...updated } : project)));
      setEditingId(null);
    } catch (error) {
      console.error(error);
    } finally {
      setEditLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 px-6 py-10 text-slate-100">
      <div className="mx-auto max-w-4xl">
        <div className="mb-8 rounded-3xl border border-slate-800 bg-gradient-to-br from-slate-900 via-slate-900 to-slate-950 p-8 shadow-2xl shadow-slate-950/40">
          <p className="text-sm font-medium uppercase tracking-[0.2em] text-cyan-300/80">Prompt Optimizer</p>
          <h1 className="mt-3 text-4xl font-semibold text-white">Open a project and improve prompts faster</h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300">
            Pick a project to continue, or create a new one. Each project keeps its own model choice, saved prompts, and standing instructions.
          </p>
        </div>

        {projects.length > 0 && (
          <div className="mb-6 space-y-3">
            {projects.map((project) =>
              editingId === project.id ? (
                <div
                  key={project.id}
                  className="rounded-2xl border border-cyan-500/40 bg-slate-900 p-5 shadow-lg shadow-slate-950/20"
                  onClick={(event) => event.stopPropagation()}
                >
                  <div className="space-y-3">
                    <input
                      className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-2.5 text-sm text-white outline-none transition-colors focus:border-cyan-400"
                      placeholder="Project name"
                      value={editForm.name}
                      onChange={(event) => setEditForm({ ...editForm, name: event.target.value })}
                    />
                    <input
                      className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-2.5 text-sm text-slate-200 outline-none transition-colors focus:border-cyan-400"
                      placeholder="Short description"
                      value={editForm.description}
                      onChange={(event) => setEditForm({ ...editForm, description: event.target.value })}
                    />
                    <select
                      className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-2.5 text-sm text-white outline-none transition-colors focus:border-cyan-400"
                      value={editForm.model}
                      onChange={(event) => setEditForm({ ...editForm, model: event.target.value })}
                    >
                      {MODELS.map((model) => (
                        <option key={model.value} value={model.value}>
                          {model.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2">
                    <button
                      onClick={(event) => handleSaveEdit(event, project.id)}
                      disabled={editLoading || !editForm.name.trim()}
                      className="rounded-full bg-cyan-500 px-4 py-2 text-sm font-medium text-slate-950 transition-colors hover:bg-cyan-400 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400"
                    >
                      {editLoading ? "Saving..." : "Save changes"}
                    </button>
                    <button
                      onClick={cancelEdit}
                      className="rounded-full border border-slate-700 px-4 py-2 text-sm text-slate-300 transition-colors hover:border-slate-500 hover:text-white"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div
                  key={project.id}
                  onClick={() => selectProject(project)}
                  className="cursor-pointer rounded-2xl border border-slate-800 bg-slate-900/90 p-5 transition-all hover:border-cyan-500/50 hover:bg-slate-900"
                >
                  <div className="flex flex-col gap-4 md:flex-row md:items-start">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="truncate text-lg font-semibold text-white">{project.name}</p>
                        <span className="rounded-full border border-slate-700 px-2.5 py-1 text-xs text-cyan-200">
                          {MODELS.find((model) => model.value === project.model)?.label || project.model}
                        </span>
                      </div>
                      {project.description && (
                        <p className="mt-2 text-sm leading-6 text-slate-300">{project.description}</p>
                      )}
                      <p className="mt-3 text-xs text-slate-400">
                        Created {new Date(project.created_at).toLocaleDateString()}
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={(event) => startEdit(event, project)}
                        className="rounded-full border border-slate-700 px-3 py-1.5 text-xs text-slate-200 transition-colors hover:border-slate-500 hover:text-white"
                      >
                        Edit
                      </button>
                      <button
                        onClick={(event) => handleDelete(event, project.id)}
                        className={`rounded-full px-3 py-1.5 text-xs transition-colors ${
                          deleteConfirm === project.id
                            ? "bg-red-500 text-white hover:bg-red-400"
                            : "border border-slate-700 text-slate-200 hover:border-red-400 hover:text-red-200"
                        }`}
                      >
                        {deleteConfirm === project.id ? "Confirm delete" : "Delete"}
                      </button>
                    </div>
                  </div>
                </div>
              ),
            )}
          </div>
        )}

        {!showCreate ? (
          <button
            onClick={() => setShowCreate(true)}
            className="w-full rounded-2xl border border-dashed border-slate-700 bg-slate-900/60 p-5 text-left transition-colors hover:border-cyan-500/60 hover:bg-slate-900"
          >
            <p className="text-base font-semibold text-white">Create a new project</p>
            <p className="mt-1 text-sm text-slate-300">Add a project name, optional description, and the model you want to use.</p>
          </button>
        ) : (
          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-lg shadow-slate-950/20">
            <h2 className="text-xl font-semibold text-white">Create a new project</h2>
            <p className="mt-2 text-sm text-slate-300">Use simple names. You can change these details later.</p>

            <div className="mt-5 space-y-4">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-200">Project name</label>
                <input
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-2.5 text-white outline-none transition-colors focus:border-cyan-400"
                  placeholder="Example: Customer support replies"
                  value={form.name}
                  onChange={(event) => setForm({ ...form, name: event.target.value })}
                  autoFocus
                />
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-200">Description</label>
                <input
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-2.5 text-white outline-none transition-colors focus:border-cyan-400"
                  placeholder="What is this project for?"
                  value={form.description}
                  onChange={(event) => setForm({ ...form, description: event.target.value })}
                />
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-200">Always include this context</label>
                <textarea
                  className="h-28 w-full resize-none rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-white outline-none transition-colors focus:border-cyan-400"
                  placeholder="Example: Write for small business owners. Keep answers practical and easy to scan."
                  value={form.system_context}
                  onChange={(event) => setForm({ ...form, system_context: event.target.value })}
                />
                <p className="mt-1.5 text-xs text-slate-400">This will be added to each prompt in this project.</p>
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-200">Main model</label>
                <select
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-2.5 text-white outline-none transition-colors focus:border-cyan-400"
                  value={form.model}
                  onChange={(event) => setForm({ ...form, model: event.target.value })}
                >
                  {MODELS.map((model) => (
                    <option key={model.value} value={model.value}>
                      {model.label} - {model.note}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="mt-6 flex flex-wrap gap-3">
              <button
                onClick={handleCreate}
                disabled={loading || !form.name.trim()}
                className="rounded-full bg-cyan-500 px-5 py-2.5 text-sm font-medium text-slate-950 transition-colors hover:bg-cyan-400 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400"
              >
                {loading ? "Creating..." : "Create project"}
              </button>
              <button
                onClick={() => setShowCreate(false)}
                className="rounded-full border border-slate-700 px-5 py-2.5 text-sm text-slate-300 transition-colors hover:border-slate-500 hover:text-white"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
