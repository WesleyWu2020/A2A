'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  FolderOpen,
  Plus,
  Check,
  Trash2,
  ChevronDown,
} from 'lucide-react';
import { useProjectStore } from '@/store';

interface ProjectSwitcherProps {
  compact?: boolean;
}

export function ProjectSwitcher({ compact = false }: ProjectSwitcherProps) {
  const {
    projects,
    activeProjectId,
    switchProject,
    createProject,
    deleteProject,
  } = useProjectStore();

  const [isOpen, setIsOpen] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newIcon, setNewIcon] = useState('🏠');

  const activeProject = projects.find((p) => p.project_id === activeProjectId);

  const handleCreate = async () => {
    if (!newName.trim()) return;
    await createProject(newName.trim(), newIcon);
    setNewName('');
    setShowCreate(false);
  };

  const handleSwitch = async (projectId: string) => {
    await switchProject(projectId);
    setIsOpen(false);
  };

  const handleDelete = async (e: React.MouseEvent, projectId: string) => {
    e.stopPropagation();
    if (projects.length <= 1) return;
    await deleteProject(projectId);
  };

  const iconOptions = ['🏠', '🛋️', '🛏️', '🍽️', '📚', '🏢', '🎨', '🌿'];

  return (
    <div className="relative">
      {/* Trigger Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm transition-all hover:border-indigo-300 hover:bg-indigo-50"
      >
        <span className="text-base">{activeProject?.icon || '📂'}</span>
        {!compact && (
          <span className="max-w-[140px] truncate">
            {activeProject?.name || 'No Project'}
          </span>
        )}
        <ChevronDown className={`h-3.5 w-3.5 text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {/* Dropdown */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: -4, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.97 }}
            transition={{ duration: 0.15 }}
            className="absolute left-0 top-full z-50 mt-1.5 w-72 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl"
          >
            {/* Header */}
            <div className="border-b border-slate-100 px-4 py-2.5">
              <p className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                <FolderOpen className="h-3.5 w-3.5" />
                My Projects
              </p>
            </div>

            {/* Project List */}
            <div className="max-h-52 overflow-y-auto py-1">
              {projects.map((project) => (
                <button
                  key={project.project_id}
                  onClick={() => handleSwitch(project.project_id)}
                  className={`flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm transition-colors hover:bg-slate-50 ${
                    project.project_id === activeProjectId ? 'bg-indigo-50' : ''
                  }`}
                >
                  <span className="text-lg">{project.icon}</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-slate-800">{project.name}</p>
                    <p className="text-xs text-slate-400">
                      {project.favorites?.length || 0} favorites
                      {project.context?.budget_total
                        ? ` · $${project.context.budget_total.toLocaleString()} budget`
                        : ''}
                    </p>
                  </div>
                  {project.project_id === activeProjectId && (
                    <Check className="h-4 w-4 shrink-0 text-indigo-600" />
                  )}
                  {projects.length > 1 && (
                    <button
                      onClick={(e) => handleDelete(e, project.project_id)}
                      className="shrink-0 rounded p-1 text-slate-300 hover:bg-red-50 hover:text-red-500"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </button>
              ))}

              {projects.length === 0 && (
                <p className="px-4 py-6 text-center text-xs text-slate-400">
                  No projects yet. Create one to get started!
                </p>
              )}
            </div>

            {/* Create New */}
            <div className="border-t border-slate-100">
              {showCreate ? (
                <div className="space-y-2 px-4 py-3">
                  <div className="flex items-center gap-2">
                    <div className="flex gap-1">
                      {iconOptions.map((ico) => (
                        <button
                          key={ico}
                          onClick={() => setNewIcon(ico)}
                          className={`rounded p-1 text-sm ${
                            ico === newIcon ? 'bg-indigo-100 ring-2 ring-indigo-400' : 'hover:bg-slate-100'
                          }`}
                        >
                          {ico}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={newName}
                      onChange={(e) => setNewName(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
                      placeholder="Project name..."
                      className="flex-1 rounded-lg border border-slate-200 px-3 py-1.5 text-sm focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"
                      autoFocus
                    />
                    <button
                      onClick={handleCreate}
                      disabled={!newName.trim()}
                      className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-40"
                    >
                      Add
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setShowCreate(true)}
                  className="flex w-full items-center gap-2 px-4 py-2.5 text-sm text-indigo-600 transition-colors hover:bg-indigo-50"
                >
                  <Plus className="h-4 w-4" />
                  Create New Project
                </button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
