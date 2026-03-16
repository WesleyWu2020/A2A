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
  Search,
  Sparkles,
} from 'lucide-react';
import { useConversationStore } from '@/store';
import { cn } from '@/lib/utils';
import { Conversation } from '@/types';

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
          ? 'bg-[#eaf6f1] text-[#0d5e42] font-medium'
          : 'text-[#6e6b62] hover:bg-[#f5f3ef] hover:text-[#18170f]'
      )}
      onClick={() => { if (!editing) onSelect(); }}
    >
      <MessageCircle className={cn('h-4 w-4 shrink-0', isActive ? 'text-[#16865f]' : 'text-[#afa9a0]')} />

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
            className="flex-1 rounded border border-[#8dd4bc] bg-white px-1.5 py-0.5 text-xs focus:outline-none focus:ring-1 focus:ring-[#8dd4bc]"
            onClick={(e) => e.stopPropagation()}
          />
          <button onClick={(e) => { e.stopPropagation(); submitRename(); }} className="text-[#16865f] hover:text-[#0d5e42]">
            <Check className="h-3.5 w-3.5" />
          </button>
          <button onClick={(e) => { e.stopPropagation(); setEditing(false); }} className="text-[#afa9a0] hover:text-[#6e6b62]">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ) : (
        <>
          <span className="flex-1 truncate">{conversation.title}</span>
          <div className="hidden items-center gap-0.5 group-hover:flex">
            <button
              onClick={(e) => { e.stopPropagation(); setEditValue(conversation.title); setEditing(true); }}
              className="rounded p-1 text-[#afa9a0] hover:bg-[#ede9e2] hover:text-[#6e6b62]"
              title="Rename"
            >
              <Pencil className="h-3 w-3" />
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); onDelete(); }}
              className="rounded p-1 text-[#afa9a0] hover:bg-[#fee2e2] hover:text-[#e55b3c]"
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

  const projectItems = conversations.slice(0, 6);
  const historyItems = conversations.slice(0, 4);

  // Toggle button (always visible)
  if (!sidebarOpen) {
    return (
      <button
        onClick={toggleSidebar}
        className="fixed left-3 top-20 z-30 flex h-9 w-9 items-center justify-center rounded-lg border border-[#d9d3ca] bg-white text-[#6e6b62] shadow-sm transition-colors hover:bg-[#eaf6f1] hover:text-[#0d5e42]"
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
      className="flex h-full w-[280px] shrink-0 flex-col border-r border-[#e4dfd6] bg-[#fffefc]"
    >
      <div className="border-b border-[#eee8df] px-3 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#16865f] text-white">
              <Sparkles className="h-4 w-4" />
            </div>
            <div>
              <p className="text-sm font-semibold text-[#18170f]">MartGennie</p>
              <p className="text-[11px] text-[#afa9a0]">AI Shopping Genie</p>
            </div>
          </div>
          <button
            onClick={toggleSidebar}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-[#6e6b62] transition-colors hover:bg-[#f5f3ef] hover:text-[#18170f]"
            title="Close sidebar"
          >
            <PanelLeftClose className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="flex items-center gap-2 border-b border-[#eee8df] px-3 py-3">
        <button
          onClick={createNewConversation}
          className="flex flex-1 items-center justify-center gap-2 rounded-lg border border-[#16865f] bg-[#16865f] px-3 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[#14a37a]"
        >
          <Plus className="h-4 w-4" />
          New Wish
        </button>
        <button
          type="button"
          className="flex h-10 w-10 items-center justify-center rounded-lg border border-[#e0d9cf] bg-[#f5f3ef] text-[#6e6b62] transition-colors hover:bg-[#ede9e2] hover:text-[#18170f]"
          title="Search"
        >
          <Search className="h-4 w-4" />
        </button>
      </div>

      {/* Conversations list */}
      <div className="flex-1 overflow-y-auto px-3 py-2">
        <div className="mb-3">
          <p className="mb-1 px-3 text-[11px] font-semibold uppercase tracking-wider text-[#afa9a0]">
            Projects
          </p>
          <AnimatePresence>
            {projectItems.map((conv, idx) => (
              <ConversationItem
                key={conv.conversation_id}
                conversation={conv}
                isActive={activeConversationId === conv.conversation_id || (idx === 0 && !activeConversationId)}
                onSelect={() => switchConversation(conv.conversation_id)}
                onRename={(title) => renameConversation(conv.conversation_id, title)}
                onDelete={() => deleteConversation(conv.conversation_id)}
              />
            ))}
          </AnimatePresence>
        </div>

        {historyItems.length > 0 && (
          <div className="mb-3">
            <p className="mb-1 px-3 text-[11px] font-semibold uppercase tracking-wider text-[#afa9a0]">
              Genie History
            </p>
            <div className="space-y-1 px-2">
              {historyItems.map((item, idx) => (
                <button
                  key={`${item.conversation_id}-hist`}
                  onClick={() => switchConversation(item.conversation_id)}
                  className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs text-[#6e6b62] transition-colors hover:bg-[#f5f3ef]"
                >
                  <span className={cn('h-1.5 w-1.5 rounded-full', idx === 0 ? 'bg-[#16865f]' : idx === 1 ? 'bg-[#d97706]' : 'bg-[#afa9a0]')} />
                  <span className="truncate">{item.title}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {projectItems.length === 0 && (
          <div className="flex flex-col items-center justify-center py-10 text-center">
            <MessageCircle className="h-8 w-8 text-[#d2ccc3]" />
            <p className="mt-2 text-xs text-[#afa9a0]">No conversations yet</p>
          </div>
        )}
      </div>
    </motion.div>
  );
}
