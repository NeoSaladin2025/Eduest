'use client';

import { ExamPaper, ExamQuestion } from '@/app/api/test2/exam/route';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';

export interface PdfProgressInfo {
  current: number;
  total: number;
  percent: number;
  message: string;
}

export interface ExamPdfOptions {
  academyName?: string;
  questionsPerPage?: 1 | 2 | 4;
  columns?: 1 | 2;
  includeAnswerKey?: boolean;
  onProgress?: (progress: PdfProgressInfo) => void;
}

/**
 * 파일명에서 특수문자 제거
 */
function sanitizeFileName(name: string): string {
  return name.replace(/[\\/:*?"<>|]/g, '_').trim();
}

/**
 * 1:1 순차 페이지 렌더링 기반 100% 방탄 PDF 파일 다운로더 (방식 1 개량형)
 * - window.print()를 절대 호출하지 않아 키오스크 종이 인쇄(--kiosk-printing)와 완전 독립
 * - 1페이지씩 정좌표(0,0)에서 렌더링하고 jsPDF에 합쳐 캔버스 메모리 초과 및 백지 버그 0%
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

  // 1. 문항 페이지 분할
  const pages: ExamQuestion[][] = [];
  for (let i = 0; i < exam.questions.length; i += questionsPerPage) {
    pages.push(exam.questions.slice(i, i + questionsPerPage));
  }

  const totalProblemPages = pages.length;
  const totalPages = includeAnswerKey ? totalProblemPages + 1 : totalProblemPages;

  onProgress({
    current: 0,
    total: totalPages,
    percent: 0,
    message: 'PDF 렌더링 스테이지 초기화 중...',
  });

  // 2. 단일 페이지용 고정 크기 A4 스테이지 생성 (뷰포트 상단 0,0)
  // zIndex 99990으로 배치하여 로딩 모달(zIndex 99999) 뒤에서 안전하게 렌더링
  const stage = document.createElement('div');
  stage.id = 'eduest-pdf-page-stage';
  stage.style.position = 'fixed';
  stage.style.top = '0';
  stage.style.left = '0';
  stage.style.width = '794px';
  stage.style.height = '1123px';
  stage.style.zIndex = '99990';
  stage.style.background = '#ffffff';
  stage.style.overflow = 'hidden';
  stage.style.pointerEvents = 'none';
  stage.style.boxSizing = 'border-box';
  document.body.appendChild(stage);

  // 3. jsPDF 인스턴스 생성 (A4, mm)
  const pdf = new jsPDF({
    unit: 'mm',
    format: 'a4',
    orientation: 'portrait',
    compress: true,
  });

  try {
    // 4. 페이지별 1:1 순차 렌더링 및 캡처 루프
    for (let pageIdx = 0; pageIdx < totalPages; pageIdx++) {
      const pageNumber = pageIdx + 1;
      const isAnswerKeyPage = pageIdx >= totalProblemPages;
      const isFirstPage = pageNumber === 1;

      onProgress({
        current: pageNumber,
        total: totalPages,
        percent: Math.round(((pageIdx) / totalPages) * 100),
        message: isAnswerKeyPage
          ? '빠른 정답표 렌더링 중...'
          : `${pageNumber}쪽 문항 렌더링 중 (${(pageIdx * questionsPerPage) + 1}~${Math.min((pageIdx + 1) * questionsPerPage, exam.questions.length)}번)...`,
      });

      let pageHtml = '';

      if (!isAnswerKeyPage) {
        // 문제 페이지 HTML
        const pageQuestions = pages[pageIdx];

        let headerHtml = '';
        if (isFirstPage) {
          headerHtml = `
            <div style="border-bottom: 2.5px solid #0f172a; padding-bottom: 10px; margin-bottom: 12px;">
              <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                <div>
                  <div style="font-size: 11px; font-weight: 800; color: #475569; letter-spacing: 1px; margin-bottom: 2px;">
                    ${academyName} · 정기 평가
                  </div>
                  <h1 style="font-size: 20px; font-weight: 900; color: #0f172a; margin: 0; line-height: 1.2;">
                    ${exam.title}
                  </h1>
                  <div style="font-size: 11px; font-weight: 600; color: #64748b; margin-top: 4px;">
                    총 ${exam.questions.length}문항 · 제한시간 ${exam.duration_min || 50}분
                  </div>
                </div>
                <div style="display: flex; border: 1.5px solid #0f172a; border-radius: 6px; overflow: hidden; text-align: center; font-size: 11px;">
                  <div style="border-right: 1px solid #cbd5e1; width: 68px;">
                    <div style="background: #f1f5f9; padding: 4px 0; font-weight: 800; font-size: 10px; color: #334155;">성명</div>
                    <div style="height: 30px; line-height: 30px; font-weight: 900; font-size: 12px; color: #0f172a;"></div>
                  </div>
                  <div style="border-right: 1px solid #cbd5e1; width: 64px;">
                    <div style="background: #f1f5f9; padding: 4px 0; font-weight: 800; font-size: 10px; color: #334155;">점수</div>
                    <div style="height: 30px; line-height: 30px; font-weight: 900; font-size: 12px; color: #e11d48;">/ 100</div>
                  </div>
                  <div style="width: 60px;">
                    <div style="background: #f1f5f9; padding: 4px 0; font-weight: 800; font-size: 10px; color: #334155;">확인</div>
                    <div style="height: 30px; line-height: 30px;"></div>
                  </div>
                </div>
              </div>
            </div>
          `;
        } else {
          headerHtml = `
            <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #cbd5e1; padding-bottom: 6px; margin-bottom: 12px; font-size: 11px; font-weight: 700; color: #64748b;">
              <span>${exam.title}</span>
              <span>${academyName}</span>
            </div>
          `;
        }

        const cardsHtml = pageQuestions
          .map((q, qSubIdx) => {
            const globalQNum = pageIdx * questionsPerPage + qSubIdx + 1;
            const points = q.points || 4;
            const maxImgHeight = questionsPerPage === 1 ? '550px' : questionsPerPage === 2 ? '420px' : '320px';

            return `
              <div style="display: flex; flex-direction: column; border-radius: 8px; overflow: hidden; border: 1px solid #cbd5e1; padding: 10px 12px; background: #ffffff; height: 100%; box-sizing: border-box;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                  <div style="display: flex; align-items: center; gap: 6px;">
                    <span style="display: inline-flex; align-items: center; justify-content: center; width: 24px; height: 24px; border-radius: 6px; background: #0f172a; color: #ffffff; font-size: 12px; font-weight: 900;">
                      ${globalQNum}
                    </span>
                    <span style="font-size: 11px; font-weight: 800; color: #475569;">
                      [${points}.0점]
                    </span>
                    ${
                      q.is_descriptive
                        ? `<span style="font-size: 10px; font-weight: 800; padding: 1px 6px; border-radius: 4px; background: #fef2f2; color: #991b1b; border: 1px solid #fecaca;">서술형</span>`
                        : ''
                    }
                  </div>
                  <span style="font-size: 10px; color: #94a3b8; font-weight: 600;">
                    ${q.name ? q.name.replace(/\.html?$/i, '') : ''}
                  </span>
                </div>

                <div style="flex: 1; display: flex; align-items: flex-start; justify-content: center; overflow: hidden;">
                  ${
                    q.image_url
                      ? `<img src="${q.image_url}" crossOrigin="anonymous" style="width: 100%; height: auto; max-height: ${maxImgHeight}; object-fit: contain; object-position: top;" alt="문항 ${globalQNum}" />`
                      : `<div style="padding: 30px; text-align: center; color: #94a3b8; font-size: 12px;">문제 이미지 없음</div>`
                  }
                </div>

                ${
                  questionsPerPage === 1
                    ? `
                    <div style="margin-top: 15px; min-height: 280px; border: 1px dashed #cbd5e1; border-radius: 8px; padding: 10px; display: flex; flex-direction: column; justify-content: space-between;">
                      <span style="font-size: 11px; font-weight: 700; color: #94a3b8;">[풀이 과정 및 정답 작성란]</span>
                      <div style="text-align: right; font-size: 12px; font-weight: 800; color: #1e293b;">정답: ______________________</div>
                    </div>
                  `
                    : ''
                }
              </div>
            `;
          })
          .join('');

        const gridStyle = columns === 1
          ? 'display: flex; flex-direction: column; gap: 15px; flex: 1;'
          : 'display: grid; grid-template-columns: 1fr 1fr; column-gap: 16px; row-gap: 14px; flex: 1;';

        const footerHtml = `
          <div style="display: flex; justify-content: space-between; align-items: center; border-top: 1px solid #e2e8f0; padding-top: 8px; margin-top: 10px; font-size: 10px; font-weight: 700; color: #64748b;">
            <span>Eduest Smart Assessment System</span>
            <span style="font-weight: 900; color: #0f172a;">${pageNumber} / ${totalPages}</span>
            <span>${academyName}</span>
          </div>
        `;

        pageHtml = `
          <div style="width: 794px; height: 1123px; padding: 32px 36px; box-sizing: border-box; background: #ffffff; color: #0f172a; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; display: flex; flex-direction: column; justify-content: space-between;">
            <div>
              ${headerHtml}
              <div style="${gridStyle}">
                ${cardsHtml}
              </div>
            </div>
            ${footerHtml}
          </div>
        `;
      } else {
        // 마지막 빠른 정답표 페이지 HTML
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
                <th style="padding: 6px; width: 45px; font-weight: 900;">번호</th>
                <th style="padding: 6px; font-weight: 900;">정답</th>
                <th style="padding: 6px; width: 50px; font-weight: 900;">배점</th>
                <th style="padding: 6px; width: 60px; font-weight: 900;">유형</th>
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

        pageHtml = `
          <div style="width: 794px; height: 1123px; padding: 32px 36px; box-sizing: border-box; background: #ffffff; color: #0f172a; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; display: flex; flex-direction: column; justify-content: space-between;">
            <div>
              <div style="border-bottom: 2.5px solid #0f172a; padding-bottom: 10px; margin-bottom: 20px;">
                <div style="font-size: 11px; font-weight: 800; color: #475569; letter-spacing: 1px; margin-bottom: 2px;">
                  ${academyName} · 교사용 정답 및 배점표
                </div>
                <h1 style="font-size: 20px; font-weight: 900; color: #0f172a; margin: 0;">
                  [빠른 정답표] ${exam.title}
                </h1>
              </div>

              <div style="display: grid; grid-template-columns: 1fr 1fr; column-gap: 20px; align-items: start;">
                <div>${renderTable(colLeft)}</div>
                <div>${colRight.length > 0 ? renderTable(colRight) : ''}</div>
              </div>
            </div>

            <div style="display: flex; justify-content: space-between; align-items: center; border-top: 1px solid #e2e8f0; padding-top: 8px; font-size: 10px; font-weight: 700; color: #64748b;">
              <span>Eduest Smart Assessment System (정답 및 배점표)</span>
              <span style="font-weight: 900; color: #0f172a;">${totalPages} / ${totalPages}</span>
              <span>${academyName}</span>
            </div>
          </div>
        `;
      }

      // 5. 스테이지에 HTML 삽입 및 이미지 로드 완료 대기
      stage.innerHTML = pageHtml;

      const pageImgs = Array.from(stage.querySelectorAll('img'));
      await Promise.all(
        pageImgs.map(img => {
          if (img.complete) return Promise.resolve(true);
          return new Promise(r => {
            img.onload = () => r(true);
            img.onerror = () => r(false);
          });
        })
      );

      // 레이아웃 안정화 딜레이
      await new Promise(r => setTimeout(r, 60));

      // 6. html2canvas로 현재 단일 페이지만 캡처 (A4 1:1)
      const canvas = await html2canvas(stage, {
        scale: 1.5,
        useCORS: true,
        logging: false,
        scrollY: 0,
        scrollX: 0,
        width: 794,
        height: 1123,
        windowWidth: 794,
        windowHeight: 1123,
      });

      const imgData = canvas.toDataURL('image/jpeg', 0.95);
      if (pageIdx > 0) {
        pdf.addPage('a4', 'portrait');
      }
      pdf.addImage(imgData, 'JPEG', 0, 0, 210, 297);
    }

    onProgress({
      current: totalPages,
      total: totalPages,
      percent: 100,
      message: 'PDF 파일 저장 중...',
    });

    // 7. 브라우저 다운로드 폴더로 직접 파일 저장 (window.print 미호출)
    const safeTitle = sanitizeFileName(exam.title || '시험지');
    pdf.save(`${safeTitle}_시험지.pdf`);

    return true;
  } catch (err) {
    console.error('downloadExamAsPdf error:', err);
    throw err;
  } finally {
    // 8. 렌더 스테이지 정리
    if (document.body.contains(stage)) {
      document.body.removeChild(stage);
    }
  }
}
