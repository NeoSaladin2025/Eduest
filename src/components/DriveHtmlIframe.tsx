'use client';

import React, { useState, useEffect, useCallback, useMemo, useId } from 'react';
import { createPortal } from 'react-dom';
import { X, ArrowLeft, Loader2, Maximize2, Minimize2, FileText, ExternalLink, AlertCircle } from 'lucide-react';
import { getCachedContent, setCachedContent } from '@/lib/contentCache';

interface LinkedPopupEntry {
  fileId: string;
  title: string;
  href: string;
  content: string | null;
  contentType: 'html' | 'image';
  loading: boolean;
  error?: string | null;
}

interface DriveHtmlIframeProps {
  srcDoc: string;
  title?: string;
  className?: string;
}

/**
 * Injects a safe link-interceptor script into HTML `srcDoc` so clicking any
 * embedded Google Drive / Docs / Library link opens inside an in-app popup
 * instead of navigating away to Google Drive's raw preview page.
 */
function injectDriveLinkInterceptor(rawHtml: string, channelId: string): string {
  if (!rawHtml) return rawHtml;
  const escapedChannelId = JSON.stringify(channelId);
  const scriptBlock = `<script>
(function(){
  if (window.__eduestDriveHooked) return;
  window.__eduestDriveHooked = true;
  var CHANNEL_ID = ${escapedChannelId};

  function extractDriveId(rawUrl) {
    if (!rawUrl || typeof rawUrl !== 'string') return null;
    var trimmed = rawUrl.trim();
    if (!trimmed || trimmed.charAt(0) === '#' || /^javascript:/i.test(trimmed)) return null;
    if (/^mailto:|^tel:/i.test(trimmed)) return null;

    var isDriveHost = /drive\\.google\\.com|docs\\.google\\.com|googleusercontent\\.com|\\/api\\/drive\\/library\\/file/i.test(trimmed);
    if (!isDriveHost) return null;

    var m1 = trimmed.match(/\\/d\\/([a-zA-Z0-9_-]{15,})/);
    if (m1 && m1[1]) return m1[1];

    var m2 = trimmed.match(/[?&](?:id|fileId)=([a-zA-Z0-9_-]{15,})/);
    if (m2 && m2[1]) return m2[1];

    return null;
  }

  function dispatchOpen(fileId, title, href) {
    try {
      window.parent.postMessage({
        type: 'eduest_open_linked_drive',
        channelId: CHANNEL_ID,
        fileId: fileId,
        title: title || '',
        href: href || ''
      }, '*');
    } catch (e) {}
  }

  document.addEventListener('click', function(ev) {
    var el = ev.target;
    while (el && el !== document) {
      if (el.tagName === 'A' && el.getAttribute('href')) {
        var href = el.getAttribute('href');
        var fileId = extractDriveId(href);
        if (fileId) {
          ev.preventDefault();
          ev.stopPropagation();
          var label = (el.textContent || el.getAttribute('title') || '').trim();
          dispatchOpen(fileId, label, href);
          return;
        }
      }
      if (el.getAttribute && el.getAttribute('data-href')) {
        var dh = el.getAttribute('data-href');
        var dId = extractDriveId(dh);
        if (dId) {
          ev.preventDefault();
          ev.stopPropagation();
          var dLabel = (el.textContent || el.getAttribute('title') || '').trim();
          dispatchOpen(dId, dLabel, dh);
          return;
        }
      }
      el = el.parentNode;
    }
  }, true);

  var origOpen = window.open;
  window.open = function(url) {
    var fId = extractDriveId(url);
    if (fId) {
      dispatchOpen(fId, '', String(url || ''));
      return null;
    }
    if (typeof origOpen === 'function') {
      return origOpen.apply(window, arguments);
    }
    return null;
  };
})();
<` + `/script>`;

  if (/<\/body>/i.test(rawHtml)) {
    return rawHtml.replace(/<\/body>/i, `${scriptBlock}\n</body>`);
  }
  if (/<\/html>/i.test(rawHtml)) {
    return rawHtml.replace(/<\/html>/i, `${scriptBlock}\n</html>`);
  }
  return `${rawHtml}\n${scriptBlock}`;
}

export default function DriveHtmlIframe({ srcDoc, title = '문제 해설', className = 'w-full h-full border-0' }: DriveHtmlIframeProps) {
  const reactId = useId();
  const mainChannelId = useMemo(() => `main_${reactId}`, [reactId]);
  const popupChannelId = useMemo(() => `popup_${reactId}`, [reactId]);

  const [popupStack, setPopupStack] = useState<LinkedPopupEntry[]>([]);
  const [isMaximized, setIsMaximized] = useState(false);

  const openLinkedFile = useCallback(async (fileId: string, rawTitle: string, href: string) => {
    const cleanTitle = rawTitle ? rawTitle.slice(0, 60) : '연결된 참고 문서';
    const newEntry: LinkedPopupEntry = {
      fileId,
      title: cleanTitle,
      href,
      content: null,
      contentType: 'html',
      loading: true,
      error: null,
    };

    setPopupStack((prev) => [...prev, newEntry]);

    const cacheKey = `${fileId}_auto_linked`;
    try {
      const cached = await getCachedContent(cacheKey);
      if (cached) {
        const isImg = cached.startsWith('data:image/');
        setPopupStack((prev) =>
          prev.map((item) =>
            item.fileId === fileId && item.loading
              ? { ...item, content: cached, contentType: isImg ? 'image' : 'html', loading: false }
              : item
          )
        );
        return;
      }

      const res = await fetch(`/api/drive/library/file?fileId=${encodeURIComponent(fileId)}&type=auto`);
      const data = await res.json();
      if (data?.success && data.data) {
        const contentStr: string = data.data;
        const cType: 'html' | 'image' =
          data.contentType === 'image' || contentStr.startsWith('data:image/') ? 'image' : 'html';
        const resolvedTitle =
          data.fileName && (!rawTitle || rawTitle === '연결된 참고 문서')
            ? String(data.fileName).replace(/\.html?$/i, '')
            : cleanTitle;

        setCachedContent(cacheKey, contentStr).catch(() => {});

        setPopupStack((prev) =>
          prev.map((item) =>
            item.fileId === fileId && item.loading
              ? {
                  ...item,
                  title: resolvedTitle,
                  content: contentStr,
                  contentType: cType,
                  loading: false,
                  error: null,
                }
              : item
          )
        );
      } else {
        setPopupStack((prev) =>
          prev.map((item) =>
            item.fileId === fileId && item.loading
              ? { ...item, loading: false, error: data?.error || '문서를 불러올 수 없습니다.' }
              : item
          )
        );
      }
    } catch (err: any) {
      setPopupStack((prev) =>
        prev.map((item) =>
          item.fileId === fileId && item.loading
            ? { ...item, loading: false, error: err?.message || '연결된 파일을 여는 중 오류가 발생했습니다.' }
            : item
        )
      );
    }
  }, []);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const msg = event.data;
      if (!msg || msg.type !== 'eduest_open_linked_drive') return;
      if (msg.channelId !== mainChannelId && msg.channelId !== popupChannelId) return;
      if (!msg.fileId) return;
      openLinkedFile(String(msg.fileId), String(msg.title || ''), String(msg.href || ''));
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [mainChannelId, popupChannelId, openLinkedFile]);

  // Capture ESC before underlying modals so pressing ESC closes the popup first
  useEffect(() => {
    if (popupStack.length === 0) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopImmediatePropagation();
        setPopupStack([]);
      }
    };
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [popupStack.length]);

  const enhancedMainHtml = useMemo(
    () => injectDriveLinkInterceptor(srcDoc, mainChannelId),
    [srcDoc, mainChannelId]
  );

  const currentPopup = popupStack.length > 0 ? popupStack[popupStack.length - 1] : null;
  const enhancedPopupHtml = useMemo(
    () =>
      currentPopup?.content && currentPopup.contentType === 'html'
        ? injectDriveLinkInterceptor(currentPopup.content, popupChannelId)
        : '',
    [currentPopup?.content, currentPopup?.contentType, popupChannelId]
  );

  return (
    <>
      <iframe
        srcDoc={enhancedMainHtml}
        title={title}
        className={className}
      />

      {currentPopup &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            className="fixed inset-0 z-[9999] bg-black/80 backdrop-blur-md flex items-center justify-center p-3 sm:p-6 animate-in fade-in duration-150"
            onClick={() => setPopupStack([])}
          >
            <div
              className={`bg-[#0b1120] border border-indigo-500/40 rounded-3xl shadow-2xl flex flex-col overflow-hidden transition-all duration-200 ${
                isMaximized ? 'w-full h-full max-w-none max-h-none' : 'w-full max-w-5xl h-[88vh]'
              }`}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Popup Header */}
              <div className="px-4 sm:px-6 py-3.5 bg-slate-900/95 border-b border-white/10 flex items-center justify-between gap-3 shrink-0">
                <div className="flex items-center gap-2.5 min-w-0">
                  {popupStack.length > 1 && (
                    <button
                      type="button"
                      onClick={() => setPopupStack((prev) => prev.slice(0, -1))}
                      className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-white/10 hover:bg-indigo-600 text-white text-xs font-black transition-all cursor-pointer shrink-0"
                      title="이전 연결 문서로 돌아가기"
                    >
                      <ArrowLeft size={14} />
                      <span>이전</span>
                    </button>
                  )}
                  <div className="w-8 h-8 rounded-xl bg-indigo-500/20 border border-indigo-400/30 text-indigo-300 flex items-center justify-center shrink-0">
                    <FileText size={16} />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-400/30 shrink-0">
                        연결 자료
                      </span>
                      <h3 className="text-sm font-black text-white truncate">
                        {currentPopup.title}
                      </h3>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => setIsMaximized((prev) => !prev)}
                    className="w-9 h-9 rounded-xl bg-white/5 hover:bg-white/15 text-slate-300 hover:text-white flex items-center justify-center transition-all border border-white/10 cursor-pointer"
                    title={isMaximized ? '원래 크기로' : '최대화'}
                  >
                    {isMaximized ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
                  </button>
                  <button
                    type="button"
                    onClick={() => setPopupStack([])}
                    className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-rose-500/20 hover:bg-rose-600 text-rose-200 hover:text-white text-xs font-black transition-all border border-rose-500/30 cursor-pointer"
                    title="닫고 원래 화면으로 돌아가기 (ESC)"
                  >
                    <X size={15} />
                    <span>닫기</span>
                  </button>
                </div>
              </div>

              {/* Popup Body */}
              <div className="flex-1 bg-white relative overflow-hidden flex items-center justify-center">
                {currentPopup.loading ? (
                  <div className="absolute inset-0 bg-slate-950/95 flex flex-col items-center justify-center gap-3 text-white">
                    <Loader2 size={42} className="animate-spin text-indigo-400" />
                    <p className="text-xs font-bold text-slate-300">연결된 HTML 문서를 불러오는 중...</p>
                  </div>
                ) : currentPopup.error ? (
                  <div className="p-8 text-center space-y-4 bg-slate-950 text-white w-full h-full flex flex-col items-center justify-center">
                    <AlertCircle size={44} className="text-amber-400" />
                    <div className="space-y-1">
                      <h4 className="text-base font-black">연결된 문서를 불러오지 못했습니다</h4>
                      <p className="text-xs text-slate-400 max-w-md">{currentPopup.error}</p>
                    </div>
                    {currentPopup.href && (
                      <a
                        href={currentPopup.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-black transition-all"
                      >
                        <ExternalLink size={14} />
                        <span>새 탭에서 원본 링크 열기</span>
                      </a>
                    )}
                  </div>
                ) : currentPopup.contentType === 'image' && currentPopup.content ? (
                  <div className="w-full h-full bg-slate-950 flex items-center justify-center p-4 overflow-auto">
                    <img
                      src={currentPopup.content}
                      alt={currentPopup.title}
                      className="max-w-full max-h-full object-contain rounded-2xl shadow-2xl bg-white p-2"
                    />
                  </div>
                ) : enhancedPopupHtml ? (
                  <iframe
                    srcDoc={enhancedPopupHtml}
                    title={currentPopup.title}
                    className="w-full h-full border-0 bg-white"
                  />
                ) : null}
              </div>
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
