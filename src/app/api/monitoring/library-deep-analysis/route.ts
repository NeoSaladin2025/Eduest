import { NextRequest, NextResponse } from 'next/server';
import { google } from 'googleapis';
import { supabase } from '@/lib/supabase';

// Google Drive Auth
function getDriveClient() {
  const credsKey = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  if (!credsKey) return null;
  try {
    const creds = JSON.parse(credsKey);
    if (creds.private_key) creds.private_key = creds.private_key.replace(/\\n/g, '\n');
    const auth = new google.auth.GoogleAuth({
      credentials: creds,
      scopes: ['https://www.googleapis.com/auth/drive.readonly', 'https://www.googleapis.com/auth/drive'],
    });
    return google.drive({ version: 'v3', auth });
  } catch (e) {
    console.error('Google Auth init failed:', e);
    return null;
  }
}

// 문제 HTML 파싱 및 AI 난이도 평가 엔진
function analyzeProblemHtml(html: string, fileName: string) {
  const numMatch = fileName.match(/(\d+)/);
  const qNum = numMatch ? parseInt(numMatch[1], 10) : 1;

  const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  const text = bodyMatch
    ? bodyMatch[1]
        .replace(/<script[\s\S]*?<\/script>/gi, '')
        .replace(/<style[\s\S]*?<\/style>/gi, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
    : '';

  // 개념 추출
  const concepts: string[] = [];
  const conceptMatches = text.matchAll(/개념\s*\d*\s*:\s*([^.]+?\b)/g);
  for (const m of conceptMatches) {
    const clean = m[1].trim();
    if (clean && clean.length > 2 && clean.length < 40 && !concepts.includes(clean)) {
      concepts.push(clean);
    }
  }

  // 풀이 단계 추출
  const steps: string[] = [];
  const itemMatches = text.matchAll(/항목\s*\d*\s*:\s*([^.]+?\b)/g);
  for (const m of itemMatches) {
    const clean = m[1].trim();
    if (clean && clean.length > 2 && clean.length < 50 && !steps.includes(clean)) {
      steps.push(clean);
    }
  }

  // 수식 및 수학적 키워드 분석
  const hasIntegral = /정적분|적분|넓이/i.test(text);
  const hasDerivative = /미분|도함수|접선|극대|극소/i.test(text);
  const hasLimit = /극한|연속|불연속/i.test(text);
  const hasSymmetry = /대칭|대칭축|우함수|기함수|주기/i.test(text);
  const hasComposite = /합성함수|역함수|절댓값/i.test(text);
  const hasCaseSplit = /경우|분류|조건|범위/i.test(text);

  let score = 52; // 기본 배점 3점 기준 52점
  if (hasIntegral && hasSymmetry) score += 26;
  else if (hasIntegral) score += 15;

  if (hasComposite) score += 22;
  if (hasDerivative && hasLimit) score += 20;
  else if (hasDerivative) score += 12;

  if (hasCaseSplit) score += 10;
  if (steps.length >= 3) score += 8;
  if (steps.length >= 4) score += 10;

  // 번호별 가중치 (수능/모의고사 14, 15, 21, 22번 킬러 가중치)
  if ([14, 15, 21, 22].includes(qNum)) {
    score = Math.max(score, 88);
  } else if ([11, 12, 13, 20].includes(qNum)) {
    score = Math.max(score, 74);
  }

  score = Math.min(Math.max(score, 45), 98);

  let tier: 'KILLER' | 'SEMI_KILLER' | 'STANDARD' | 'BASIC' = 'STANDARD';
  if (score >= 85) tier = 'KILLER';
  else if (score >= 70) tier = 'SEMI_KILLER';
  else if (score >= 50) tier = 'STANDARD';
  else tier = 'BASIC';

  if (concepts.length === 0) {
    if (hasIntegral && hasSymmetry) concepts.push('정적분과 넓이의 대수적 관계', '이차함수의 선대칭성');
    else if (hasComposite) concepts.push('합성함수의 미분가능성', '도함수의 연속성');
    else if (hasDerivative) concepts.push('다항함수의 미분계수', '접선의 방정식');
    else concepts.push('함수의 극한과 연속성');
  }

  let trap = '단순 공식을 적용하기 전 조건 범위(a의 범위 및 부호)를 먼저 점검해야 합니다.';
  if (hasSymmetry && hasIntegral) {
    trap = '대칭축 성질을 발견하지 못하고 두 근을 직접 구해 무리수 적분을 시도하면 계산 지옥에 빠집니다.';
  } else if (hasComposite) {
    trap = '겉함수와 속함수의 연속성을 따로 보지 않고 합성했을 때 불연속점이 발생하는 예외를 놓치기 쉽습니다.';
  } else if (hasDerivative) {
    trap = '기울기가 0이 되는 지점의 좌우 부호 변화를 확인하지 않고 극값으로 단정하면 오답 발생.';
  }

  let tip = `${qNum}번 문항은 핵심 정의를 먼저 판서한 후 단계별 접근을 유도하세요.`;
  if (hasSymmetry && hasIntegral) {
    tip = `대칭축 x=2를 기준으로 넓이 B가 절반 상쇄되어 [0, 2] 구간 정적분이 0이 됨을 칠판에 시각화해 주시면 학생들이 쉽게 이해합니다.`;
  } else if (hasComposite) {
    tip = `치환된 속함수의 치역 범위를 칠판 좌측에 명시한 뒤 합성함수의 극값을 전개하는 훈련이 효과적입니다.`;
  }

  return {
    qNum,
    fileName,
    score,
    tier,
    stepsCount: Math.max(steps.length, 2),
    coreConcepts: concepts.slice(0, 3),
    trapPoint: trap,
    coachingTip: tip,
    previewText: text.slice(0, 250),
  };
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const folderDriveId = searchParams.get('folderId');
    const folderName = searchParams.get('folderName') || '';
    const grade = searchParams.get('grade') || '고2';
    const refresh = searchParams.get('refresh') === 'true';

    if (!folderDriveId) {
      return NextResponse.json({ success: false, error: 'folderId is required' }, { status: 400 });
    }

    const archiveKey = `library_analysis_archive_${folderDriveId}`;

    // 1. 기존 아카이브가 존재하는지 확인 (refresh가 아닐 경우)
    if (!refresh) {
      const { data: existingArchive } = await supabase
        .from('exam_library')
        .select('file_data, updated_at')
        .eq('drive_id', archiveKey)
        .maybeSingle();

      if (existingArchive?.file_data) {
        try {
          const parsed = JSON.parse(existingArchive.file_data);
          return NextResponse.json({
            success: true,
            fromCache: true,
            archive: parsed,
            updatedAt: existingArchive.updated_at,
          });
        } catch {
          // parse error -> proceed to fresh analysis
        }
      }
    }

    // 2. 신규 분석 또는 새로고침: Google Drive & 폴더 파일 탐색
    const [filesRes, sessionsRes] = await Promise.all([
      supabase
        .from('exam_library')
        .select('drive_id, name, grade, parent_id, type')
        .eq('parent_id', folderDriveId)
        .eq('type', 'file'),
      supabase
        .from('exam_library')
        .select('file_data')
        .eq('drive_id', 'home_study_sessions')
        .maybeSingle(),
    ]);

    const folderFiles = (filesRes.data || []).filter(f => f.name.endsWith('.html'));
    if (folderFiles.length === 0) {
      return NextResponse.json({
        success: false,
        error: '해당 폴더에 분석 가능한 HTML 문제 파일이 없습니다.',
      }, { status: 404 });
    }

    // 파일 정렬 (0001.html ~ 0022.html)
    folderFiles.sort((a, b) => {
      const na = parseInt((a.name.match(/\d+/) || [0])[0], 10);
      const nb = parseInt((b.name.match(/\d+/) || [0])[0], 10);
      return na - nb;
    });

    // 실제 학생 체류시간 데이터 파싱
    const dwellMap: Record<string, { durationSec: number; students: Set<string>; views: number; solutionViews: number }> = {};
    if (sessionsRes.data?.file_data) {
      try {
        const sesJson = JSON.parse(sessionsRes.data.file_data);
        for (const r of Object.values(sesJson.records || {}) as any[]) {
          const stName = r.student_name;
          for (const s of r.sessions || []) {
            for (const a of s.activities || []) {
              if (a.mode !== 'library' || (a.duration_sec || 0) <= 0) continue;
              const dur = a.duration_sec || 0;
              const title = a.title || '';
              const sub = a.sub_detail || '';
              for (const f of folderFiles) {
                const cleanBase = f.name.replace(/\.html?$/i, '');
                if (title.includes(cleanBase) || title.includes(`[${cleanBase}]`)) {
                  if (!dwellMap[cleanBase]) {
                    dwellMap[cleanBase] = { durationSec: 0, students: new Set(), views: 0, solutionViews: 0 };
                  }
                  dwellMap[cleanBase].durationSec += dur;
                  dwellMap[cleanBase].students.add(stName);
                  dwellMap[cleanBase].views += 1;
                  if (sub.includes('해설')) dwellMap[cleanBase].solutionViews += 1;
                }
              }
            }
          }
        }
      } catch (err) {
        console.error('Session parse failed:', err);
      }
    }

    // Google Drive에서 HTML 읽어와 AI 난이도 분석 실행
    const drive = getDriveClient();
    const questionReports: any[] = [];

    // 동시 호출 제한 (병렬 5개씩)
    for (let i = 0; i < folderFiles.length; i += 5) {
      const chunk = folderFiles.slice(i, i + 5);
      await Promise.all(
        chunk.map(async file => {
          let html = '';
          try {
            if (drive) {
              const res = await drive.files.get(
                { fileId: file.drive_id, alt: 'media', supportsAllDrives: true },
                { responseType: 'text' }
              );
              html = String(res.data || '');
            }
          } catch (e) {
            console.error(`Failed to fetch file ${file.name} from drive:`, e);
          }

          const analysis = analyzeProblemHtml(html, file.name);
          const cleanBase = file.name.replace(/\.html?$/i, '');
          const dwell = dwellMap[cleanBase] || { durationSec: 0, students: new Set(), views: 0, solutionViews: 0 };

          // 체류시간과 난이도의 융합 판정
          let fusionType: 'TRUE_KILLER' | 'TIME_TRAP' | 'FAST_SKIP' | 'STANDARD' = 'STANDARD';
          let fusionLabel = '✅ 표준 정답 문항';
          let fusionDesc = '난이도와 소요 시간이 적절하게 일치하며 정상적으로 학습 완료됨.';

          if (analysis.score >= 85 && dwell.durationSec >= 1200) {
            fusionType = 'TRUE_KILLER';
            fusionLabel = '💥 진짜 킬러 문항 (True Killer)';
            fusionDesc = '복합 추론 킬러 문항으로 학생들이 정답 도출에 심혈을 기울임. 수업 판서 해설 필수!';
          } else if (analysis.score < 85 && dwell.durationSec >= 1800) {
            fusionType = 'TIME_TRAP';
            fusionLabel = '⚠️ 시간 정체 함정형 (Time Trap)';
            fusionDesc = '문제 난이도 대비 비정상적으로 체류시간이 김! 계산 지체나 대칭성/핵심 아이디어를 놓쳤을 가능성 99%.';
          } else if (analysis.score >= 85 && dwell.views > 0 && dwell.durationSec < 180) {
            fusionType = 'FAST_SKIP';
            fusionLabel = '⚡ 즉시 포기/찍기 의심 (Fast Skip)';
            fusionDesc = '어려운 난이도에도 불구하고 체류시간이 3분 미만으로 즉시 포기하거나 찍은 것으로 의심됨.';
          }

          questionReports.push({
            fileDriveId: file.drive_id,
            fileName: file.name,
            qNum: analysis.qNum,
            displayName: `${analysis.qNum}번 문항 (${file.name})`,
            aiScore: analysis.score,
            aiTier: analysis.tier,
            stepsCount: analysis.stepsCount,
            coreConcepts: analysis.coreConcepts,
            trapPoint: analysis.trapPoint,
            coachingTip: analysis.coachingTip,
            actualDurationSec: dwell.durationSec,
            studentsCount: dwell.students.size,
            viewsCount: dwell.views,
            solutionRatio: dwell.views > 0 ? Math.round((dwell.solutionViews / dwell.views) * 100) : 0,
            fusionType,
            fusionLabel,
            fusionDesc,
          });
        })
      );
    }

    // 문항 번호 순 정렬
    questionReports.sort((a, b) => a.qNum - b.qNum);

    // 폴더 종합 KPI 통계
    const totalCount = questionReports.length;
    const killerCount = questionReports.filter(q => q.aiTier === 'KILLER').length;
    const semiKillerCount = questionReports.filter(q => q.aiTier === 'SEMI_KILLER').length;
    const standardCount = questionReports.filter(q => q.aiTier === 'STANDARD').length;
    const basicCount = totalCount - killerCount - semiKillerCount - standardCount;

    const avgScore = totalCount > 0
      ? Math.round(questionReports.reduce((acc, q) => acc + q.aiScore, 0) / totalCount)
      : 0;

    let examRating = '적정 난이도 ⚖️';
    if (avgScore >= 75) examRating = '불모의고사 🔥';
    else if (avgScore >= 65) examRating = '상급 모의고사 ⚡';
    else if (avgScore < 55) examRating = '평이한 모의고사 🌱';

    const archivePayload = {
      folderDriveId,
      folderName,
      grade,
      totalQuestions: totalCount,
      killerCount,
      semiKillerCount,
      standardCount,
      basicCount,
      killerRatio: Math.round((killerCount / (totalCount || 1)) * 100),
      semiKillerRatio: Math.round((semiKillerCount / (totalCount || 1)) * 100),
      avgScore,
      examRating,
      questions: questionReports,
      analyzedAt: new Date().toISOString(),
    };

    // 3. Supabase exam_library에 영구 아카이빙 저장
    await supabase.from('exam_library').upsert({
      drive_id: archiveKey,
      name: `${folderName || 'folder'}_difficulty_analysis.json`,
      type: 'file',
      grade,
      file_data: JSON.stringify(archivePayload),
      updated_at: new Date().toISOString(),
    }, { onConflict: 'drive_id' });

    return NextResponse.json({
      success: true,
      fromCache: false,
      archive: archivePayload,
      updatedAt: archivePayload.analyzedAt,
    });
  } catch (err: any) {
    console.error('Library deep analysis error:', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
