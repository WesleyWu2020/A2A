'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  User,
  Home,
  Tag,
  Plus,
  Edit3,
  Check,
  X,
  ChevronLeft,
  Sparkles,
  MapPin,
  ShoppingBag,
} from 'lucide-react';
import { Header } from '@/components/Header';
import { useMemoryStore } from '@/store';
import { MemoryTag, SpaceProfile } from '@/types';
import { cn } from '@/lib/utils';

// ─── Category label map ───────────────────────────────────────────────────────

const CATEGORY_CONFIG: Record<MemoryTag['category'], { label: string; color: string }> = {
  preference: { label: 'Preference', color: 'bg-indigo-100 text-indigo-700 border-indigo-200' },
  constraint: { label: 'Constraint', color: 'bg-red-100 text-red-700 border-red-200' },
  lifestyle: { label: 'Lifestyle', color: 'bg-green-100 text-green-700 border-green-200' },
  budget: { label: 'Budget', color: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
};

// ─── Tag Card ─────────────────────────────────────────────────────────────────

function TagChip({ tag, onRemove }: { tag: MemoryTag; onRemove: () => void }) {
  const config = CATEGORY_CONFIG[tag.category] ?? CATEGORY_CONFIG.preference;
  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
      className={cn(
        'flex items-center gap-2 rounded-xl border px-3.5 py-2.5 text-sm font-medium',
        config.color,
      )}
    >
      <span className="flex-1">{tag.label}</span>
      <span className="rounded-full bg-white/60 px-1.5 py-0.5 text-[10px] font-normal opacity-70">
        {config.label}
      </span>
      {tag.source === 'implicit' && (
        <span title="AI-detected preference">
          <Sparkles className="h-3 w-3 opacity-60" />
        </span>
      )}
      <button
        onClick={onRemove}
        className="ml-1 rounded-full p-0.5 hover:bg-black/10 transition-colors"
        aria-label="Remove tag"
      >
        <X className="h-3 w-3" />
      </button>
    </motion.div>
  );
}

// ─── Add Tag Form ─────────────────────────────────────────────────────────────

const PRESET_TAGS: Array<Pick<MemoryTag, 'key' | 'label' | 'category'>> = [
  { key: 'has_cats', label: 'Has Cats 🐱', category: 'lifestyle' },
  { key: 'has_dogs', label: 'Has Dogs 🐶', category: 'lifestyle' },
  { key: 'formaldehyde_sensitive', label: 'Chemical Sensitive 🌿', category: 'constraint' },
  { key: 'prefers_wood', label: 'Loves Wood Material 🪵', category: 'preference' },
  { key: 'minimalist', label: 'Minimalist Style', category: 'preference' },
  { key: 'mid_century', label: 'Mid-Century Modern', category: 'preference' },
  { key: 'scandinavian', label: 'Scandinavian Style', category: 'preference' },
  { key: 'cold_sensitive', label: 'Prefers Warm Materials 🔥', category: 'preference' },
  { key: 'child_safe', label: 'Child-Safe Materials', category: 'constraint' },
];

function AddTagForm({ onAdd, existingKeys }: { onAdd: (tag: MemoryTag) => void; existingKeys: Set<string> }) {
  const [open, setOpen] = useState(false);
  const [custom, setCustom] = useState('');

  const available = PRESET_TAGS.filter((t) => !existingKeys.has(t.key));

  return (
    <div className="mt-3">
      {!open ? (
        <button
          onClick={() => setOpen(true)}
          className="flex items-center gap-1.5 rounded-xl border border-dashed border-slate-300 px-3.5 py-2 text-sm text-slate-500 hover:border-indigo-400 hover:text-indigo-600 transition-colors"
        >
          <Plus className="h-4 w-4" />
          Add preference tag
        </button>
      ) : (
        <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-4 space-y-3">
          {available.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {available.map((preset) => (
                <button
                  key={preset.key}
                  onClick={() => {
                    onAdd({
                      key: preset.key,
                      label: preset.label,
                      category: preset.category,
                      confidence: 1.0,
                      source: 'explicit',
                      created_at: new Date().toISOString(),
                    });
                    setOpen(false);
                  }}
                  className="rounded-lg border border-indigo-200 bg-white px-3 py-1.5 text-xs font-medium text-indigo-700 hover:bg-indigo-100 transition-colors"
                >
                  + {preset.label}
                </button>
              ))}
            </div>
          )}
          <div className="flex gap-2">
            <input
              placeholder="Or type a custom preference..."
              value={custom}
              onChange={(e) => setCustom(e.target.value)}
              className="flex-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm outline-none focus:border-indigo-400"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && custom.trim()) {
                  onAdd({
                    key: `custom_${Date.now()}`,
                    label: custom.trim(),
                    category: 'preference',
                    confidence: 1.0,
                    source: 'explicit',
                    created_at: new Date().toISOString(),
                  });
                  setCustom('');
                  setOpen(false);
                }
              }}
            />
            <button onClick={() => setOpen(false)} className="text-slate-400 hover:text-slate-600 px-1">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Space Card ───────────────────────────────────────────────────────────────

function SpaceCard({ space, onEdit }: { space: SpaceProfile; onEdit: () => void }) {
  return (
    <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-indigo-100 text-indigo-600">
          <Home className="h-4 w-4" />
        </div>
        <div>
          <p className="text-sm font-semibold text-slate-900">{space.name}</p>
          <p className="text-xs text-slate-500">
            {space.area_sqft && `${space.area_sqft} sqft`}
            {space.area_sqm && ` · ${space.area_sqm} m²`}
            {space.style && ` · ${space.style}`}
          </p>
        </div>
      </div>
      <button
        onClick={onEdit}
        className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors"
      >
        <Edit3 className="h-4 w-4" />
      </button>
    </div>
  );
}

// ─── Add Space Modal ──────────────────────────────────────────────────────────

function AddSpaceModal({ onSave, onClose, initial }: {
  onSave: (space: SpaceProfile) => void;
  onClose: () => void;
  initial?: SpaceProfile;
}) {
  const [name, setName] = useState(initial?.name ?? '');
  const [areaSqft, setAreaSqft] = useState(initial?.area_sqft?.toString() ?? '');
  const [style, setStyle] = useState(initial?.style ?? '');
  const [notes, setNotes] = useState(initial?.notes ?? '');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl"
      >
        <h3 className="text-base font-semibold text-slate-900 mb-4">
          {initial ? 'Edit Space' : 'Add New Space'}
        </h3>
        <div className="space-y-3">
          <div>
            <label className="text-xs font-medium text-slate-600">Space Name *</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Living Room, Master Bedroom"
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-indigo-400"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-slate-600">Area (sqft)</label>
            <input
              value={areaSqft}
              onChange={(e) => setAreaSqft(e.target.value)}
              placeholder="e.g. 250"
              type="number"
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-indigo-400"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-slate-600">Style Preference</label>
            <input
              value={style}
              onChange={(e) => setStyle(e.target.value)}
              placeholder="e.g. Scandinavian, Mid-Century Modern"
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-indigo-400"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-slate-600">Notes</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. North-facing, limited natural light"
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-indigo-400 resize-none"
              rows={2}
            />
          </div>
        </div>
        <div className="mt-5 flex justify-end gap-3">
          <button onClick={onClose} className="rounded-xl px-4 py-2 text-sm text-slate-500 hover:bg-slate-100 transition-colors">
            Cancel
          </button>
          <button
            onClick={() => {
              if (!name.trim()) return;
              onSave({
                space_id: initial?.space_id ?? `space_${Date.now()}`,
                name: name.trim(),
                area_sqft: areaSqft ? parseFloat(areaSqft) : undefined,
                area_sqm: areaSqft ? parseFloat(areaSqft) / 10.764 : undefined,
                style: style.trim() || undefined,
                notes: notes.trim() || undefined,
              });
              onClose();
            }}
            disabled={!name.trim()}
            className="flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50 transition-colors"
          >
            <Check className="h-4 w-4" />
            Save
          </button>
        </div>
      </motion.div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function ProfilePage() {
  const router = useRouter();
  const { userMemory, isLoadingMemory, loadUserMemory, addTag, removeTag, upsertSpace, updateNickname } =
    useMemoryStore();

  const [editingNickname, setEditingNickname] = useState(false);
  const [nicknameInput, setNicknameInput] = useState('');
  const [showAddSpace, setShowAddSpace] = useState(false);
  const [editingSpace, setEditingSpace] = useState<SpaceProfile | undefined>(undefined);

  useEffect(() => {
    loadUserMemory();
  }, [loadUserMemory]);

  useEffect(() => {
    if (userMemory?.nickname) setNicknameInput(userMemory.nickname);
  }, [userMemory]);

  if (isLoadingMemory || !userMemory) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-500 border-t-transparent" />
      </div>
    );
  }

  const existingTagKeys = new Set(userMemory.tags.map((t) => t.key));

  return (
    <div className="min-h-screen bg-slate-50">
      <Header />
      <div className="mx-auto max-w-2xl px-4 py-8">
        {/* Back button */}
        <button
          onClick={() => router.back()}
          className="mb-6 flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-900 transition-colors"
        >
          <ChevronLeft className="h-4 w-4" />
          Back
        </button>

        {/* Page title */}
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 shadow-lg shadow-indigo-500/25">
            <User className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900">My Home Profile</h1>
            <p className="text-sm text-slate-500">
              Your AI assistant remembers these preferences across sessions
            </p>
          </div>
        </div>

        {/* Stats bar */}
        <div className="mb-6 grid grid-cols-3 gap-3">
          {[
            { icon: Tag, label: 'Preferences', value: userMemory.tags.length },
            { icon: Home, label: 'Spaces', value: userMemory.spaces.length },
            { icon: ShoppingBag, label: 'Visits', value: userMemory.visit_count },
          ].map(({ icon: Icon, label, value }) => (
            <div key={label} className="rounded-xl border border-slate-200 bg-white p-4 text-center">
              <Icon className="mx-auto h-4 w-4 text-indigo-500 mb-1" />
              <p className="text-xl font-bold text-slate-900">{value}</p>
              <p className="text-xs text-slate-500">{label}</p>
            </div>
          ))}
        </div>

        {/* Nickname */}
        <section className="mb-4 rounded-2xl border border-slate-200 bg-white p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
              <User className="h-4 w-4 text-indigo-500" />
              Display Name
            </h2>
          </div>
          {editingNickname ? (
            <div className="flex gap-2">
              <input
                value={nicknameInput}
                onChange={(e) => setNicknameInput(e.target.value)}
                className="flex-1 rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-indigo-400"
                placeholder="What should AI call you?"
              />
              <button
                onClick={() => {
                  updateNickname(nicknameInput);
                  setEditingNickname(false);
                }}
                className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 transition-colors"
              >
                <Check className="h-4 w-4" />
              </button>
              <button onClick={() => setEditingNickname(false)} className="rounded-xl px-3 py-2 text-slate-400 hover:text-slate-700 transition-colors">
                <X className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <div className="flex items-center justify-between">
              <p className="text-sm text-slate-700 font-medium">
                {userMemory.nickname || <span className="text-slate-400 font-normal italic">Not set — AI will use &quot;you&quot;</span>}
              </p>
              <button
                onClick={() => setEditingNickname(true)}
                className="flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs text-slate-500 hover:bg-slate-100 transition-colors"
              >
                <Edit3 className="h-3 w-3" />
                Edit
              </button>
            </div>
          )}
        </section>

        {/* Preference Tags */}
        <section className="mb-4 rounded-2xl border border-slate-200 bg-white p-5">
          <div className="flex items-center justify-between mb-1">
            <h2 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
              <Tag className="h-4 w-4 text-indigo-500" />
              Preference & Constraint Tags
            </h2>
          </div>
          <p className="text-xs text-slate-500 mb-4">
            AI uses these tags for every recommendation. Tags with ✨ were detected automatically — you can remove them anytime.
          </p>
          <div className="flex flex-wrap gap-2">
            <AnimatePresence>
              {userMemory.tags.map((tag) => (
                <TagChip key={tag.key} tag={tag} onRemove={() => removeTag(tag.key)} />
              ))}
            </AnimatePresence>
          </div>
          {userMemory.tags.length === 0 && (
            <p className="text-sm text-slate-400 italic">No preferences saved yet. Chat with the AI to build your profile!</p>
          )}
          <AddTagForm onAdd={addTag} existingKeys={existingTagKeys} />
        </section>

        {/* Spaces */}
        <section className="mb-4 rounded-2xl border border-slate-200 bg-white p-5">
          <div className="flex items-center justify-between mb-1">
            <h2 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
              <MapPin className="h-4 w-4 text-indigo-500" />
              My Spaces
            </h2>
            <button
              onClick={() => { setEditingSpace(undefined); setShowAddSpace(true); }}
              className="flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs text-indigo-600 hover:bg-indigo-50 transition-colors"
            >
              <Plus className="h-3 w-3" />
              Add Space
            </button>
          </div>
          <p className="text-xs text-slate-500 mb-4">
            AI tailors recommendations per space — your minimalist living room and cozy kid&apos;s room get separate treatment.
          </p>
          <div className="space-y-3">
            <AnimatePresence>
              {userMemory.spaces.map((space) => (
                <motion.div key={space.space_id} layout initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                  <SpaceCard
                    space={space}
                    onEdit={() => { setEditingSpace(space); setShowAddSpace(true); }}
                  />
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
          {userMemory.spaces.length === 0 && (
            <p className="text-sm text-slate-400 italic">No spaces added yet.</p>
          )}
        </section>

        {/* Purchase history */}
        {userMemory.purchase_history_summary.length > 0 && (
          <section className="rounded-2xl border border-slate-200 bg-white p-5">
            <h2 className="mb-3 text-sm font-semibold text-slate-900 flex items-center gap-2">
              <ShoppingBag className="h-4 w-4 text-indigo-500" />
              Purchase History Insights
            </h2>
            <div className="flex flex-wrap gap-2">
              {userMemory.purchase_history_summary.map((item, i) => (
                <span key={i} className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs text-slate-600">
                  {item}
                </span>
              ))}
            </div>
            {userMemory.avg_order_value && (
              <p className="mt-3 text-xs text-slate-500">
                Avg. order value: <span className="font-semibold text-slate-700">${userMemory.avg_order_value.toFixed(0)}</span>
              </p>
            )}
          </section>
        )}
      </div>

      {/* Add / Edit Space Modal */}
      {showAddSpace && (
        <AddSpaceModal
          initial={editingSpace}
          onSave={(space) => upsertSpace(space)}
          onClose={() => setShowAddSpace(false)}
        />
      )}
    </div>
  );
}
