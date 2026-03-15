"use client";
import { useEffect, useState } from "react";
import { getTemplates, useTemplate as trackTemplateUse, deleteTemplate, createTemplate } from "@/lib/api";

interface Template {
  id: string;
  project_id: string | null;
  name: string;
  description: string | null;
  template: string;
  technique: string | null;
  use_count: number;
  created_at: string;
}

const TECHNIQUE_COLORS: Record<string, string> = {
  "chain-of-thought": "bg-purple-900 text-purple-300",
  "few-shot": "bg-green-900 text-green-300",
  "zero-shot": "bg-gray-700 text-gray-300",
  "role-prompting": "bg-blue-900 text-blue-300",
  "code-generation": "bg-cyan-900 text-cyan-300",
  "contextual": "bg-teal-900 text-teal-300",
  "step-back": "bg-orange-900 text-orange-300",
  "output-format": "bg-yellow-900 text-yellow-300",
  "iterative-prompting": "bg-lime-900 text-lime-300",
};

function techColor(value: string | null) {
  if (!value) return "bg-gray-700 text-gray-400";
  return TECHNIQUE_COLORS[value.toLowerCase()] ?? "bg-gray-700 text-gray-400";
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  projectId: string;
  onLoadTemplate: (template: string) => void;
}

interface SaveFormState {
  name: string;
  description: string;
  template: string;
  technique: string;
  saving: boolean;
}

export default function TemplateLibrary({ isOpen, onClose, projectId, onLoadTemplate }: Props) {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setLoading(true);
    getTemplates(projectId)
      .then(setTemplates)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [isOpen, projectId]);

  const handleLoad = async (template: Template) => {
    try {
      await trackTemplateUse(template.id);
      setTemplates((prev) =>
        prev.map((item) => (item.id === template.id ? { ...item, use_count: item.use_count + 1 } : item)),
      );
    } catch {
      // Ignore usage counter errors and still load the template.
    }

    onLoadTemplate(template.template);
    onClose();
  };

  const handleDelete = async (event: React.MouseEvent, id: string) => {
    event.stopPropagation();
    if (deleteConfirm !== id) {
      setDeleteConfirm(id);
      setTimeout(() => setDeleteConfirm(null), 3000);
      return;
    }

    try {
      await deleteTemplate(id);
      setTemplates((prev) => prev.filter((item) => item.id !== id));
      setDeleteConfirm(null);
    } catch (error) {
      console.error(error);
    }
  };

  const filtered = templates.filter(
    (template) =>
      template.name.toLowerCase().includes(search.toLowerCase()) ||
      template.description?.toLowerCase().includes(search.toLowerCase()) ||
      template.template.toLowerCase().includes(search.toLowerCase()),
  );

  if (!isOpen) return null;

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/50" onClick={onClose} />

      <div className="fixed right-0 top-0 z-50 flex h-full w-[420px] flex-col border-l border-gray-700 bg-gray-900 shadow-2xl">
        <div className="flex items-center gap-3 border-b border-gray-700 px-5 py-4">
          <span className="text-base font-semibold text-white">Templates</span>
          <div className="flex-1" />
          <button onClick={onClose} className="text-xl leading-none text-gray-500 transition-colors hover:text-white">
            x
          </button>
        </div>

        <div className="border-b border-gray-800 px-4 py-3">
          <input
            className="w-full rounded-md border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white placeholder-gray-500 focus:border-indigo-500 focus:outline-none"
            placeholder="Search templates..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            autoFocus
          />
        </div>

        <div className="flex-1 space-y-2 overflow-y-auto px-4 py-3">
          {loading && <p className="py-8 text-center text-sm text-gray-500">Loading templates...</p>}
          {!loading && filtered.length === 0 && (
            <div className="py-12 text-center">
              <p className="text-sm text-gray-400">{search ? "No templates match your search." : "No templates yet."}</p>
              {!search && <p className="mt-2 text-xs text-gray-500">Save one from the improved prompt panel.</p>}
            </div>
          )}
          {filtered.map((template) => (
            <div
              key={template.id}
              onClick={() => handleLoad(template)}
              className="cursor-pointer rounded-lg border border-gray-700 bg-gray-800 p-3 transition-all hover:border-indigo-600 hover:bg-gray-700"
            >
              <div className="mb-1.5 flex items-start gap-2">
                <p className="flex-1 truncate text-sm font-medium text-white">{template.name}</p>
                <div className="flex items-center gap-1.5">
                  {template.technique && (
                    <span className={`rounded px-1.5 py-0.5 text-xs ${techColor(template.technique)}`}>
                      {template.technique}
                    </span>
                  )}
                  <button
                    onClick={(event) => handleDelete(event, template.id)}
                    className={`rounded px-2 py-0.5 text-xs transition-colors ${
                      deleteConfirm === template.id
                        ? "bg-red-600 text-white"
                        : "border border-gray-700 text-gray-300 hover:text-red-300"
                    }`}
                    title={deleteConfirm === template.id ? "Click again to confirm" : "Delete"}
                  >
                    {deleteConfirm === template.id ? "Confirm" : "Delete"}
                  </button>
                </div>
              </div>
              {template.description && <p className="mb-1.5 truncate text-xs text-gray-400">{template.description}</p>}
              <p className="truncate font-mono text-xs text-gray-500">
                {template.template.slice(0, 100)}
                {template.template.length > 100 ? "..." : ""}
              </p>
              <p className="mt-1.5 text-xs text-gray-600">
                Used {template.use_count} {template.use_count === 1 ? "time" : "times"}
              </p>
            </div>
          ))}
        </div>

        <div className="border-t border-gray-800 px-4 py-3">
          <p className="text-center text-xs text-gray-500">Click a template to load it into the editor.</p>
        </div>
      </div>
    </>
  );
}

interface SaveTemplateFormProps {
  defaultTemplate: string;
  defaultTechnique: string;
  projectId: string;
  onSaved: () => void;
  onCancel: () => void;
}

export function SaveTemplateForm({
  defaultTemplate,
  defaultTechnique,
  projectId,
  onSaved,
  onCancel,
}: SaveTemplateFormProps) {
  const [form, setForm] = useState<SaveFormState>({
    name: "",
    description: "",
    template: defaultTemplate,
    technique: defaultTechnique,
    saving: false,
  });

  const handleSave = async () => {
    if (!form.name.trim()) return;
    setForm((current) => ({ ...current, saving: true }));
    try {
      await createTemplate({
        name: form.name,
        description: form.description || null,
        template: form.template,
        technique: form.technique || null,
        project_id: projectId,
      });
      onSaved();
    } catch (error) {
      console.error(error);
    } finally {
      setForm((current) => ({ ...current, saving: false }));
    }
  };

  return (
    <div className="mt-2 space-y-2 rounded-lg border border-indigo-800 bg-gray-900 p-3">
      <p className="text-xs font-medium text-indigo-400">Save as template</p>
      <input
        className="w-full rounded border border-gray-700 bg-gray-800 px-2.5 py-1.5 text-xs text-white focus:border-indigo-500 focus:outline-none"
        placeholder="Template name *"
        value={form.name}
        onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
        autoFocus
      />
      <input
        className="w-full rounded border border-gray-700 bg-gray-800 px-2.5 py-1.5 text-xs text-gray-300 focus:border-indigo-500 focus:outline-none"
        placeholder="Description (optional)"
        value={form.description}
        onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
      />
      <div className="flex gap-2">
        <button
          onClick={handleSave}
          disabled={form.saving || !form.name.trim()}
          className="rounded bg-indigo-600 px-3 py-1.5 text-xs text-white transition-colors hover:bg-indigo-500 disabled:opacity-50"
        >
          {form.saving ? "Saving..." : "Save"}
        </button>
        <button onClick={onCancel} className="px-3 py-1.5 text-xs text-gray-500 transition-colors hover:text-white">
          Cancel
        </button>
      </div>
    </div>
  );
}
