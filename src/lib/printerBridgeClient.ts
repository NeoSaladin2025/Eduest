'use client';

export const PRINTER_BRIDGE_BASE_URL = 'http://127.0.0.1:48921';
export const PRINTER_BRIDGE_DOWNLOAD_URL = '/downloads/EduestPrinterBridge.zip';
export const LATEST_PRINTER_BRIDGE_VERSION = '1.1.0';

export interface BridgePrinterItem {
  name: string;
  isDefault: boolean;
}

export interface BridgeStatusResult {
  connected: boolean;
  version?: string;
  defaultPrinter: string;
  printers: BridgePrinterItem[];
}

export type BridgeDuplexMode = 'default' | 'simplex' | 'long' | 'short';

export function isBridgeVersionAtLeast(current: string | undefined, minVersion: string): boolean {
  if (!current) return false;
  const parse = (v: string) =>
    v
      .trim()
      .split('.')
      .map((n) => parseInt(n, 10) || 0);
  const a = parse(current);
  const b = parse(minVersion);
  const len = Math.max(a.length, b.length);
  for (let i = 0; i < len; i++) {
    const av = a[i] ?? 0;
    const bv = b[i] ?? 0;
    if (av > bv) return true;
    if (av < bv) return false;
  }
  return true;
}

export async function fetchBridgePrinters(timeoutMs = 1800): Promise<BridgeStatusResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${PRINTER_BRIDGE_BASE_URL}/printers`, {
      method: 'GET',
      cache: 'no-store',
      signal: controller.signal,
    });
    if (!res.ok) {
      return { connected: false, defaultPrinter: '', printers: [] };
    }
    const data = await res.json();
    if (!data?.ok || !Array.isArray(data.printers)) {
      return { connected: false, defaultPrinter: '', printers: [] };
    }
    return {
      connected: true,
      version: typeof data.version === 'string' ? data.version : undefined,
      defaultPrinter: String(data.defaultPrinter || ''),
      printers: data.printers.map((p: any) => ({
        name: String(p?.name || ''),
        isDefault: Boolean(p?.isDefault),
      })),
    };
  } catch {
    return { connected: false, defaultPrinter: '', printers: [] };
  } finally {
    clearTimeout(timer);
  }
}

export async function sendPrintHtmlViaBridge(params: {
  printerName: string;
  jobTitle: string;
  html: string;
  copies?: number;
  duplex?: BridgeDuplexMode;
}): Promise<{ ok: boolean; printer?: string; pages?: number; error?: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 65000);
  try {
    const res = await fetch(`${PRINTER_BRIDGE_BASE_URL}/print-html`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        printerName: params.printerName,
        jobTitle: params.jobTitle,
        html: params.html,
        copies: params.copies && params.copies > 0 ? params.copies : 1,
        duplex: params.duplex || 'default',
      }),
      signal: controller.signal,
    });
    const data = await res.json().catch(() => null);
    if (!res.ok || !data?.ok) {
      return {
        ok: false,
        error: data?.error || `브릿지 인쇄 요청 실패 (HTTP ${res.status})`,
      };
    }
    return {
      ok: true,
      printer: data.printer,
      pages: data.pages,
    };
  } catch (err: any) {
    return {
      ok: false,
      error: err?.name === 'AbortError'
        ? '프린터 전송 대기 시간이 초과되었습니다.'
        : (err?.message || '로컬 프린터 브릿지와 통신할 수 없습니다.'),
    };
  } finally {
    clearTimeout(timer);
  }
}

export async function sendPrintHtmlBatchViaBridge(params: {
  printerName: string;
  copies?: number;
  duplex?: BridgeDuplexMode;
  sharedRestHtml: string;
  jobs: Array<{ jobTitle: string; firstSheetHtml: string }>;
}): Promise<{ ok: boolean; status?: number; printer?: string; jobs?: number; pages?: number; error?: string }> {
  const controller = new AbortController();
  const timeoutMs = Math.max(90000, params.jobs.length * 15000);
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${PRINTER_BRIDGE_BASE_URL}/print-html-batch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        printerName: params.printerName,
        copies: params.copies && params.copies > 0 ? params.copies : 1,
        duplex: params.duplex || 'default',
        sharedRestHtml: params.sharedRestHtml,
        jobs: params.jobs,
      }),
      signal: controller.signal,
    });
    const data = await res.json().catch(() => null);
    if (!res.ok || !data?.ok) {
      return {
        ok: false,
        status: res.status,
        error: data?.error || `브릿지 일괄 인쇄 실패 (HTTP ${res.status})`,
      };
    }
    return {
      ok: true,
      status: res.status,
      printer: data.printer,
      jobs: data.jobs,
      pages: data.pages,
    };
  } catch (err: any) {
    return {
      ok: false,
      error: err?.name === 'AbortError'
        ? '일괄 인쇄 대기 시간이 초과되었습니다.'
        : (err?.message || '로컬 프린터 브릿지와 통신할 수 없습니다.'),
    };
  } finally {
    clearTimeout(timer);
  }
}

let cachedStylesSignature = '';
let cachedStylesOutput = '';

/**
 * 현재 문서의 로드된 스타일시트 규칙을 인라인 CSS 텍스트로 추출하여
 * 헤드리스 HTML->PDF 변환 시 외부 스타일 유실/지연을 방지합니다.
 * 스타일시트 목록이 동일하면 캐시된 결과를 즉시 반환합니다.
 */
export function collectInlineStylesForBridge(): string {
  try {
    const sheets = Array.from(document.styleSheets);
    let sig = `${sheets.length}`;
    for (let i = 0; i < sheets.length; i++) {
      const node = sheets[i].ownerNode;
      if (node instanceof HTMLStyleElement) {
        sig += `:s${node.textContent?.length || 0}`;
      } else if (node instanceof HTMLLinkElement) {
        sig += `:l${node.href}`;
      }
    }
    if (sig === cachedStylesSignature && cachedStylesOutput) {
      return cachedStylesOutput;
    }

    const chunks: string[] = [];
    for (const sheet of sheets) {
      try {
        const rules = sheet.cssRules;
        if (rules && rules.length > 0) {
          let css = '';
          for (let i = 0; i < rules.length; i++) {
            css += rules[i].cssText + '\n';
          }
          chunks.push(`<style>${css}</style>`);
          continue;
        }
      } catch {
        // Cross-origin stylesheet (Google Fonts 등)은 link 태그로 유지
      }
      if (sheet.ownerNode instanceof HTMLElement) {
        chunks.push(sheet.ownerNode.outerHTML);
      }
    }
    cachedStylesSignature = sig;
    cachedStylesOutput = chunks.join('\n');
    return cachedStylesOutput;
  } catch {
    const styleNodes = Array.from(document.querySelectorAll('link[rel="stylesheet"], style'));
    return styleNodes.map((n) => n.outerHTML).join('\n');
  }
}

const persistentImageDataUrlCache = new Map<string, string>();
const MAX_IMAGE_CACHE_ENTRIES = 600;

/**
 * 인쇄 컨테이너 내 <img> 요소를 data URL로 사전 인라인화하여
 * 헤드리스 브라우저가 인증/세션 없이도 모든 문항 이미지를 즉시 렌더링하도록 합니다.
 * 동일 세션 내 이미 변환된 이미지는 메모리 캐시에서 즉시 재사용합니다.
 */
export async function inlineImagesInElement(container: HTMLElement): Promise<void> {
  const imgs = Array.from(container.querySelectorAll('img'));

  await Promise.all(
    imgs.map(async (img) => {
      const src = img.getAttribute('src') || '';
      if (!src || src.startsWith('data:') || src.startsWith('blob:')) return;

      const cached = persistentImageDataUrlCache.get(src);
      if (cached) {
        img.setAttribute('src', cached);
        return;
      }

      try {
        const resolvedUrl = new URL(src, window.location.href).href;
        const cachedResolved = persistentImageDataUrlCache.get(resolvedUrl);
        if (cachedResolved) {
          img.setAttribute('src', cachedResolved);
          return;
        }

        const resp = await fetch(resolvedUrl, { credentials: 'include' });
        if (!resp.ok) return;
        const blob = await resp.blob();
        const dataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(String(reader.result || ''));
          reader.onerror = reject;
          reader.readAsDataURL(blob);
        });
        if (dataUrl) {
          if (persistentImageDataUrlCache.size >= MAX_IMAGE_CACHE_ENTRIES) {
            const firstKey = persistentImageDataUrlCache.keys().next().value;
            if (firstKey) persistentImageDataUrlCache.delete(firstKey);
          }
          persistentImageDataUrlCache.set(src, dataUrl);
          persistentImageDataUrlCache.set(resolvedUrl, dataUrl);
          img.setAttribute('src', dataUrl);
        }
      } catch {
        // CORS 제한 외부 이미지는 절대 URL로 변환해 fallback
        try {
          img.setAttribute('src', new URL(src, window.location.href).href);
        } catch {
          // keep original
        }
      }
    })
  );
}
