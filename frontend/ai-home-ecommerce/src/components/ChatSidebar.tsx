'use client';

import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Plus,
  MessageCircle,
  Trash2,
  Pencil,
  Check,
  X,
  PanelLeftClose,
  PanelLeft,
} from 'lucide-react';
import { useConversationStore } from '@/store';
import { cn } from '@/lib/utils';
import { Conversation } from '@/types';

// ── 时间分组工具 ──────────────────────────────────────────────────────────────

function groupConversations(conversations: Conversation[]) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today.getTime() - 86400000);
  const last7 = new Date(today.getTime() - 7 * 86400000);

  const groups: { label: string; items: Conversation[] }[] = [
    { label: 'Today', items: [] },
    { label: 'Yesterday', items: [] },
    { label: 'Previous 7 Days', items: [] },
    { label: 'Earlier', items: [] },
  ];

  for (const c of conversations) {
    const d = new Date(c.updated_at || c.created_at);
    if (d >= today) groups[0].items.push(c);
    else if (d >= yesterday) groups[1].items.push(c);
    else if (d >= last7) groups[2].items.push(c);
    else groups[3].items.push(c);
  }

  return groups.filter((g) => g.items.length > 0);
}

// ── 单条对话项 ────────────────────────────────────────────────────────────────

function ConversationItem({
  conversation,
  isActive,
  onSelect,
  onRename,
  onDelete,
}: {
  conversation: Conversation;
  isActive: boolean;
  onSelect: () => void;
  onRename: (title: string) => void;
  onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState(conversation.title);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  const submitRename = () => {
    const val = editValue.trim();
    if (val && val !== conversation.title) {
      onRename(val);
    }
    setEditing(false);
  };

  return (
    <motion.div
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      className={cn(
        'group relative flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm cursor-pointer transition-colors',
        isActive
          ? 'bg-indigo-50 text-indigo-700 font-medium'
          : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
      )}
      onClick={() => { if (!editing) onSelect(); }}
    >
      <MessageCircle className={cn('h-4 w-4 shrink-0', isActive ? 'text-indigo-500' : 'text-slate-400')} />

      {editing ? (
        <div className="flex flex-1 items-center gap-1">
          <input
            ref={inputRef}
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') submitRename();
              if (e.key === 'Escape') setEditing(false);
            }}
            className="flex-1 rounded border border-indigo-300 bg-white px-1.5 py-0.5 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-400"
            onClick={(e) => e.stopPropagation()}
          />
          <button onClick={(e) => { e.stopPropagation(); submitRename(); }} className="text-emerald-600 hover:text-emerald-700">
            <Check className="h-3.5 w-3.5" />
          </button>
          <button onClick={(e) => { e.stopPropagation(); setEditing(false); }} className="text-slate-400 hover:text-slate-600">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ) : (
        <>
          <span className="flex-1 truncate">{conversation.title}</span>
          <div className="hidden items-center gap-0.5 group-hover:flex">
            <button
              onClick={(e) => { e.stopPropagation(); setEditValue(conversation.title); setEditing(true); }}
              className="rounded p-1 text-slate-400 hover:bg-slate-200 hover:text-slate-600"
              title="Rename"
            >
              <Pencil className="h-3 w-3" />
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); onDelete(); }}
              className="rounded p-1 text-slate-400 hover:bg-red-100 hover:text-red-600"
              title="Delete"
            >
              <Trash2 className="h-3 w-3" />
            </button>
          </div>
        </>
      )}
    </motion.div>
  );
}

// ── ChatSidebar 主组件 ───────────────────────────────────────────────────────

export function ChatSidebar() {
  const {
    conversations,
    activeConversationId,
    sidebarOpen,
    createNewConversation,
    switchConversation,
    renameConversation,
    deleteConversation,
    toggleSidebar,
  } = useConversationStore();

  const groups = groupConversations(conversations);

  // Toggle button (always visible)
  if (!sidebarOpen) {
    return (
      <button
        onClick={toggleSidebar}
        className="fixed left-3 top-20 z-30 flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 shadow-sm transition-colors hover:bg-indigo-50 hover:text-indigo-600"
        title="Open sidebar"
      >
        <PanelLeft className="h-4 w-4" />
      </button>
    );
  }

  return (
    <motion.div
      initial={{ width: 0, opacity: 0 }}
      animate={{ width: 280, opacity: 1 }}
      exit={{ width: 0, opacity: 0 }}
      transition={{ duration: 0.2 }}
      className="flex h-full w-[280px] shrink-0 flex-col border-r border-slate-200 bg-white"
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
        <h2 className="text-sm font-semibold text-slate-800">Conversations</h2>
        <div className="flex items-center gap-1">
          <button
            onClick={createNewConversation}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-indigo-50 hover:text-indigo-600"
            title="New Chat"
          >
            <Plus className="h-4 w-4" />
          </button>
          <button
            onClick={toggleSidebar}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700"
            title="Close sidebar"
          >
            <PanelLeftClose className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* New Chat button (prominent) */}
      <div className="px-3 pt-3 pb-1">
        <button
          onClick={createNewConversation}
          className="flex w-full items-center gap-2 rounded-lg border border-dashed border-indigo-300 px-3 py-2.5 text-sm font-medium text-indigo-600 transition-colors hover:bg-indigo-50 hover:border-indigo-400"
        >
          <Plus className="h-4 w-4" />
          New Chat
        </button>
      </div>

      {/* Conversations list */}
      <div className="flex-1 overflow-y-auto px-3 py-2">
        <AnimatePresence>
          {groups.map((group) => (
            <div key={group.label} className="mb-3">
              <p className="mb-1 px-3 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                {group.label}
              </p>
              {group.items.map((conv) => (
                <ConversationItem
                  key={conv.conversation_id}
                  conversation={conv}
                  isActive={activeConversationId === conv.conversation_id}
                  onSelect={() => switchConversation(conv.conversation_id)}
                  onRename={(title) => renameConversation(conv.conversation_id, title)}
                  onDelete={() => deleteConversation(conv.conversation_id)}
                />
              ))}
            </div>
          ))}
        </AnimatePresence>

        {conversations.length === 0 && (
          <div className="flex flex-col items-center justify-center py-10 text-center">
            <MessageCircle className="h-8 w-8 text-slate-300" />
            <p className="mt-2 text-xs text-slate-400">No conversations yet</p>
          </div>
        )}
      </div>
    </motion.div>
  );
}
