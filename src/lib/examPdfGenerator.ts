'use client';

import { ExamPaper, ExamQuestion } from '@/app/api/test2/exam/route';
import { parseExamRoundAndBaseTitle } from '@/app/teacher/exammgr/treasureTypes';
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
  showAcademyName?: boolean;
  showStudentName?: boolean;
  showClassName?: boolean;
  showPoints?: boolean;
  showFolderInfo?: boolean;
  showCenterDivider?: boolean;
  customStudentName?: string;
  customClassName?: string;
  selectedPages?: number[];
  selectedChip?: string;
  titleFontSize?: 'small' | 'medium' | 'normal' | 'large';
  headerDensity?: 'normal' | 'compact';
  marginPreset?: 'ultracompact' | 'compact' | 'normal' | 'custom';
  onProgress?: (progress: PdfProgressInfo) => void;
}

/**
 * 파일명에서 윈도우/OS 금지 특수문자 안전 치환
 */
function sanitizeFileName(name: string): string {
  return name.replace(/[\\/:*?"<>|]/g, '_').trim();
}

interface AnswerRowItem {
  globalIndex: number;
  q: ExamQuestion;
  points: number;
  type: string;
  answer: string;
}

interface AnswerPageData {
  ansPageIdx: number;
  isFirstPage: boolean;
  leftItems: AnswerRowItem[];
  rightItems: AnswerRowItem[];
}

/**
 * 🌟 시험지 인쇄 원본과 100% 동일한 A4 클론 레이아웃 기반 고품질 PDF 다운로더
 * - window.print()를 일절 호출하지 않아 브라우저 키오스크 인쇄(--kiosk-printing) 물리 출력과 완전 독립
 * - 전통 한국 학원 시험지 규격 (좌/우 N자형 세로배열, 중앙 구분선, 문제 테두리 박스 없는 클린 레이아웃)
 * - 1페이지씩 뷰포트 정좌표(0,0)에서 A4 크기로 렌더링 후 jsPDF에 취합하여 백지/메모리 오류 0% 보장
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
  const showAcademyName = options?.showAcademyName !== false;
  const questionsPerPage = options?.questionsPerPage || 4;
  const columns = options?.columns || (questionsPerPage === 1 ? 1 : 2);
  const includeAnswerKey = options?.includeAnswerKey !== false;
  const showPoints = options?.showPoints !== false;
  const showFolderInfo = options?.showFolderInfo !== false;
  const showCenterDivider = options?.showCenterDivider !== false;
  const onProgress = options?.onProgress || (() => {});
  const marginPreset = options?.marginPreset || 'normal';

  // 1. 시험지 타이틀 및 회차, 수험자 메타데이터 정밀 파싱
  const parsed = parseExamRoundAndBaseTitle(exam.title);
  const baseParsed = exam.base_exam_title ? parseExamRoundAndBaseTitle(exam.base_exam_title) : parsed;
  const cleanTitle = baseParsed.cleanBaseTitle || parsed.cleanBaseTitle || exam.title;

  const isTreasure = Boolean(exam.is_treasure_hunt || parsed.isTreasure);
  const roundNum = exam.wrong_round || parsed.currentRound;
  const isTwinVariant =
    exam.is_twin_variant !== undefined
      ? Boolean(exam.is_twin_variant)
      : (Array.isArray(exam.questions) && exam.questions.some((q: any) => q.is_twin)) ||
        (/^\[[^\]]*쌍둥이/i.test(exam.title) && parsed.isTwin);

  const studentName =
    options?.showStudentName === false
      ? ''
      : (options?.customStudentName || exam.target_student_name || parsed.studentName || '');
  const className =
    options?.showClassName === false
      ? ''
      : (options?.customClassName || exam.grade || '');

  // 2. 문항 본문 페이지 분할
  const rawProblemPages: ExamQuestion[][] = [];
  for (let i = 0; i < exam.questions.length; i += questionsPerPage) {
    rawProblemPages.push(exam.questions.slice(i, i + questionsPerPage));
  }

  // 3. 빠른 정답표 페이지 분할 (2단 컴팩트 레이아웃)
  const allAnswerRows: AnswerRowItem[] = exam.questions.map((q, idx) => ({
    globalIndex: idx + 1,
    q,
    points: q.points || (q.is_descriptive ? 5 : 4),
    type: q.is_descriptive ? '서술형' : '객관식',
    answer: q.answer || q.raw_answer || '-',
  }));

  const answerPages: AnswerPageData[] = [];
  if (includeAnswerKey) {
    let curAnsIdx = 0;
    let ansPageIdx = 0;
    while (curAnsIdx < allAnswerRows.length) {
      const isFirst = ansPageIdx === 0;
      // 1페이지는 메인 헤더 공간 감안하여 36문항, 2페이지 이후는 44문항 배치
      const capacity = isFirst ? 36 : 44;
      const pageSlice = allAnswerRows.slice(curAnsIdx, curAnsIdx + capacity);
      curAnsIdx += pageSlice.length;

      const half = Math.ceil(pageSlice.length / 2);
      answerPages.push({
        ansPageIdx,
        isFirstPage: isFirst,
        leftItems: pageSlice.slice(0, half),
        rightItems: pageSlice.slice(half),
      });
      ansPageIdx++;
    }
  }

  // 4. 전체 페이지 인덱스 리스트 구성 및 사용자 선택 페이지 필터링
  type PageTask =
    | { kind: 'problem'; pageIndex: number; pageNumber: number; questions: ExamQuestion[] }
    | { kind: 'answer'; pageIndex: number; pageNumber: number; data: AnswerPageData };

  const allPageTasks: PageTask[] = [];
  let pageCounter = 1;

  rawProblemPages.forEach((questions, idx) => {
    allPageTasks.push({
      kind: 'problem',
      pageIndex: idx,
      pageNumber: pageCounter++,
      questions,
    });
  });

  answerPages.forEach((data, idx) => {
    allPageTasks.push({
      kind: 'answer',
      pageIndex: idx,
      pageNumber: pageCounter++,
      data,
    });
  });

  const selectedPagesSet = options?.selectedPages && options.selectedPages.length > 0
    ? new Set(options.selectedPages)
    : null;

  const targetPages = selectedPagesSet
    ? allPageTasks.filter(t => selectedPagesSet.has(t.pageNumber))
    : allPageTasks;

  if (targetPages.length === 0) {
    alert('인쇄 대상 페이지가 선택되지 않았습니다.');
    return false;
  }

  const totalPages = allPageTasks.length;

  onProgress({
    current: 0,
    total: targetPages.length,
    percent: 0,
    message: 'PDF 렌더링 준비 중...',
  });

  // 5. 단일 페이지용 고정 A4 스테이지 생성 (뷰포트 상단 0,0)
  // zIndex 99990으로 배치하여 로딩 모달(zIndex 99999) 뒤에서 자연스럽게 렌더링
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

  // 6. jsPDF 인스턴스 생성 (A4, mm)
  const pdf = new jsPDF({
    unit: 'mm',
    format: 'a4',
    orientation: 'portrait',
    compress: true,
  });

  // 여백 프리셋 계산
  const paddingCss =
    marginPreset === 'ultracompact'
      ? '20px 24px 18px 24px'
      : marginPreset === 'compact'
      ? '28px 36px 24px 36px'
      : '36px 44px 30px 44px';

  try {
    for (let taskIdx = 0; taskIdx < targetPages.length; taskIdx++) {
      const task = targetPages[taskIdx];
      const isFirstPage = task.pageNumber === 1;

      onProgress({
        current: taskIdx + 1,
        total: targetPages.length,
        percent: Math.round(((taskIdx) / targetPages.length) * 100),
        message: task.kind === 'answer'
          ? `정답표 페이지 생성 중 (${task.data.ansPageIdx + 1}/${answerPages.length})...`
          : `${task.pageNumber}쪽 문항 렌더링 중...`,
      });

      let pageContentHtml = '';

      if (task.kind === 'problem') {
        // [문항 페이지 렌더링]
        const pageQuestions = task.questions;

        // A. 상단 헤더
        let headerHtml = '';
        if (isFirstPage) {
          // 1페이지 메인 헤더: 학원 시험지 전통 스타일 상단 박스 + 아이브로우 뱃지 + 수험자 기재란
          let eyebrowHtml = '';
          if (isTreasure) {
            eyebrowHtml = `
              <div style="margin-bottom: 4px;">
                <span style="display: inline-flex; align-items: center; gap: 4px; padding: 2px 7px; border-radius: 4px; font-size: 10px; font-weight: 900; background: #fef3c7; color: #451a03; border: 1px solid #fcd34d;">
                  <span>✨ 💎 보물회수 ${roundNum > 0 ? `${roundNum}회차` : ''}</span>
                  <span style="opacity: 0.85; font-weight: 700;">• ${isTwinVariant ? '쌍둥이(변형)' : '원본'}</span>
                </span>
              </div>
            `;
          } else if (exam.is_wrong_review || roundNum > 0 || parsed.isWrong) {
            eyebrowHtml = `
              <div style="margin-bottom: 4px;">
                <span style="display: inline-flex; align-items: center; gap: 4px; padding: 2px 7px; border-radius: 4px; font-size: 10px; font-weight: 900; background: #ffe4e6; color: #881337; border: 1px solid #fda4af;">
                  <span>↺ 오답 ${roundNum > 0 ? `${roundNum}회차` : '클리닉'}</span>
                  <span style="opacity: 0.85; font-weight: 700;">• ${isTwinVariant ? '쌍둥이(변형)' : '원본'}</span>
                </span>
              </div>
            `;
          }

          const academyLine = (showAcademyName && academyName) || options?.selectedChip
            ? `<div style="font-size: 11px; font-weight: 800; color: #64748b; letter-spacing: 0.5px; margin-bottom: 3px;">
                ${showAcademyName && academyName ? academyName : ''}
                ${showAcademyName && academyName && options?.selectedChip ? ' • ' : ''}
                ${options?.selectedChip ? `<span style="color: #6d28d9; font-weight: 900;">${options.selectedChip}</span>` : ''}
               </div>`
            : '';

          const titleFontSizeCss =
            options?.titleFontSize === 'small'
              ? '16px'
              : options?.titleFontSize === 'large'
              ? '24px'
              : '20px';

          headerHtml = `
            <div style="border-bottom: 2px solid #0f172a; padding-bottom: ${options?.headerDensity === 'compact' ? '6px' : '10px'}; margin-bottom: ${options?.headerDensity === 'compact' ? '8px' : '12px'};">
              <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                <div style="flex: 1; padding-right: 16px;">
                  ${academyLine}
                  ${eyebrowHtml}
                  <h1 style="font-size: ${titleFontSizeCss}; font-weight: 900; color: #0f172a; margin: 0 0 5px 0; line-height: 1.25; letter-spacing: -0.5px;">
                    ${cleanTitle}
                  </h1>
                  <div style="display: flex; align-items: center; gap: 8px; font-size: 11px; font-weight: 600; color: #475569;">
                    <span>학년: <strong>${exam.grade || '자율'}</strong></span>
                    <span>•</span>
                    <span>문항수: <strong>총 ${exam.questions.length}문항</strong></span>
                    <span>•</span>
                    <span>제한시간: <strong>${exam.duration_min > 0 ? `${exam.duration_min}분` : '50분'}</strong></span>
                  </div>
                </div>

                <!-- 수험자 기재란 테이블 (1:1 복제) -->
                <div style="border: 1px solid #0f172a; border-radius: 6px; overflow: hidden; font-size: 11px; align-self: flex-start; text-align: center; flex-shrink: 0; background: #ffffff;">
                  <table style="border-collapse: collapse; text-align: center;">
                    <tbody>
                      <tr style="border-bottom: 1px solid #cbd5e1; background-color: #f8fafc;">
                        <th style="padding: 3px 8px; font-size: 10px; font-weight: 800; color: #334155; border-right: 1px solid #cbd5e1; width: 50px;">반</th>
                        <th style="padding: 3px 12px; font-size: 10px; font-weight: 800; color: #334155; border-right: 1px solid #cbd5e1; width: 78px;">성 명</th>
                        <th style="padding: 3px 8px; font-size: 10px; font-weight: 800; color: #334155; width: 50px;">점 수</th>
                      </tr>
                      <tr>
                        <td style="height: 28px; line-height: 28px; border-right: 1px solid #cbd5e1; font-weight: 700; font-size: 11px; color: #1e293b;">
                          ${className}
                        </td>
                        <td style="height: 28px; line-height: 28px; border-right: 1px solid #cbd5e1; font-weight: 900; font-size: 12px; color: #020617;">
                          ${studentName}
                        </td>
                        <td style="height: 28px; line-height: 28px; font-size: 10px; color: #94a3b8; font-family: monospace; vertical-align: bottom; padding-bottom: 3px;">
                          / 100
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          `;
        } else {
          // 2페이지 이후 간이 러닝 헤더
          headerHtml = `
            <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #cbd5e1; padding-bottom: 6px; margin-bottom: 12px; font-size: 11px; font-weight: 700; color: #475569;">
              <span>${cleanTitle} (${exam.grade || '자율'})</span>
              <span>${showAcademyName && academyName ? academyName : (options?.selectedChip || '')}</span>
            </div>
          `;
        }

        // B. 단일 문항 카드 렌더러 (테두리 없는 시험지 고유 클린 레이아웃)
        const renderQuestionItem = (q: ExamQuestion, globalNum: number) => {
          const points = q.points || (q.is_descriptive ? 5 : 4);
          const formattedFolder = q.folder_name
            ? (q.folder_name.startsWith('[') ? q.folder_name : `[${q.folder_name}]`)
            : '';

          const maxImgHeight =
            questionsPerPage === 1
              ? '560px'
              : questionsPerPage === 2
              ? '420px'
              : '350px';

          return `
            <div style="display: flex; flex-direction: column; justify-content: flex-start; height: 100%; box-sizing: border-box; overflow: hidden;">
              <!-- 번호 및 배점 / 출처 태그 헤더 -->
              <div style="display: flex; align-items: baseline; gap: 5px; margin-bottom: 6px; flex-shrink: 0; flex-wrap: wrap;">
                <span style="font-size: 13px; font-weight: 900; color: #0f172a;">
                  ${globalNum}.
                </span>
                ${
                  showFolderInfo && formattedFolder
                    ? `<span style="font-size: 10px; font-weight: 700; padding: 1px 5px; border-radius: 4px; background: #eef2ff; color: #4338ca; border: 1px solid #c7d2fe;">${formattedFolder}</span>`
                    : ''
                }
                ${
                  showPoints
                    ? `<span style="font-size: 11px; font-weight: 700; color: #64748b;">[${points}.0점]</span>`
                    : ''
                }
                ${
                  q.is_descriptive
                    ? `<span style="font-size: 10px; font-weight: 800; padding: 1px 5px; border-radius: 3px; background: #f1f5f9; color: #334155; border: 1px solid #cbd5e1;">서술형</span>`
                    : ''
                }
              </div>

              <!-- 문제 이미지 영역 -->
              <div style="flex: 1; display: flex; align-items: flex-start; justify-content: center; overflow: hidden;">
                ${
                  q.image_url
                    ? `<img src="${q.image_url}" crossOrigin="anonymous" style="width: 100%; height: auto; max-height: ${maxImgHeight}; object-fit: contain; object-position: top;" alt="문제 ${globalNum}번" />`
                    : `<div style="padding: 24px; text-align: center; color: #94a3b8; font-size: 11px; border: 1px dashed #e2e8f0; border-radius: 6px; width: 100%;">문제 이미지 없음 (${q.name})</div>`
                }
              </div>

              <!-- 1문항/쪽 전용 풀이 공간 -->
              ${
                questionsPerPage === 1
                  ? `<div style="margin-top: 16px; min-height: 280px; border: 1px dashed #cbd5e1; border-radius: 8px; padding: 12px; display: flex; flex-direction: column; justify-content: space-between;">
                      <span style="font-size: 11px; font-weight: 700; color: #94a3b8;">[풀이 과정 및 정답 작성란]</span>
                      <div style="text-align: right; font-size: 12px; font-weight: 800; color: #1e293b;">정답 : _________________________</div>
                     </div>`
                  : ''
              }
            </div>
          `;
        };

        // C. 문항 배치 그리드 (한국 시험지 세로 N자형: 좌단 위→아래, 그 다음 우단 위→아래)
        let bodyHtml = '';
        const globalStartNum = task.pageIndex * questionsPerPage;

        if (columns === 1) {
          // 1단 모드
          bodyHtml = `
            <div style="flex: 1; display: grid; grid-template-rows: repeat(${pageQuestions.length}, 1fr); row-gap: 16px; height: 100%;">
              ${pageQuestions.map((q, idx) => renderQuestionItem(q, globalStartNum + idx + 1)).join('')}
            </div>
          `;
        } else {
          // 🌟 2단 N자형 레이아웃 분할
          const mid = Math.ceil(pageQuestions.length / 2);
          const leftQuestions = pageQuestions.slice(0, mid);
          const rightQuestions = pageQuestions.slice(mid);
          const rowCount = questionsPerPage === 4 ? 2 : Math.max(leftQuestions.length, rightQuestions.length, 1);

          bodyHtml = `
            <div style="flex: 1; display: flex; height: 100%; min-height: 0;">
              <!-- 좌측 단 (N자형 1/2번) -->
              <div style="flex: 1; display: grid; grid-template-rows: repeat(${rowCount}, 1fr); row-gap: 16px; ${
                showCenterDivider
                  ? 'padding-right: 16px; border-right: 1px solid #cbd5e1;'
                  : 'padding-right: 12px;'
              }">
                ${leftQuestions.map((q, idx) => renderQuestionItem(q, globalStartNum + idx + 1)).join('')}
              </div>

              <!-- 우측 단 (N자형 3/4번) -->
              <div style="flex: 1; display: grid; grid-template-rows: repeat(${rowCount}, 1fr); row-gap: 16px; ${
                showCenterDivider ? 'padding-left: 16px;' : 'padding-left: 12px;'
              }">
                ${rightQuestions.map((q, idx) => renderQuestionItem(q, globalStartNum + mid + idx + 1)).join('')}
              </div>
            </div>
          `;
        }

        pageContentHtml = `
          <div style="display: flex; flex-direction: column; justify-content: space-between; height: 100%;">
            <div>
              ${headerHtml}
            </div>
            <div style="flex: 1; min-height: 0; display: flex; flex-direction: column;">
              ${bodyHtml}
            </div>
          </div>
        `;
      } else {
        // [빠른 정답표 페이지 렌더링]
        const ansPage = task.data;

        // 정답표 헤더
        let ansHeaderHtml = '';
        if (ansPage.isFirstPage) {
          ansHeaderHtml = `
            <div style="border-bottom: 2px solid #0f172a; padding-bottom: 8px; margin-bottom: 14px;">
              <div style="font-size: 10px; font-weight: 800; color: #64748b; letter-spacing: 0.5px; margin-bottom: 2px;">
                ${showAcademyName && academyName ? `${academyName} • ` : ''}정답 및 배점표
              </div>
              <div style="display: flex; justify-content: space-between; align-items: baseline;">
                <h1 style="font-size: 18px; font-weight: 900; color: #0f172a; margin: 0;">
                  ${cleanTitle} - 빠른 정답표
                </h1>
                ${
                  answerPages.length > 1
                    ? `<span style="font-size: 11px; font-weight: 800; color: #6d28d9; font-family: monospace;">(1 / ${answerPages.length} 쪽)</span>`
                    : `<span style="font-size: 11px; font-weight: 700; color: #64748b;">총 ${exam.questions.length}문항</span>`
                }
              </div>
            </div>
          `;
        } else {
          ansHeaderHtml = `
            <div style="border-bottom: 2px solid #0f172a; padding-bottom: 6px; margin-bottom: 12px; display: flex; justify-content: space-between; align-items: center; font-size: 11px; font-weight: 700;">
              <span>${cleanTitle} - 빠른 정답표 (계속)</span>
              <span style="color: #6d28d9; font-weight: 800; font-family: monospace;">(${ansPage.ansPageIdx + 1} / ${answerPages.length} 쪽)</span>
            </div>
          `;
        }

        // 정답 테이블 렌더러
        const renderAnswerTable = (items: AnswerRowItem[]) => `
          <div style="border: 1px solid #0f172a; border-radius: 6px; overflow: hidden; background: #ffffff;">
            <table style="width: 100%; border-collapse: collapse; font-size: 11px; text-align: center;">
              <thead>
                <tr style="background: #f1f5f9; border-bottom: 1px solid #0f172a; font-weight: 900; color: #1e293b;">
                  <th style="padding: 5px 4px; width: 42px; border-right: 1px solid #cbd5e1;">번호</th>
                  <th style="padding: 5px 4px; width: 52px; border-right: 1px solid #cbd5e1;">유형</th>
                  <th style="padding: 5px 4px; width: 48px; border-right: 1px solid #cbd5e1;">배점</th>
                  <th style="padding: 5px 8px; text-align: left;">정답</th>
                </tr>
              </thead>
              <tbody>
                ${items
                  .map(
                    (it, rIdx) => `
                  <tr style="border-bottom: 1px solid #e2e8f0; background: ${rIdx % 2 === 1 ? '#f8fafc' : '#ffffff'};">
                    <td style="padding: 5px 4px; font-weight: 800; border-right: 1px solid #e2e8f0; color: #0f172a;">${it.globalIndex}</td>
                    <td style="padding: 5px 4px; font-size: 10px; font-weight: 700; border-right: 1px solid #e2e8f0; color: ${it.type === '서술형' ? '#dc2626' : '#475569'};">${it.type}</td>
                    <td style="padding: 5px 4px; font-weight: 700; border-right: 1px solid #e2e8f0; color: #64748b;">${it.points}.0</td>
                    <td style="padding: 5px 8px; font-weight: 900; color: #1d4ed8; font-size: 11px; text-align: left; word-break: break-all;">${it.answer}</td>
                  </tr>
                `
                  )
                  .join('')}
              </tbody>
            </table>
          </div>
        `;

        pageContentHtml = `
          <div style="display: flex; flex-direction: column; justify-content: space-between; height: 100%;">
            <div>
              ${ansHeaderHtml}
              <div style="display: grid; grid-template-columns: 1fr 1fr; column-gap: 16px; align-items: start;">
                <div>${renderAnswerTable(ansPage.leftItems)}</div>
                <div>${ansPage.rightItems.length > 0 ? renderAnswerTable(ansPage.rightItems) : ''}</div>
              </div>
            </div>
          </div>
        `;
      }

      // 공통 하단 푸터 (인쇄 원본과 100% 동일)
      const footerHtml = `
        <div style="display: flex; justify-content: space-between; align-items: center; border-top: 1px solid #e2e8f0; padding-top: 8px; margin-top: 8px; font-size: 10px; font-weight: 600; color: #64748b; flex-shrink: 0;">
          <span>${showAcademyName && academyName ? academyName : ''}</span>
          <span style="font-family: monospace; font-weight: 800; color: #334155;">
            - ${task.pageNumber} / ${totalPages} ${task.kind === 'answer' ? `(정답표 ${task.data.ansPageIdx + 1}/${answerPages.length})` : ''} -
          </span>
          <span>Eduest Examination</span>
        </div>
      `;

      // 최종 단일 페이지 A4 시트 HTML 조립
      const fullPageHtml = `
        <div style="width: 794px; height: 1123px; padding: ${paddingCss}; box-sizing: border-box; background: #ffffff; color: #0f172a; font-family: -apple-system, BlinkMacSystemFont, 'Pretendard', 'Noto Sans KR', 'Segoe UI', Roboto, sans-serif; display: flex; flex-direction: column; justify-content: space-between; overflow: hidden;">
          <div style="flex: 1; display: flex; flex-direction: column; justify-content: space-between; min-height: 0;">
            ${pageContentHtml}
          </div>
          ${footerHtml}
        </div>
      `;

      // 7. 스테이지 주입 및 이미지 디코딩 대기
      stage.innerHTML = fullPageHtml;

      const pageImgs = Array.from(stage.querySelectorAll('img'));
      await Promise.all(
        pageImgs.map(img => {
          if (img.complete && img.naturalHeight !== 0) return Promise.resolve(true);
          return new Promise(resolve => {
            img.onload = () => resolve(true);
            img.onerror = () => resolve(false);
          });
        })
      );

      // 레이아웃 페인트 보장 틱
      await new Promise(r => setTimeout(r, 60));

      // 8. html2canvas로 현재 단일 페이지만 초정밀 캡처 (A4 1:1)
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
      if (taskIdx > 0) {
        pdf.addPage('a4', 'portrait');
      }
      pdf.addImage(imgData, 'JPEG', 0, 0, 210, 297, undefined, 'FAST');
    }

    onProgress({
      current: targetPages.length,
      total: targetPages.length,
      percent: 100,
      message: 'PDF 파일 다운로드 중...',
    });

    // 9. 브라우저 로컬 저장으로 파일 즉각 전송 (window.print 절대 미호출)
    const safeTitle = sanitizeFileName(cleanTitle || exam.title || '시험지');
    const suffix = studentName ? `_${studentName}` : '';
    pdf.save(`${safeTitle}${suffix}_시험지.pdf`);

    return true;
  } catch (err) {
    console.error('downloadExamAsPdf error:', err);
    throw err;
  } finally {
    // 10. 렌더 스테이지 안전 회수
    if (document.body.contains(stage)) {
      document.body.removeChild(stage);
    }
  }
}
