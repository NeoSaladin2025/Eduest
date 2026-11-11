'use client';

import { ExamPaper, ExamQuestion } from '@/app/api/test2/exam/route';

export interface ExamPdfOptions {
  academyName?: string;
  questionsPerPage?: 1 | 2 | 4;
  columns?: 1 | 2;
  includeAnswerKey?: boolean;
  onProgress?: (status: string) => void;
}

/**
 * 파일명 특수문자 제거
 */
function sanitizeFileName(name: string): string {
  return name.replace(/[\\/:*?"<>|]/g, '_').trim();
}

/**
 * 시험지를 A4 규격 벡터 PDF(인쇄/PDF저장 다이렉트 창)로 즉시 띄워주는 초고속 엔진 (방식 2)
 * - html2canvas 백지 버그 원천 차단
 * - 브라우저 네이티브 벡터 엔진을 통해 텍스트 검색/복사가 가능한 초고화질 PDF 즉시 생성
 */
export async function downloadExamAsPdf(
  exam: ExamPaper,
  options?: ExamPdfOptions
): Promise<boolean> {
  if (!exam || !exam.questions || exam.questions.length === 0) {
    alert('시험지에 문항이 존재하지 않습니다.');
    return false;
  }

  const academyName = options?.academyName || 'Eduest 수학학원';
  const questionsPerPage = options?.questionsPerPage || 4;
  const columns = options?.columns || (questionsPerPage === 1 ? 1 : 2);
  const includeAnswerKey = options?.includeAnswerKey !== false;
  const onProgress = options?.onProgress || (() => {});

  onProgress('문서 준비 중...');

  // 1. 현재 문서의 모든 Tailwind/전역 스타일 태그 추출
  const styleNodes = Array.from(document.querySelectorAll('link[rel="stylesheet"], style'));
  const combinedStyles = styleNodes
    .map(node => node.outerHTML)
    .join('\n');

  // 2. 문항을 페이지 단위로 분할
  const pages: ExamQuestion[][] = [];
  for (let i = 0; i < exam.questions.length; i += questionsPerPage) {
    pages.push(exam.questions.slice(i, i + questionsPerPage));
  }

  const totalProblemPages = pages.length;
  const totalPages = includeAnswerKey ? totalProblemPages + 1 : totalProblemPages;

  // 3. A4 페이지별 HTML 생성
  let sheetsHtml = '';

  pages.forEach((pageQuestions, pageIdx) => {
    const pageNumber = pageIdx + 1;
    const isFirstPage = pageNumber === 1;

    let headerHtml = '';
    if (isFirstPage) {
      headerHtml = `
        <div style="border-bottom: 2px solid #0f172a; padding-bottom: 8px; margin-bottom: 8px;">
          <div style="display: flex; justify-content: space-between; align-items: flex-start;">
            <div>
              <div style="font-size: 11px; font-weight: 800; color: #475569; letter-spacing: 1px; margin-bottom: 2px;">
                ${academyName} · 정기 평가
              </div>
              <h1 style="font-size: 18px; font-weight: 900; color: #0f172a; margin: 0; line-height: 1.2;">
                ${exam.title}
              </h1>
              <div style="font-size: 10px; font-weight: 600; color: #64748b; margin-top: 4px;">
                총 ${exam.questions.length}문항 · 제한시간 ${exam.duration_min || 50}분
              </div>
            </div>
            <div style="display: flex; border: 1.5px solid #0f172a; border-radius: 6px; overflow: hidden; text-align: center; font-size: 11px;">
              <div style="border-right: 1px solid #cbd5e1; width: 65px;">
                <div style="background: #f1f5f9; padding: 3px 0; font-weight: 800; font-size: 10px; color: #334155;">성명</div>
                <div style="height: 28px; line-height: 28px; font-weight: 900; font-size: 12px; color: #0f172a;"></div>
              </div>
              <div style="border-right: 1px solid #cbd5e1; width: 60px;">
                <div style="background: #f1f5f9; padding: 3px 0; font-weight: 800; font-size: 10px; color: #334155;">점수</div>
                <div style="height: 28px; line-height: 28px; font-weight: 900; font-size: 12px; color: #e11d48;">/ 100</div>
              </div>
              <div style="width: 60px;">
                <div style="background: #f1f5f9; padding: 3px 0; font-weight: 800; font-size: 10px; color: #334155;">확인</div>
                <div style="height: 28px; line-height: 28px;"></div>
              </div>
            </div>
          </div>
        </div>
      `;
    } else {
      headerHtml = `
        <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #cbd5e1; padding-bottom: 5px; margin-bottom: 8px; font-size: 10px; font-weight: 700; color: #64748b;">
          <span>${exam.title}</span>
          <span>${academyName}</span>
        </div>
      `;
    }

    const questionCardsHtml = pageQuestions
      .map((q, qSubIdx) => {
        const globalQNum = pageIdx * questionsPerPage + qSubIdx + 1;
        const points = q.points || 4;

        return `
          <div class="eduest-q-card">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
              <div style="display: flex; align-items: center; gap: 6px;">
                <span style="display: inline-flex; align-items: center; justify-content: center; width: 22px; height: 22px; border-radius: 6px; background: #0f172a; color: #ffffff; font-size: 11px; font-weight: 900;">
                  ${globalQNum}
                </span>
                <span style="font-size: 10px; font-weight: 800; color: #475569;">
                  [${points}.0점]
                </span>
                ${
                  q.is_descriptive
                    ? `<span style="font-size: 9px; font-weight: 800; padding: 1px 5px; border-radius: 4px; background: #fef2f2; color: #991b1b; border: 1px solid #fecaca;">서술형</span>`
                    : ''
                }
              </div>
              <span style="font-size: 9px; color: #94a3b8; font-weight: 600;">
                ${q.name ? q.name.replace(/\\.html?$/i, '') : ''}
              </span>
            </div>

            <div style="flex: 1; display: flex; align-items: flex-start; justify-content: center; overflow: hidden;">
              ${
                q.image_url
                  ? `<img src="${q.image_url}" class="eduest-q-img" alt="문항 ${globalQNum}" />`
                  : `<div style="padding: 20px; text-align: center; color: #94a3b8; font-size: 11px;">문제 이미지 없음</div>`
              }
            </div>

            ${
              questionsPerPage === 1
                ? `
                <div style="margin-top: 15px; min-height: 80mm; border: 1px dashed #cbd5e1; border-radius: 8px; padding: 10px; display: flex; flex-direction: column; justify-content: space-between;">
                  <span style="font-size: 10px; font-weight: 700; color: #94a3b8;">[풀이 과정 및 정답 작성란]</span>
                  <div style="text-align: right; font-size: 11px; font-weight: 800; color: #1e293b;">정답: ______________________</div>
                </div>
              `
                : ''
            }
          </div>
        `;
      })
      .join('');

    const footerHtml = `
      <div style="display: flex; justify-content: space-between; align-items: center; border-top: 1px solid #e2e8f0; padding-top: 5px; margin-top: 8px; font-size: 10px; font-weight: 700; color: #64748b;">
        <span>Eduest Smart Assessment System</span>
        <span style="font-weight: 900; color: #0f172a;">${pageNumber} / ${totalPages}</span>
        <span>${academyName}</span>
      </div>
    `;

    sheetsHtml += `
      <div class="a4-print-sheet">
        <div>
          ${headerHtml}
          <div class="${columns === 1 ? 'eduest-grid-1col' : 'eduest-grid-2col'}">
            ${questionCardsHtml}
          </div>
        </div>
        ${footerHtml}
      </div>
    `;
  });

  // 4. 빠른 정답표 시트
  if (includeAnswerKey) {
    const answerRows = exam.questions.map((q, idx) => ({
      num: idx + 1,
      answer: q.answer || q.raw_answer || '-',
      points: q.points || 4,
      type: q.is_descriptive ? '서술형' : '객관식',
    }));

    const midIdx = Math.ceil(answerRows.length / 2);
    const colLeft = answerRows.slice(0, midIdx);
    const colRight = answerRows.slice(midIdx);

    const renderTable = (items: typeof answerRows) => `
      <table style="width: 100%; border-collapse: collapse; font-size: 11px; text-align: center;">
        <thead>
          <tr style="background: #f1f5f9; border-bottom: 2px solid #0f172a;">
            <th style="padding: 6px; width: 40px; font-weight: 900;">번호</th>
            <th style="padding: 6px; font-weight: 900;">정답</th>
            <th style="padding: 6px; width: 45px; font-weight: 900;">배점</th>
            <th style="padding: 6px; width: 55px; font-weight: 900;">유형</th>
          </tr>
        </thead>
        <tbody>
          ${items
            .map(
              item => `
            <tr style="border-bottom: 1px solid #e2e8f0;">
              <td style="padding: 5px; font-weight: 800; background: #fafafa;">${item.num}</td>
              <td style="padding: 5px; font-weight: 900; color: #2563eb; font-size: 12px;">${item.answer}</td>
              <td style="padding: 5px; font-weight: 700; color: #64748b;">${item.points}.0</td>
              <td style="padding: 5px; font-size: 10px; font-weight: 600; color: ${item.type === '서술형' ? '#dc2626' : '#475569'};">${item.type}</td>
            </tr>
          `
            )
            .join('')}
        </tbody>
      </table>
    `;

    const answerKeySheetHtml = `
      <div class="a4-print-sheet">
        <div>
          <div style="border-bottom: 2px solid #0f172a; padding-bottom: 8px; margin-bottom: 15px;">
            <div style="font-size: 11px; font-weight: 800; color: #475569; letter-spacing: 1px; margin-bottom: 2px;">
              ${academyName} · 교사용 정답 및 배점표
            </div>
            <h1 style="font-size: 18px; font-weight: 900; color: #0f172a; margin: 0;">
              [빠른 정답표] ${exam.title}
            </h1>
          </div>

          <div style="display: grid; grid-template-columns: 1fr 1fr; column-gap: 12mm; align-items: start;">
            <div>${renderTable(colLeft)}</div>
            <div>${colRight.length > 0 ? renderTable(colRight) : ''}</div>
          </div>
        </div>

        <div style="display: flex; justify-content: space-between; align-items: center; border-top: 1px solid #e2e8f0; padding-top: 5px; font-size: 10px; font-weight: 700; color: #64748b;">
          <span>Eduest Smart Assessment System (정답 및 배점표)</span>
          <span style="font-weight: 900; color: #0f172a;">${totalPages} / ${totalPages}</span>
          <span>${academyName}</span>
        </div>
      </div>
    `;

    sheetsHtml += answerKeySheetHtml;
  }

  // 5. 풀 문서 HTML 조립
  const fullDocumentHtml = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>${sanitizeFileName(exam.title || '시험지')} - 시험지 PDF</title>
        ${combinedStyles}
        <style>
          @page {
            size: A4 portrait;
            margin: 0;
          }
          *, *::before, *::after {
            box-sizing: border-box;
          }
          html, body {
            margin: 0 !important;
            padding: 0 !important;
            background: #ffffff !important;
            color: #000000 !important;
            width: 210mm !important;
            height: auto !important;
            overflow: visible !important;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          .a4-print-sheet {
            display: flex !important;
            flex-direction: column !important;
            justify-content: space-between !important;
            width: 210mm !important;
            height: 297mm !important;
            min-height: 297mm !important;
            max-height: 297mm !important;
            box-sizing: border-box !important;
            margin: 0 !important;
            padding: 8mm 10mm !important;
            page-break-before: auto !important;
            page-break-after: always !important;
            page-break-inside: avoid !important;
            break-after: page !important;
            break-inside: avoid !important;
            background: #ffffff !important;
            overflow: hidden !important;
          }
          .a4-print-sheet:last-child {
            page-break-after: auto !important;
            break-after: auto !important;
          }
          .eduest-grid-2col {
            display: grid;
            grid-template-columns: 1fr 1fr;
            column-gap: 8mm;
            row-gap: 5mm;
            flex: 1;
          }
          .eduest-grid-1col {
            display: flex;
            flex-direction: column;
            gap: 6mm;
            flex: 1;
          }
          .eduest-q-card {
            display: flex;
            flex-direction: column;
            border-radius: 8px;
            overflow: hidden;
            border: 1px solid #cbd5e1;
            padding: 8px 10px;
            background: #ffffff;
            height: 100%;
            box-sizing: border-box;
          }
          .eduest-q-img {
            width: 100%;
            height: auto;
            max-height: ${questionsPerPage === 1 ? '160mm' : questionsPerPage === 2 ? '115mm' : '90mm'};
            object-fit: contain;
            object-position: top;
          }
        </style>
      </head>
      <body>
        <div id="eduest-print-area">
          ${sheetsHtml}
        </div>
      </body>
    </html>
  `;

  onProgress('PDF 인쇄창 로딩 중...');

  // 6. 독립 iframe을 통한 안전한 네이티브 벡터 렌더링 및 인쇄/PDF 저장창 실행
  return new Promise((resolve) => {
    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = '0';
    iframe.style.visibility = 'hidden';
    document.body.appendChild(iframe);

    const doc = iframe.contentWindow?.document;
    if (!doc) {
      if (document.body.contains(iframe)) document.body.removeChild(iframe);
      resolve(false);
      return;
    }

    doc.open();
    doc.write(fullDocumentHtml);
    doc.close();

    let isFinished = false;
    let checkTimer: NodeJS.Timeout | null = null;
    let maxTimer: NodeJS.Timeout | null = null;

    const finish = () => {
      if (isFinished) return;
      isFinished = true;
      if (checkTimer) clearInterval(checkTimer);
      if (maxTimer) clearTimeout(maxTimer);

      window.removeEventListener('afterprint', finish);
      iframe.contentWindow?.removeEventListener('afterprint', finish);

      setTimeout(() => {
        try {
          if (document.body.contains(iframe)) {
            document.body.removeChild(iframe);
          }
        } catch (e) {
          // ignore
        }
      }, 300);

      onProgress('완료!');
      resolve(true);
    };

    const startPrint = async () => {
      try {
        // iframe 내부 이미지 로딩 대기
        const iframeImages = Array.from(doc.images);
        await Promise.all(
          iframeImages.map(img => {
            if (img.complete) return Promise.resolve(true);
            return new Promise(r => {
              img.onload = () => r(true);
              img.onerror = () => r(false);
            });
          })
        );

        // 렌더링 안정화 대기
        await new Promise(r => setTimeout(r, 250));

        window.addEventListener('afterprint', finish, { once: true });
        iframe.contentWindow?.addEventListener('afterprint', finish, { once: true });

        iframe.contentWindow?.focus();
        iframe.contentWindow?.print();

        // 포커스 복귀 감지
        let stableTicks = 0;
        checkTimer = setInterval(() => {
          if (document.hasFocus()) {
            stableTicks++;
            if (stableTicks >= 4) {
              finish();
            }
          } else {
            stableTicks = 0;
          }
        }, 300);

        // 최대 60초 타임아웃
        maxTimer = setTimeout(finish, 60000);
      } catch (err) {
        console.error('startPrint error:', err);
        finish();
      }
    };

    startPrint();
  });
}
