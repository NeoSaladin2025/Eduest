'use client';

import React, { useState } from 'react';
import { X, Plus, Trash2, Edit2, Check, RotateCcw, Sparkles, Settings } from 'lucide-react';
import { SuggestionItem } from './types';

interface SuggestionsManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialTab?: 'reason' | 'action';
  reasons: SuggestionItem[];
  actions: SuggestionItem[];
  onSaveReasons: (updated: SuggestionItem[]) => void;
  onSaveActions: (updated: SuggestionItem[]) => void;
}

export default function SuggestionsManagerModal({
  isOpen,
  onClose,
  initialTab = 'reason',
  reasons,
  actions,
  onSaveReasons,
  onSaveActions,
}: SuggestionsManagerModalProps) {
  const [activeTab, setActiveTab] = useState<'reason' | 'action'>(initialTab);
  const [newItemText, setNewItemText] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState('');

  if (!isOpen) return null;

  const currentList = activeTab === 'reason' ? reasons : actions;
  const setList = (items: SuggestionItem[]) => {
    if (activeTab === 'reason') {
      onSaveReasons(items);
    } else {
      onSaveActions(items);
    }
  };

  const handleAddItem = (e: React.FormEvent) => {
    e.preventDefault();
    const text = newItemText.trim();
    if (!text) return;

    if (currentList.some(item => item.text.trim().toLowerCase() === text.toLowerCase())) {
      alert('이미 목록에 존재하는 내용입니다.');
      return;
    }

    const newItem: SuggestionItem = {
      id: crypto.randomUUID(),
      text,
      count: 1,
    };

    setList([newItem, ...currentList]);
    setNewItemText('');
  };

  const startEdit = (item: SuggestionItem) => {
    setEditingId(item.id);
    setEditingText(item.text);
  };

  const saveEdit = (id: string) => {
    const text = editingText.trim();
    if (!text) {
      alert('내용을 입력해주세요.');
      return;
    }

    const updated = currentList.map(item =>
      item.id === id ? { ...item, text } : item
    );
    setList(updated);
    setEditingId(null);
  };

  const handleDeleteItem = (id: string, text: string) => {
    if (confirm(`'${text}' 항목을 삭제하시겠습니까?`)) {
      const updated = currentList.filter(item => item.id !== id);
      setList(updated);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div
        className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-lg w-full flex flex-col overflow-hidden max-h-[85vh]"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="bg-slate-900 text-white px-6 py-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-600 flex items-center justify-center text-white shadow-md shadow-indigo-500/20">
              <Settings size={20} />
            </div>
            <div>
              <h3 className="text-lg font-black tracking-tight">자주 쓰는 항목 관리</h3>
              <p className="text-xs text-slate-400 mt-0.5">
                직접 추가/수정/삭제 가능하며, 자주 쓰인 순서대로 자동 정렬됩니다.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Tab Selector */}
        <div className="flex border-b border-slate-200 bg-slate-50/70 p-2 gap-2">
          <button
            onClick={() => {
              setActiveTab('reason');
              setEditingId(null);
            }}
            className={`flex-1 py-2.5 rounded-xl font-black text-xs transition-all flex items-center justify-center gap-1.5 ${
              activeTab === 'reason'
                ? 'bg-white text-rose-600 shadow-xs border border-slate-200/80'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <span>📌 결석 사유 ({reasons.length})</span>
          </button>
          <button
            onClick={() => {
              setActiveTab('action');
              setEditingId(null);
            }}
            className={`flex-1 py-2.5 rounded-xl font-black text-xs transition-all flex items-center justify-center gap-1.5 ${
              activeTab === 'action'
                ? 'bg-white text-indigo-600 shadow-xs border border-slate-200/80'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <span>🛠️ 후속 조치 ({actions.length})</span>
          </button>
        </div>

        {/* Add New Input */}
        <div className="p-4 border-b border-slate-100 bg-slate-50/30">
          <form onSubmit={handleAddItem} className="flex gap-2">
            <input
              type="text"
              value={newItemText}
              onChange={e => setNewItemText(e.target.value)}
              placeholder={
                activeTab === 'reason'
                  ? '새로운 결석 사유 입력 후 추가...'
                  : '새로운 후속 조치 내용 입력 후 추가...'
              }
              className="flex-1 px-3.5 py-2 bg-white border border-slate-200 rounded-xl text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <button
              type="submit"
              className="flex items-center gap-1 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl shadow-xs transition-all"
            >
              <Plus size={15} />
              추가
            </button>
          </form>
        </div>

        {/* List of items */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {currentList.length === 0 ? (
            <div className="py-12 text-center text-xs text-slate-400">
              등록된 항목이 없습니다. 상단에서 새로 추가해보세요.
            </div>
          ) : (
            currentList.map((item, idx) => {
              const isEditing = editingId === item.id;

              return (
                <div
                  key={item.id}
                  className="flex items-center justify-between p-2.5 bg-white border border-slate-200 hover:border-slate-300 rounded-xl transition-all gap-2"
                >
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <span className="w-5 h-5 rounded-full bg-slate-100 text-slate-500 text-[11px] font-black flex items-center justify-center flex-shrink-0">
                      {idx + 1}
                    </span>

                    {isEditing ? (
                      <div className="flex items-center gap-1.5 flex-1 mr-2">
                        <input
                          type="text"
                          value={editingText}
                          onChange={e => setEditingText(e.target.value)}
                          className="flex-1 px-2.5 py-1 text-xs border border-indigo-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                          autoFocus
                          onKeyDown={e => {
                            if (e.key === 'Enter') saveEdit(item.id);
                            if (e.key === 'Escape') setEditingId(null);
                          }}
                        />
                        <button
                          type="button"
                          onClick={() => saveEdit(item.id)}
                          className="p-1 bg-emerald-600 text-white rounded-md hover:bg-emerald-700"
                          title="저장"
                        >
                          <Check size={13} />
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingId(null)}
                          className="p-1 bg-slate-200 text-slate-600 rounded-md hover:bg-slate-300"
                          title="취소"
                        >
                          <X size={13} />
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        <span className="text-xs font-bold text-slate-800 truncate">
                          {item.text}
                        </span>
                        <span className="text-[10px] font-bold text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded flex-shrink-0">
                          {item.count}회 사용
                        </span>
                      </div>
                    )}
                  </div>

                  {!isEditing && (
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button
                        type="button"
                        onClick={() => startEdit(item)}
                        className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                        title="항목 수정"
                      >
                        <Edit2 size={13} />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteItem(item.id, item.text)}
                        className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                        title="항목 삭제"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-100 bg-slate-50 flex items-center justify-between text-xs">
          <span className="text-slate-400 flex items-center gap-1">
            <Sparkles size={13} className="text-amber-500" />
            수업 상세에서 직접 작성한 내용도 자동으로 추가됩니다.
          </span>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-xl transition-all"
          >
            완료
          </button>
        </div>
      </div>
    </div>
  );
}
