'use client';

import React, { useState, useEffect, useRef } from 'react';
import { X, Copy, Check, Camera, Download, AlertCircle, Sparkles, UserX } from 'lucide-react';
import { ClassItem } from './types';

interface AbsenteeEntry {
  className: string;
  classTime: string;
  studentId: string;
  studentName: string;
  studentGrade: string;
  reason: string;
  actionNotes: string;
}

interface AbsenteeModalProps {
  isOpen: boolean;
  onClose: () => void;
  date: string; // 'YYYY-MM-DD'
  classes: ClassItem[];
}

export default function AbsenteeModal({ isOpen, onClose, date, classes }: AbsenteeModalProps) {
  const [copiedType, setCopiedType] = useState<'text' | 'image' | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const reportRef = useRef<HTMLDivElement>(null);

  // Extract all absent students from classes on this date
  const absentees: AbsenteeEntry[] = React.useMemo(() => {
    const list: AbsenteeEntry[] = [];
    const targetClasses = classes.filter(c => c.date === date);

    targetClasses.forEach(c => {
      if (!c.students_attendance) return;
      Object.values(c.students_attendance).forEach(record => {
        if (record.status === 'ABSENT') {
          list.push({
            className: c.name,
            classTime: c.time,
            studentId: record.student_id,
            studentName: record.student_name,
            studentGrade: record.student_grade,
            reason: record.absent_reason?.trim() || '사유 미기입',
            actionNotes: record.action_notes?.trim() || '처리내용 미기입',
          });
        }
      });
    });

    return list;
  }, [classes, date]);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage(null);
    }, 2800);
  };

  // Build clean text representation
  const generateReportText = () => {
    const header = `[📢 ${date} 결석생 현황 보고]`;
    const countLine = `총 결석 인원: ${absentees.length}명\n`;
    if (absentees.length === 0) {
      return `${header}\n해당 일자에는 결석생이 없습니다. 전원 출석! 👍`;
    }

    const items = absentees.map((item, index) => {
      return `${index + 1}. ${item.studentName} (${item.studentGrade} / ${item.className} ${item.classTime})
   - 결석사유: ${item.reason}
   - 처리내용: ${item.actionNotes}`;
    }).join('\n\n');

    const footer = `\n─────────────────────\n발신: 에듀에스트(EDUEST) 학사관리`;
    return `${header}\n${countLine}─────────────────────\n${items}${footer}`;
  };

  const copyTextToClipboard = async () => {
    try {
      const text = generateReportText();
      await navigator.clipboard.writeText(text);
      setCopiedType('text');
      showToast('📋 결석생 보고서가 클립보드에 복사되었습니다! (Ctrl+V로 전송 가능)');
      setTimeout(() => setCopiedType(null), 2500);
    } catch (e) {
      console.error('클립보드 복사 실패:', e);
    }
  };

  // Draw report onto canvas for image copy/capture
  const generateCanvas = (): HTMLCanvasElement => {
    const canvas = document.createElement('canvas');
    const width = 800;
    const padding = 32;
    const itemHeight = 90;
    const height = Math.max(340, 160 + absentees.length * itemHeight + 60);

    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d')!;

    // Background
    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(0, 0, width, height);

    // Header Card
    ctx.fillStyle = '#4f46e5';
    ctx.roundRect ? ctx.roundRect(padding, 24, width - padding * 2, 70, 14) : ctx.fillRect(padding, 24, width - padding * 2, 70);
    ctx.fill();

    // Header Text
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 22px sans-serif';
    ctx.fillText(`📢 ${date} 결석생 보고서`, padding + 20, 66);

    ctx.fillStyle = '#e0e7ff';
    ctx.font = 'bold 15px sans-serif';
    ctx.fillText(`총 결석: ${absentees.length}명`, width - padding - 130, 66);

    let y = 125;

    if (absentees.length === 0) {
      ctx.fillStyle = '#ffffff';
      ctx.roundRect ? ctx.roundRect(padding, y, width - padding * 2, 100, 12) : ctx.fillRect(padding, y, width - padding * 2, 100);
      ctx.fill();

      ctx.fillStyle = '#10b981';
      ctx.font = 'bold 18px sans-serif';
      ctx.fillText('✨ 해당 일자에는 결석생이 없습니다! 전원 출석 완료.', padding + 30, y + 55);
    } else {
      absentees.forEach((item, idx) => {
        // Item box
        ctx.fillStyle = '#ffffff';
        ctx.strokeStyle = '#e2e8f0';
        ctx.lineWidth = 1;
        if (ctx.roundRect) {
          ctx.beginPath();
          ctx.roundRect(padding, y, width - padding * 2, itemHeight - 12, 10);
          ctx.fill();
          ctx.stroke();
        } else {
          ctx.fillRect(padding, y, width - padding * 2, itemHeight - 12);
          ctx.strokeRect(padding, y, width - padding * 2, itemHeight - 12);
        }

        // Student badge
        ctx.fillStyle = '#ef4444';
        ctx.font = 'bold 16px sans-serif';
        ctx.fillText(`${idx + 1}. ${item.studentName}`, padding + 18, y + 30);

        ctx.fillStyle = '#64748b';
        ctx.font = 'bold 14px sans-serif';
        ctx.fillText(`[${item.studentGrade}] ${item.className} (${item.classTime})`, padding + 130, y + 30);

        // Reason & Action
        ctx.fillStyle = '#dc2626';
        ctx.font = 'bold 13px sans-serif';
        ctx.fillText('• 결석사유: ', padding + 18, y + 55);
        ctx.fillStyle = '#334155';
        ctx.font = '13px sans-serif';
        ctx.fillText(item.reason, padding + 90, y + 55);

        ctx.fillStyle = '#4f46e5';
        ctx.font = 'bold 13px sans-serif';
        ctx.fillText('• 처리내용: ', padding + 380, y + 55);
        ctx.fillStyle = '#334155';
        ctx.font = '13px sans-serif';
        ctx.fillText(item.actionNotes, padding + 450, y + 55);

        y += itemHeight;
      });
    }

    // Footer
    ctx.fillStyle = '#94a3b8';
    ctx.font = '12px sans-serif';
    ctx.fillText('EDUEST Academic Management System', padding + 10, height - 16);

    return canvas;
  };

  const copyImageToClipboard = async () => {
    try {
      const canvas = generateCanvas();
      canvas.toBlob(async (blob) => {
        if (!blob) return;
        try {
          if (navigator.clipboard && navigator.clipboard.write) {
            await navigator.clipboard.write([
              new ClipboardItem({ 'image/png': blob })
            ]);
            setCopiedType('image');
            showToast('📸 결석생 보고서 이미지가 클립보드에 캡처 복사되었습니다!');
            setTimeout(() => setCopiedType(null), 2500);
          } else {
            // fallback to text
            await copyTextToClipboard();
          }
        } catch (err) {
          // fallback to downloading or text
          await copyTextToClipboard();
        }
      }, 'image/png');
    } catch (e) {
      console.error('이미지 복사 실패:', e);
      copyTextToClipboard();
    }
  };

  const downloadImage = () => {
    try {
      const canvas = generateCanvas();
      const url = canvas.toDataURL('image/png');
      const a = document.createElement('a');
      a.href = url;
      a.download = `결석생보고서_${date}.png`;
      a.click();
      showToast('💾 보고서 이미지가 다운로드되었습니다.');
    } catch (e) {
      console.error('다운로드 실패:', e);
    }
  };

  // Keyboard shortcut listener for CTRL+C inside the modal
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // If user presses Ctrl+C or Cmd+C
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'c') {
        const activeElem = document.activeElement;
        const isInput = activeElem?.tagName === 'INPUT' || activeElem?.tagName === 'TEXTAREA';
        // If text is not selected in an input
        if (!isInput || !window.getSelection()?.toString()) {
          e.preventDefault();
          // Perform capture & copy
          copyTextToClipboard();
        }
      } else if (e.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, absentees, date]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div 
        className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-2xl w-full flex flex-col overflow-hidden max-h-[90vh]"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="bg-gradient-to-r from-indigo-600 via-indigo-700 to-indigo-800 text-white px-6 py-5 flex items-center justify-between shadow-md">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center backdrop-blur-md">
              <UserX className="text-white" size={22} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-xl font-black tracking-tight">{date} 결석생 보고서</h3>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-black bg-rose-500 text-white shadow-sm">
                  {absentees.length}명 결석
                </span>
              </div>
              <p className="text-xs text-indigo-100 font-medium mt-0.5">
                해당 날짜의 모든 수업 결석생 현황 및 사유/처리내용
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-white/70 hover:text-white hover:bg-white/10 rounded-xl transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* 안내 바: CTRL+C 단축키 강조 */}
        <div className="bg-indigo-50 border-b border-indigo-100 px-6 py-2.5 flex items-center justify-between text-xs text-indigo-800">
          <div className="flex items-center gap-2 font-bold">
            <span className="px-2 py-0.5 bg-indigo-600 text-white rounded font-mono text-[11px] shadow-sm">
              CTRL + C
            </span>
            <span>단축키를 누르면 이 팝업의 결석생 보고 내용이 즉시 복사됩니다.</span>
          </div>
          <div className="flex items-center gap-1.5 font-medium text-slate-500">
            <Sparkles size={14} className="text-amber-500" />
            <span>카톡/메신저 보고용</span>
          </div>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto flex-1 space-y-4" ref={reportRef}>
          {absentees.length === 0 ? (
            <div className="py-12 flex flex-col items-center justify-center text-center text-slate-400">
              <div className="w-16 h-16 rounded-full bg-emerald-50 text-emerald-500 flex items-center justify-center mb-3">
                <Check size={32} />
              </div>
              <p className="text-base font-bold text-slate-700">결석한 학생이 없습니다!</p>
              <p className="text-xs text-slate-400 mt-1">{date}에 모든 수업 학생이 전원 출석했습니다.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {absentees.map((item, idx) => (
                <div
                  key={`${item.studentId}-${idx}`}
                  className="bg-white border border-slate-200 hover:border-indigo-300 rounded-xl p-4 shadow-sm transition-all space-y-2.5"
                >
                  <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                    <div className="flex items-center gap-2">
                      <span className="w-6 h-6 rounded-full bg-rose-100 text-rose-600 font-black text-xs flex items-center justify-center">
                        {idx + 1}
                      </span>
                      <span className="text-base font-black text-slate-900">{item.studentName}</span>
                      <span className="px-2 py-0.5 bg-slate-100 text-slate-600 text-xs font-bold rounded">
                        {item.studentGrade}
                      </span>
                    </div>
                    <span className="text-xs font-bold text-indigo-600 bg-indigo-50 px-2.5 py-1 rounded-md">
                      {item.className} ({item.classTime})
                    </span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs pt-1">
                    <div className="bg-rose-50/60 p-2.5 rounded-lg border border-rose-100">
                      <span className="font-bold text-rose-700 block mb-1">📌 결석 사유</span>
                      <p className="text-slate-700 whitespace-pre-wrap leading-relaxed">
                        {item.reason}
                      </p>
                    </div>
                    <div className="bg-indigo-50/60 p-2.5 rounded-lg border border-indigo-100">
                      <span className="font-bold text-indigo-700 block mb-1">🛠️ 처리 및 조치 내용</span>
                      <p className="text-slate-700 whitespace-pre-wrap leading-relaxed">
                        {item.actionNotes}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="bg-slate-50 border-t border-slate-200 px-6 py-4 flex flex-wrap items-center justify-between gap-3">
          <div className="text-xs text-slate-500 font-medium">
            {toastMessage && (
              <span className="text-indigo-600 font-bold animate-pulse flex items-center gap-1.5">
                <Check size={14} /> {toastMessage}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={copyTextToClipboard}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-sm shadow-sm transition-all ${
                copiedType === 'text'
                  ? 'bg-emerald-600 text-white'
                  : 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-indigo-200'
              }`}
            >
              {copiedType === 'text' ? <Check size={16} /> : <Copy size={16} />}
              보고서 복사 (Ctrl+C)
            </button>

            <button
              onClick={copyImageToClipboard}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-sm border transition-all ${
                copiedType === 'image'
                  ? 'bg-emerald-50 border-emerald-300 text-emerald-700'
                  : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-100'
              }`}
              title="이미지 형태로 클립보드에 복사"
            >
              <Camera size={16} className="text-slate-600" />
              이미지 캡처 복사
            </button>

            <button
              onClick={downloadImage}
              className="p-2.5 bg-white border border-slate-300 text-slate-600 hover:bg-slate-100 rounded-xl transition-all"
              title="이미지 파일로 다운로드"
            >
              <Download size={16} />
            </button>

            <button
              onClick={onClose}
              className="px-4 py-2.5 bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold rounded-xl text-sm transition-all"
            >
              닫기
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
