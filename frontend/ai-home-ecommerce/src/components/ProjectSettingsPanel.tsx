'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Settings,
  DollarSign,
  Ruler,
  Palette,
  Shield,
  X,
  Save,
} from 'lucide-react';
import { useProjectStore } from '@/store';
import { ProjectContext } from '@/types';

interface ProjectSettingsPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

export function ProjectSettingsPanel({ isOpen, onClose }: ProjectSettingsPanelProps) {
  const { activeProject, updateProject } = useProjectStore();

  const [budget, setBudget] = useState('');
  const [style, setStyle] = useState('');
  const [roomType, setRoomType] = useState('');
  const [length, setLength] = useState('');
  const [width, setWidth] = useState('');
  const [height, setHeight] = useState('');
  const [constraints, setConstraints] = useState('');
  const [notes, setNotes] = useState('');

  // Sync form with active project
  useEffect(() => {
    if (!activeProject) return;
    const ctx = activeProject.context;
    setBudget(ctx.budget_total?.toString() || '');
    setStyle(ctx.style || '');
    setRoomType(ctx.room_type || '');
    setLength(ctx.room_dimensions?.length?.toString() || '');
    setWidth(ctx.room_dimensions?.width?.toString() || '');
    setHeight(ctx.room_dimensions?.height?.toString() || '');
    setConstraints(ctx.constraints?.join(', ') || '');
    setNotes(ctx.notes || '');
  }, [activeProject]);

  const handleSave = async () => {
    if (!activeProject) return;

    const dims =
      length || width || height
        ? {
            length: parseFloat(length) || 0,
            width: parseFloat(width) || 0,
            height: parseFloat(height) || 2.8,
          }
        : undefined;

    const context: ProjectContext = {
      budget_total: budget ? parseFloat(budget) : undefined,
      budget_spent: activeProject.context.budget_spent || 0,
      style: style || undefined,
      room_type: roomType || undefined,
      room_dimensions: dims,
      constraints: constraints
        ? constraints.split(',').map((s) => s.trim()).filter(Boolean)
        : [],
      notes: notes || undefined,
    };

    await updateProject(activeProject.project_id, { context });
    onClose();
  };

  const styleOptions = [
    'Modern', 'Scandinavian', 'Mid-Century', 'Industrial',
    'Bohemian', 'Minimalist', 'Farmhouse', 'Coastal',
  ];

  const roomOptions = [
    'Living Room', 'Bedroom', 'Dining Room', 'Home Office',
    'Kitchen', 'Bathroom', 'Kids Room', 'Balcony',
  ];

  const constraintPresets = [
    'Pet-Friendly', 'Low-VOC', 'Child-Safe', 'Ergonomic',
    'Eco-Materials', 'Anti-Scratch', 'Waterproof',
  ];

  if (!activeProject) return null;

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm"
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.95, y: 16 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.95, y: 16 }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl"
          >
            {/* Header */}
            <div className="flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-lg font-bold text-slate-900">
                <Settings className="h-5 w-5 text-indigo-600" />
                {activeProject.icon} {activeProject.name} — Settings
              </h2>
              <button onClick={onClose} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-5 space-y-5">
              {/* Budget */}
              <div>
                <label className="flex items-center gap-1.5 text-sm font-medium text-slate-700">
                  <DollarSign className="h-4 w-4 text-emerald-600" />
                  Total Budget (USD)
                </label>
                <input
                  type="number"
                  value={budget}
                  onChange={(e) => setBudget(e.target.value)}
                  placeholder="e.g. 5000"
                  className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"
                />
              </div>

              {/* Style */}
              <div>
                <label className="flex items-center gap-1.5 text-sm font-medium text-slate-700">
                  <Palette className="h-4 w-4 text-violet-600" />
                  Target Style
                </label>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {styleOptions.map((s) => (
                    <button
                      key={s}
                      onClick={() => setStyle(s === style ? '' : s)}
                      className={`rounded-full border px-3 py-1 text-xs font-medium transition-all ${
                        s === style
                          ? 'border-indigo-400 bg-indigo-50 text-indigo-700'
                          : 'border-slate-200 text-slate-600 hover:border-indigo-200'
                      }`}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>

              {/* Room Type */}
              <div>
                <label className="text-sm font-medium text-slate-700">Room Type</label>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {roomOptions.map((r) => (
                    <button
                      key={r}
                      onClick={() => setRoomType(r === roomType ? '' : r)}
                      className={`rounded-full border px-3 py-1 text-xs font-medium transition-all ${
                        r === roomType
                          ? 'border-indigo-400 bg-indigo-50 text-indigo-700'
                          : 'border-slate-200 text-slate-600 hover:border-indigo-200'
                      }`}
                    >
                      {r}
                    </button>
                  ))}
                </div>
              </div>

              {/* Room Dimensions */}
              <div>
                <label className="flex items-center gap-1.5 text-sm font-medium text-slate-700">
                  <Ruler className="h-4 w-4 text-amber-600" />
                  Room Dimensions (meters)
                </label>
                <div className="mt-1.5 grid grid-cols-3 gap-2">
                  <div>
                    <span className="text-xs text-slate-400">Length</span>
                    <input
                      type="number"
                      value={length}
                      onChange={(e) => setLength(e.target.value)}
                      placeholder="m"
                      className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-sm focus:border-indigo-400 focus:outline-none"
                    />
                  </div>
                  <div>
                    <span className="text-xs text-slate-400">Width</span>
                    <input
                      type="number"
                      value={width}
                      onChange={(e) => setWidth(e.target.value)}
                      placeholder="m"
                      className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-sm focus:border-indigo-400 focus:outline-none"
                    />
                  </div>
                  <div>
                    <span className="text-xs text-slate-400">Height</span>
                    <input
                      type="number"
                      value={height}
                      onChange={(e) => setHeight(e.target.value)}
                      placeholder="m"
                      className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-sm focus:border-indigo-400 focus:outline-none"
                    />
                  </div>
                </div>
              </div>

              {/* Constraints */}
              <div>
                <label className="flex items-center gap-1.5 text-sm font-medium text-slate-700">
                  <Shield className="h-4 w-4 text-rose-500" />
                  Constraints
                </label>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {constraintPresets.map((c) => {
                    const selected = constraints.toLowerCase().includes(c.toLowerCase());
                    return (
                      <button
                        key={c}
                        onClick={() => {
                          if (selected) {
                            setConstraints(
                              constraints
                                .split(',')
                                .map((s) => s.trim())
                                .filter((s) => s.toLowerCase() !== c.toLowerCase())
                                .join(', ')
                            );
                          } else {
                            setConstraints(constraints ? `${constraints}, ${c}` : c);
                          }
                        }}
                        className={`rounded-full border px-3 py-1 text-xs font-medium transition-all ${
                          selected
                            ? 'border-rose-300 bg-rose-50 text-rose-700'
                            : 'border-slate-200 text-slate-600 hover:border-rose-200'
                        }`}
                      >
                        {c}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Notes */}
              <div>
                <label className="text-sm font-medium text-slate-700">Notes</label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Any additional notes for the AI..."
                  rows={2}
                  className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"
                />
              </div>
            </div>

            {/* Save */}
            <div className="mt-6 flex justify-end gap-2">
              <button
                onClick={onClose}
                className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                className="flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-indigo-600 to-violet-600 px-4 py-2 text-sm font-medium text-white shadow-lg shadow-indigo-500/25"
              >
                <Save className="h-4 w-4" />
                Save Settings
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
