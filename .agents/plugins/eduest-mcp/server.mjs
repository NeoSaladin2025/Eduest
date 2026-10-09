import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { createClient } from '@supabase/supabase-js';
import { google } from 'googleapis';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { exec } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '../../../');
const envPath = path.join(projectRoot, '.env.local');

// 1. 환경변수 자동 로드 (.env.local)
function loadEnv() {
  if (fs.existsSync(envPath)) {
    const content = fs.readFileSync(envPath, 'utf8');
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx > 0) {
        const key = trimmed.slice(0, eqIdx).trim();
        let val = trimmed.slice(eqIdx + 1).trim();
        if ((val.startsWith("'") && val.endsWith("'")) || (val.startsWith('"') && val.endsWith('"'))) {
          val = val.slice(1, -1);
        }
        if (!process.env[key]) {
          process.env[key] = val;
        }
      }
    }
  }
}
loadEnv();

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://nqctewzhivglswlgwbvn.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'sb_publishable_-nlZnEQGq5QXCou6H0MJlg_G8k3teT9';
const GAS_URL = 'https://script.google.com/macros/s/AKfycbzRXwdja0xFm9wKcTG0asR5cv2mmhUDLK_S9j1VgtCcI37Dqw228mNrwNm74yzfyS05GA/exec';
const GAS_API_KEY = 'eduest_super_secret_key_1234';
const PARENT_FOLDER_ID = '19qVOvQECMVXVrZcnSFbEIHPrGqn1lt8v';

// Supabase 클라이언트 초기화
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Google Drive API 초기화
function getGoogleDrive() {
  const keyString = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  if (!keyString) throw new Error('GOOGLE_SERVICE_ACCOUNT_KEY not found in env');
  const creds = JSON.parse(keyString);
  if (creds.private_key) {
    creds.private_key = creds.private_key.replace(/\\n/g, '\n');
  }
  const auth = new google.auth.GoogleAuth({
    credentials: creds,
    scopes: ['https://www.googleapis.com/auth/drive']
  });
  return google.drive({ version: 'v3', auth });
}

// Google Apps Script 호출 헬퍼
async function callGas(action, params = {}) {
  const response = await fetch(GAS_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      apiKey: GAS_API_KEY,
      action,
      ...params
    })
  });
  return await response.json();
}

// ==========================================
// DB 레코드 키 정의 및 헬퍼 함수
// ==========================================
const RECORD_IDS = {
  CLASSES: 'class_schedule_root_data',
  EXAMS: 'test2_exam_papers_data',
  SUBMISSIONS: 'test2_student_submissions_data',
  BUNDLES: 'test2_exam_bundles_data',
  TWINS: 'test_twin_problems_data'
};

async function getLibraryRecord(driveId, defaultVal = {}) {
  const { data, error } = await supabase
    .from('exam_library')
    .select('file_data')
    .eq('drive_id', driveId)
    .maybeSingle();
  if (error || !data?.file_data) return defaultVal;
  try {
    return JSON.parse(data.file_data);
  } catch {
    return defaultVal;
  }
}

async function saveLibraryRecord(driveId, name, payload) {
  const jsonString = JSON.stringify(payload);
  const { error } = await supabase.from('exam_library').upsert({
    drive_id: driveId,
    name,
    type: 'file',
    grade: '공통',
    file_data: jsonString,
    updated_at: new Date().toISOString()
  }, { onConflict: 'drive_id' });
  if (error) throw error;
}

async function getAllStudents() {
  const { data, error } = await supabase.from('students').select('*').order('name');
  if (error) throw error;
  return data || [];
}

// 학생 이름 목록을 학생 ID 목록으로 변환
async function resolveStudentIds(namesOrIds = []) {
  if (!namesOrIds || namesOrIds.length === 0) return [];
  const allStudents = await getAllStudents();
  const resolved = [];
  for (const item of namesOrIds) {
    const trimmed = String(item).trim();
    const byId = allStudents.find(s => s.id === trimmed);
    if (byId) {
      resolved.push(byId.id);
      continue;
    }
    const byName = allStudents.find(s => s.name.trim().toLowerCase() === trimmed.toLowerCase());
    if (byName) {
      resolved.push(byName.id);
    }
  }
  return [...new Set(resolved)];
}

// MCP 서버 인스턴스 생성
const server = new McpServer({
  name: 'eduest-mcp',
  version: '2.0.0'
});

// ==========================================
// 1. 학생 관리 & 종합 상태 보고서 도구
// ==========================================

server.tool(
  'eduest_list_students',
  '학생 목록 조회 (학년별 필터, 이름 검색, 잠금 상태 등 확인)',
  {
    grade: z.string().optional().describe('학년 필터 (예: 중1, 중2, 중3, 고1, 고2, 고3)'),
    search: z.string().optional().describe('학생 이름 검색어')
  },
  async ({ grade, search }) => {
    let query = supabase.from('students').select('*').order('name');
    if (grade && grade !== '전체') {
      query = query.ilike('grade', `%${grade}%`);
    }
    if (search) {
      query = query.ilike('name', `%${search}%`);
    }
    const { data, error } = await query;
    if (error) {
      return { content: [{ type: 'text', text: `❌ 학생 목록 조회 실패: ${error.message}` }] };
    }
    return {
      content: [{ type: 'text', text: JSON.stringify(data, null, 2) }]
    };
  }
);

server.tool(
  'eduest_get_student_detail',
  '특정 학생의 상세 종합 프로필 및 상태 조회 (인적사항, 소속 반, 실시간 시험 진행/이탈 상태, 최근 시험 점수, 복습/과제 미완료 건수 등 종합 브리핑)',
  {
    search: z.string().describe('학생 이름 또는 학생 ID (예: 김서율 또는 UUID)')
  },
  async ({ search }) => {
    const students = await getAllStudents();
    const student = students.find(s => s.id === search || s.name.toLowerCase().includes(search.toLowerCase()));
    if (!student) {
      return { content: [{ type: 'text', text: `❌ 학생 [${search}]을(를) 찾을 수 없습니다.` }] };
    }

    // 1. 소속 반 찾기
    const classData = await getLibraryRecord(RECORD_IDS.CLASSES, { classes: [] });
    const assignedClasses = (classData.classes || []).filter(c => 
      c.student_ids?.includes(student.id) || 
      (c.students_attendance && c.students_attendance[student.id])
    );

    // 2. 최근 시험 제출 내역
    const subData = await getLibraryRecord(RECORD_IDS.SUBMISSIONS, { submissions: [] });
    const mySubmissions = (subData.submissions || [])
      .filter(s => s.student_id === student.id)
      .sort((a, b) => new Date(b.submitted_at).getTime() - new Date(a.submitted_at).getTime());

    // 3. 복습 데이터
    const reviewData = await getLibraryRecord(`student_review_${student.id}`, { items: [], folders: [] });
    const pendingReviews = (reviewData.items || []).filter(i => i.status !== 'completed');

    const classesSummary = assignedClasses.length > 0 
      ? assignedClasses.map(c => `• ${c.name} (${c.grade}) [${(c.days || []).join(', ')} ${c.time || ''}]`).join('\n')
      : '• 소속된 반 없음';

    const recentExamsSummary = mySubmissions.slice(0, 5).map(s => 
      `• [${s.submitted_at?.slice(0, 10) || '-'}] ${s.exam_title}: ${s.score}점 (${s.correct_count}/${s.total_questions}문항)`
    ).join('\n') || '• 최근 시험 응시 기록 없음';

    let liveStatusText = '대기 중 (IDLE)';
    if (student.test_status === 'TESTING') {
      const minLeft = Math.floor((student.test_remaining_sec || 0) / 60);
      liveStatusText = `🚨 시험 응시 중 (남은 시간: 약 ${minLeft}분 ${student.last_away_at ? '⚠️ 자리 이탈 감지됨' : '정상'})`;
    } else if (student.test_status === 'PAUSED') {
      liveStatusText = '⏸️ 시험 일시정지 상태';
    } else if (student.test_status === 'FINISHED') {
      liveStatusText = '✅ 최근 시험 완료';
    }

    const report = `
📋 [학생 종합 프로필 보고서: ${student.name}]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
👤 기본 정보
- 이름: ${student.name} (${student.grade || '학년 미지정'})
- ID: ${student.id}
- 비밀번호: ${student.password || '미설정'}
- 시스템 잠금 상태: ${student.is_unlocked ? '🔓 잠금 해제 (이용 가능)' : '🔒 잠금됨'}
- 구글 드라이브 폴더 ID: ${student.drive_folder_id || '없음'}

🏫 소속 수업/반
${classesSummary}

⚡ 현재 실시간 응시 상태
- 상태: ${liveStatusText}

📝 최근 시험 제출 내역 (최근 5건)
${recentExamsSummary}

🔄 복습 & 오답 과제 현황
- 총 복습 항목: ${reviewData.items?.length || 0}건
- 미완료 복습: ${pendingReviews.length}건
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    `.trim();

    return { content: [{ type: 'text', text: report }] };
  }
);

server.tool(
  'eduest_get_students_summary',
  '전체 또는 학년별 학생 종합 현황 요약 (현재 상태(시험중/이탈/대기), 소속 반, 복습 미완료 현황 등 종합 집계)',
  {
    grade: z.string().optional().describe('학년 필터 (선택, 예: 중3, 고1)')
  },
  async ({ grade }) => {
    let students = await getAllStudents();
    if (grade && grade !== '전체') {
      students = students.filter(s => s.grade?.includes(grade));
    }
    const classData = await getLibraryRecord(RECORD_IDS.CLASSES, { classes: [] });
    const subData = await getLibraryRecord(RECORD_IDS.SUBMISSIONS, { submissions: [] });

    const rows = students.map(s => {
      const myClasses = (classData.classes || []).filter(c => c.student_ids?.includes(s.id)).map(c => c.name).join(', ') || '-';
      const mySubs = (subData.submissions || []).filter(sub => sub.student_id === s.id);
      const lastScore = mySubs.length > 0 ? `${mySubs[mySubs.length - 1].score}점` : '기록없음';
      
      let statusStr = s.test_status || 'IDLE';
      if (statusStr === 'TESTING' && s.last_away_at) statusStr = 'TESTING(이탈)';

      return `| ${s.name} | ${s.grade || '-'} | ${myClasses} | ${statusStr} | ${lastScore} | ${s.is_unlocked ? '정상' : '잠금'} |`;
    });

    const table = `
### 📊 학생 현황 요약 보고서 (총 ${students.length}명)
| 이름 | 학년 | 소속 반 | 현재 상태 | 최근 시험 | 계정 |
| :--- | :--- | :--- | :--- | :--- | :--- |
${rows.join('\n')}
    `.trim();

    return { content: [{ type: 'text', text: table }] };
  }
);

server.tool(
  'eduest_update_student',
  '학생 정보 업데이트 (잠금 여부 is_unlocked, 비밀번호 password, 학년 grade, 권한 unlocked_folders)',
  {
    studentId: z.string().describe('학생 Supabase ID'),
    is_unlocked: z.boolean().optional().describe('라이브러리 전체 잠금 해제 여부 (true/false)'),
    password: z.string().optional().describe('4자리 숫자 비밀번호'),
    grade: z.string().optional().describe('학년 변경'),
    unlocked_folders: z.array(z.string()).optional().describe('열람 가능한 회차 폴더 ID 목록')
  },
  async ({ studentId, is_unlocked, password, grade, unlocked_folders }) => {
    const updatePayload = {};
    if (is_unlocked !== undefined) updatePayload.is_unlocked = is_unlocked;
    if (password !== undefined) updatePayload.password = password;
    if (grade !== undefined) updatePayload.grade = grade;
    if (unlocked_folders !== undefined) updatePayload.unlocked_folders = unlocked_folders;

    const { data, error } = await supabase
      .from('students')
      .update(updatePayload)
      .eq('id', studentId)
      .select()
      .single();

    if (error) {
      return { content: [{ type: 'text', text: `❌ 업데이트 실패: ${error.message}` }] };
    }
    return {
      content: [{ type: 'text', text: `✅ 학생 정보 업데이트 완료:\n${JSON.stringify(data, null, 2)}` }]
    };
  }
);

server.tool(
  'eduest_create_student',
  '신규 학생 등록 (Google Drive 전용 폴더 자동 생성 및 Supabase DB 저장)',
  {
    name: z.string().describe('학생 이름'),
    grade: z.string().describe('학년 (예: 중3, 고1)')
  },
  async ({ name, grade }) => {
    try {
      const drive = getGoogleDrive();
      const folderRes = await drive.files.create({
        requestBody: {
          name: `[${grade}] ${name}`,
          mimeType: 'application/vnd.google-apps.folder',
          parents: [PARENT_FOLDER_ID],
        },
        fields: 'id',
        supportsAllDrives: true,
      });
      const studentFolderId = folderRes.data.id;
      const tempPassword = String(Math.floor(1000 + Math.random() * 9000));

      const { data, error } = await supabase
        .from('students')
        .insert([{
          name,
          grade,
          drive_folder_id: studentFolderId,
          password: tempPassword,
          is_unlocked: true
        }])
        .select()
        .single();

      if (error) throw error;

      return {
        content: [{
          type: 'text',
          text: `✅ 학생 등록 완료!\n- 이름: ${name} (${grade})\n- 비밀번호: ${tempPassword}\n- 드라이브 폴더: ${studentFolderId}\n- 학생 ID: ${data.id}`
        }]
      };
    } catch (err) {
      return { content: [{ type: 'text', text: `❌ 학생 생성 실패: ${err.message}` }] };
    }
  }
);

server.tool(
  'eduest_delete_student',
  '학생 삭제 (Supabase DB 삭제 및 Google Drive 폴더 휴지통 이동)',
  {
    studentId: z.string().describe('학생 Supabase ID')
  },
  async ({ studentId }) => {
    try {
      const { data: student, error: fetchErr } = await supabase
        .from('students')
        .select('name, drive_folder_id')
        .eq('id', studentId)
        .single();

      if (fetchErr || !student) {
        return { content: [{ type: 'text', text: `❌ 학생을 찾을 수 없습니다: ${fetchErr?.message}` }] };
      }

      if (student.drive_folder_id) {
        try {
          const drive = getGoogleDrive();
          await drive.files.update({
            fileId: student.drive_folder_id,
            requestBody: { trashed: true },
            supportsAllDrives: true
          });
        } catch (dErr) {
          console.error('드라이브 폴더 휴지통 이동 실패 (무시):', dErr.message);
        }
      }

      const { error: delErr } = await supabase.from('students').delete().eq('id', studentId);
      if (delErr) throw delErr;

      return {
        content: [{ type: 'text', text: `✅ ${student.name} 학생 삭제 및 드라이브 폴더 휴지통 이동 완료` }]
      };
    } catch (err) {
      return { content: [{ type: 'text', text: `❌ 삭제 실패: ${err.message}` }] };
    }
  }
);

// ==========================================
// 2. 수업 및 출결/과제 관리 도구 (Classes)
// ==========================================

server.tool(
  'eduest_list_classes',
  '개설된 전체 수업/반 목록 조회 (수업명, 학년, 요일/시간, 수강생 수 및 명단)',
  {
    grade: z.string().optional().describe('학년 필터 (선택)')
  },
  async ({ grade }) => {
    const classData = await getLibraryRecord(RECORD_IDS.CLASSES, { classes: [] });
    let classes = classData.classes || [];
    if (grade && grade !== '전체') {
      classes = classes.filter(c => c.grade?.includes(grade));
    }
    const students = await getAllStudents();
    const studentMap = Object.fromEntries(students.map(s => [s.id, s.name]));

    const summary = classes.map(c => {
      const studentNames = (c.student_ids || []).map(id => studentMap[id] || id);
      return {
        id: c.id,
        name: c.name,
        grade: c.grade,
        days: c.days || [],
        time: c.time || '',
        room: c.room || '',
        capacity: c.capacity || 0,
        student_count: (c.student_ids || []).length,
        students: studentNames
      };
    });

    return {
      content: [{ type: 'text', text: JSON.stringify(summary, null, 2) }]
    };
  }
);

server.tool(
  'eduest_create_class',
  '새로운 수업/반 개설 및 학생 등록 (DB class_schedule_root_data에 즉시 반영)',
  {
    name: z.string().describe('수업/반 이름 (예: 고1 화목 정규반)'),
    grade: z.string().describe('대상 학년 (예: 고1, 중3)'),
    days: z.array(z.string()).default([]).describe('수업 요일 (예: ["화", "목"])'),
    time: z.string().default('').describe('수업 시간 (예: 17:00 ~ 19:00)'),
    room: z.string().optional().describe('강의실 (선택, 예: 301호)'),
    capacity: z.number().default(15).describe('정원 (기본: 15)'),
    studentNames: z.array(z.string()).default([]).describe('등록할 학생 이름 목록 (예: ["김서율", "김도현"])')
  },
  async ({ name, grade, days, time, room, capacity, studentNames }) => {
    const classData = await getLibraryRecord(RECORD_IDS.CLASSES, { classes: [] });
    const classes = classData.classes || [];

    const studentIds = await resolveStudentIds(studentNames);
    const newClassId = 'class_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);

    const newClass = {
      id: newClassId,
      name,
      grade,
      days,
      time,
      room: room || '',
      capacity,
      student_ids: studentIds,
      students_attendance: {},
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    classes.push(newClass);
    await saveLibraryRecord(RECORD_IDS.CLASSES, 'class_schedule_data.json', {
      ...classData,
      classes,
      updated_at: new Date().toISOString()
    });

    return {
      content: [{
        type: 'text',
        text: `✅ 새 수업 [${name}] 생성 완료!\n- ID: ${newClassId}\n- 학년: ${grade}\n- 요일/시간: ${days.join(', ')} (${time})\n- 등록된 학생: ${studentIds.length}명 (${studentNames.join(', ')})`
      }]
    };
  }
);

server.tool(
  'eduest_update_class',
  '기존 수업 정보 수정 (수업명, 요일, 시간, 강의실, 정원 등)',
  {
    classNameOrId: z.string().describe('대상 수업 이름 또는 수업 ID'),
    name: z.string().optional().describe('새로운 수업명'),
    days: z.array(z.string()).optional().describe('새로운 요일 목록'),
    time: z.string().optional().describe('새로운 시간'),
    room: z.string().optional().describe('새로운 강의실'),
    capacity: z.number().optional().describe('새로운 정원')
  },
  async ({ classNameOrId, name, days, time, room, capacity }) => {
    const classData = await getLibraryRecord(RECORD_IDS.CLASSES, { classes: [] });
    const classes = classData.classes || [];
    const target = classes.find(c => c.id === classNameOrId || c.name.toLowerCase().includes(classNameOrId.toLowerCase()));
    if (!target) {
      return { content: [{ type: 'text', text: `❌ 수업 [${classNameOrId}]을(를) 찾을 수 없습니다.` }] };
    }

    if (name) target.name = name;
    if (days) target.days = days;
    if (time) target.time = time;
    if (room !== undefined) target.room = room;
    if (capacity !== undefined) target.capacity = capacity;
    target.updated_at = new Date().toISOString();

    await saveLibraryRecord(RECORD_IDS.CLASSES, 'class_schedule_data.json', {
      ...classData,
      classes,
      updated_at: new Date().toISOString()
    });

    return {
      content: [{ type: 'text', text: `✅ 수업 [${target.name}] 정보가 성공적으로 수정되었습니다.` }]
    };
  }
);

server.tool(
  'eduest_assign_students_to_class',
  '특정 수업에 학생들을 추가 배정하거나 제외',
  {
    classNameOrId: z.string().describe('대상 수업 이름 또는 수업 ID'),
    studentNames: z.array(z.string()).describe('추가/제외할 학생 이름 목록'),
    action: z.enum(['add', 'remove']).default('add').describe('작업 구분: add(추가) 또는 remove(제외)')
  },
  async ({ classNameOrId, studentNames, action }) => {
    const classData = await getLibraryRecord(RECORD_IDS.CLASSES, { classes: [] });
    const classes = classData.classes || [];
    const targetClass = classes.find(c => c.id === classNameOrId || c.name.toLowerCase().includes(classNameOrId.toLowerCase()));
    if (!targetClass) {
      return { content: [{ type: 'text', text: `❌ 수업 [${classNameOrId}]을(를) 찾을 수 없습니다.` }] };
    }

    const studentIds = await resolveStudentIds(studentNames);
    if (!targetClass.student_ids) targetClass.student_ids = [];

    if (action === 'add') {
      for (const id of studentIds) {
        if (!targetClass.student_ids.includes(id)) {
          targetClass.student_ids.push(id);
        }
      }
    } else {
      targetClass.student_ids = targetClass.student_ids.filter(id => !studentIds.includes(id));
    }
    targetClass.updated_at = new Date().toISOString();

    await saveLibraryRecord(RECORD_IDS.CLASSES, 'class_schedule_data.json', {
      ...classData,
      classes,
      updated_at: new Date().toISOString()
    });

    return {
      content: [{
        type: 'text',
        text: `✅ [${targetClass.name}] 수업에 학생 ${action === 'add' ? '추가' : '제외'} 완료!\n- 대상 학생: ${studentNames.join(', ')}\n- 현재 총 학생 수: ${targetClass.student_ids.length}명`
      }]
    };
  }
);

server.tool(
  'eduest_delete_class',
  '수업/반 삭제',
  {
    classNameOrId: z.string().describe('삭제할 수업 이름 또는 수업 ID')
  },
  async ({ classNameOrId }) => {
    const classData = await getLibraryRecord(RECORD_IDS.CLASSES, { classes: [] });
    let classes = classData.classes || [];
    const initialLen = classes.length;
    classes = classes.filter(c => c.id !== classNameOrId && !c.name.toLowerCase().includes(classNameOrId.toLowerCase()));

    if (classes.length === initialLen) {
      return { content: [{ type: 'text', text: `❌ 삭제할 수업 [${classNameOrId}]을(를) 찾을 수 없습니다.` }] };
    }

    await saveLibraryRecord(RECORD_IDS.CLASSES, 'class_schedule_data.json', {
      ...classData,
      classes,
      updated_at: new Date().toISOString()
    });

    return {
      content: [{ type: 'text', text: `✅ 수업 [${classNameOrId}]이(가) 정상적으로 삭제되었습니다.` }]
    };
  }
);

// ==========================================
// 3. 실시간 시험 감독 및 응시 제어 도구 (Proctoring)
// ==========================================

server.tool(
  'eduest_get_proctoring_status',
  '실시간 시험 감독 현황 조회 (시험 중, 이탈, 일시정지, 종료 학생 목록)',
  {},
  async () => {
    const { data, error } = await supabase
      .from('students')
      .select('id, name, grade, test_status, test_remaining_sec, test_duration_min, last_away_at, updated_at')
      .not('test_status', 'is', null)
      .neq('test_status', 'IDLE')
      .order('updated_at', { ascending: false });

    if (error) {
      return { content: [{ type: 'text', text: `❌ 모니터링 조회 실패: ${error.message}` }] };
    }
    return {
      content: [{ type: 'text', text: JSON.stringify(data, null, 2) }]
    };
  }
);

server.tool(
  'eduest_set_student_test_status',
  '학생 시험 상태 원격 제어 (IDLE 초기화, TESTING 복귀 승인 등)',
  {
    studentId: z.string().describe('학생 ID 또는 이름'),
    test_status: z.enum(['IDLE', 'TESTING', 'PAUSED', 'FINISHED']).describe('변경할 시험 상태')
  },
  async ({ studentId, test_status }) => {
    const students = await getAllStudents();
    const student = students.find(s => s.id === studentId || s.name.toLowerCase() === studentId.toLowerCase());
    const targetId = student ? student.id : studentId;

    const payload = { test_status };
    if (test_status === 'IDLE') {
      payload.test_start_at = null;
      payload.last_away_at = null;
      payload.test_remaining_sec = null;
    }
    const { data, error } = await supabase
      .from('students')
      .update(payload)
      .eq('id', targetId)
      .select()
      .single();

    if (error) {
      return { content: [{ type: 'text', text: `❌ 상태 변경 실패: ${error.message}` }] };
    }
    return {
      content: [{ type: 'text', text: `✅ ${data.name} 학생 시험 상태가 [${test_status}]로 변경되었습니다.` }]
    };
  }
);

// ==========================================
// 4. 시험지 관리 & 배포 도구 (Exams & Distribution)
// ==========================================

server.tool(
  'eduest_list_exams',
  '등록된 전체 시험지 목록 조회 (ID, 제목, 학년, 제한시간, 문항 수, 배정 학생 수)',
  {
    grade: z.string().optional().describe('학년 필터 (선택)'),
    search: z.string().optional().describe('시험지 제목 검색어 (선택)')
  },
  async ({ grade, search }) => {
    const examData = await getLibraryRecord(RECORD_IDS.EXAMS, { exams: [] });
    let exams = examData.exams || [];
    if (grade && grade !== '전체') {
      exams = exams.filter(e => e.grade?.includes(grade));
    }
    if (search) {
      exams = exams.filter(e => e.title?.toLowerCase().includes(search.toLowerCase()));
    }

    const list = exams.map(e => ({
      id: e.id,
      title: e.title,
      grade: e.grade,
      duration_min: e.duration_min,
      question_count: e.questions?.length || 0,
      assigned_student_count: e.assigned_student_ids?.length || 0,
      created_at: e.created_at
    }));

    return {
      content: [{ type: 'text', text: JSON.stringify(list, null, 2) }]
    };
  }
);

server.tool(
  'eduest_get_exam_detail',
  '특정 시험지의 상세 정보 및 전체 문항/정답/배점 목록 조회',
  {
    examTitleOrId: z.string().describe('시험지 제목 또는 시험지 ID')
  },
  async ({ examTitleOrId }) => {
    const examData = await getLibraryRecord(RECORD_IDS.EXAMS, { exams: [] });
    const exams = examData.exams || [];
    const exam = exams.find(e => e.id === examTitleOrId || e.title.toLowerCase().includes(examTitleOrId.toLowerCase()));
    if (!exam) {
      return { content: [{ type: 'text', text: `❌ 시험지 [${examTitleOrId}]을(를) 찾을 수 없습니다.` }] };
    }

    const questionsSummary = (exam.questions || []).map((q, idx) => ({
      num: idx + 1,
      id: q.id,
      name: q.name,
      answer: q.answer || q.raw_answer || '-',
      points: q.points || 4,
      is_descriptive: q.is_descriptive || false,
      image_url: q.image_url
    }));

    const result = {
      id: exam.id,
      title: exam.title,
      grade: exam.grade,
      duration_min: exam.duration_min,
      total_questions: exam.questions?.length || 0,
      assigned_students_count: exam.assigned_student_ids?.length || 0,
      questions: questionsSummary
    };

    return {
      content: [{ type: 'text', text: JSON.stringify(result, null, 2) }]
    };
  }
);

server.tool(
  'eduest_assign_exam',
  '시험지를 특정 학생들 또는 특정 반 전체에 배포/배정',
  {
    examTitleOrId: z.string().describe('시험지 제목 또는 시험지 ID'),
    studentNames: z.array(z.string()).optional().describe('배정할 학생 이름 목록 (선택)'),
    className: z.string().optional().describe('배정할 수업/반 이름 (선택, 해당 반 수강생 전원에게 배포)')
  },
  async ({ examTitleOrId, studentNames, className }) => {
    const examData = await getLibraryRecord(RECORD_IDS.EXAMS, { exams: [] });
    const exams = examData.exams || [];
    const exam = exams.find(e => e.id === examTitleOrId || e.title.toLowerCase().includes(examTitleOrId.toLowerCase()));
    if (!exam) {
      return { content: [{ type: 'text', text: `❌ 시험지 [${examTitleOrId}]을(를) 찾을 수 없습니다.` }] };
    }

    if (!exam.assigned_student_ids) exam.assigned_student_ids = [];
    const toAssignIds = [];

    if (className) {
      const classData = await getLibraryRecord(RECORD_IDS.CLASSES, { classes: [] });
      const targetClass = (classData.classes || []).find(c => c.name.toLowerCase().includes(className.toLowerCase()));
      if (targetClass && targetClass.student_ids) {
        toAssignIds.push(...targetClass.student_ids);
      }
    }

    if (studentNames && studentNames.length > 0) {
      const ids = await resolveStudentIds(studentNames);
      toAssignIds.push(...ids);
    }

    const combined = [...new Set([...exam.assigned_student_ids, ...toAssignIds])];
    exam.assigned_student_ids = combined;
    exam.updated_at = new Date().toISOString();

    await saveLibraryRecord(RECORD_IDS.EXAMS, 'test2_exam_papers.json', {
      ...examData,
      exams,
      updated_at: new Date().toISOString()
    });

    return {
      content: [{
        type: 'text',
        text: `✅ 시험지 [${exam.title}] 배포 완료!\n- 새로 추가 배정된 수: ${toAssignIds.length}명\n- 총 배정 학생 수: ${combined.length}명`
      }]
    };
  }
);

server.tool(
  'eduest_list_bundles',
  '시험지 묶음(번들/회차별 코스) 목록 조회',
  {
    grade: z.string().optional().describe('학년 필터 (선택)')
  },
  async ({ grade }) => {
    const bundleData = await getLibraryRecord(RECORD_IDS.BUNDLES, { bundles: [] });
    let bundles = bundleData.bundles || [];
    if (grade && grade !== '전체') {
      bundles = bundles.filter(b => b.grade?.includes(grade));
    }
    return {
      content: [{ type: 'text', text: JSON.stringify(bundles, null, 2) }]
    };
  }
);

// ==========================================
// 5. 복습 & 숙제 제출 현황 & 서술형 채점 도구
// ==========================================

server.tool(
  'eduest_get_review_report',
  '학생들의 복습/숙제/시험 제출 현황 종합 분석 보고서 (미제출자 명단, 제출 완료자 점수, 서술형 채점 대기 건 등)',
  {
    grade: z.string().optional().describe('학년 필터 (선택)'),
    className: z.string().optional().describe('특정 반 필터 (선택)')
  },
  async ({ grade, className }) => {
    let students = await getAllStudents();
    if (grade && grade !== '전체') {
      students = students.filter(s => s.grade?.includes(grade));
    }
    if (className) {
      const classData = await getLibraryRecord(RECORD_IDS.CLASSES, { classes: [] });
      const targetClass = (classData.classes || []).find(c => c.name.toLowerCase().includes(className.toLowerCase()));
      if (targetClass?.student_ids) {
        students = students.filter(s => targetClass.student_ids.includes(s.id));
      }
    }

    const examData = await getLibraryRecord(RECORD_IDS.EXAMS, { exams: [] });
    const subData = await getLibraryRecord(RECORD_IDS.SUBMISSIONS, { submissions: [] });
    const allExams = examData.exams || [];
    const allSubs = subData.submissions || [];

    const studentReport = [];
    for (const student of students) {
      const assignedExams = allExams.filter(e => e.assigned_student_ids?.includes(student.id));
      const mySubs = allSubs.filter(s => s.student_id === student.id);
      const submittedExamIds = new Set(mySubs.map(s => s.exam_id));
      const unsubmitted = assignedExams.filter(e => !submittedExamIds.has(e.id));

      const pendingGradingCount = mySubs.filter(s => s.has_pending_review || (s.pending_count || 0) > 0).length;

      studentReport.push({
        name: student.name,
        grade: student.grade,
        assignedCount: assignedExams.length,
        submittedCount: mySubs.length,
        unsubmittedExams: unsubmitted.map(e => e.title),
        pendingGradingCount,
        recentScore: mySubs.length > 0 ? mySubs[mySubs.length - 1].score : null
      });
    }

    const unsubmittedStudents = studentReport.filter(r => r.unsubmittedExams.length > 0);

    const reportMarkdown = `
### 📑 [복습 & 시험 제출 현황 종합 보고서]
- 대상 학생: 총 ${students.length}명
- ⚠️ 미제출 시험이 있는 학생: ${unsubmittedStudents.length}명

#### 🚨 미제출 학생 명단
${unsubmittedStudents.map(s => `• **${s.name}** (${s.grade || '미지정'}): 미제출 [${s.unsubmittedExams.join(', ')}]`).join('\n') || '• 미제출 학생 없음 (전원 제출 완료)'}

#### 📋 학생별 상세 요약
| 학생명 | 학년 | 배정 | 제출 | 미제출 | 최근점수 | 채점대기 |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
${studentReport.map(r => `| ${r.name} | ${r.grade || '-'} | ${r.assignedCount}개 | ${r.submittedCount}개 | ${r.unsubmittedExams.length}개 | ${r.recentScore !== null ? r.recentScore + '점' : '-'} | ${r.pendingGradingCount}건 |`).join('\n')}
    `.trim();

    return { content: [{ type: 'text', text: reportMarkdown }] };
  }
);

server.tool(
  'eduest_list_submissions',
  '최근 시험 및 복습 제출 기록 목록 조회 (학생명, 시험명, 점수, 제출시간, 서술형 채점 대기 여부)',
  {
    studentName: z.string().optional().describe('학생 이름 필터 (선택)'),
    examTitle: z.string().optional().describe('시험지 제목 필터 (선택)'),
    pendingOnly: z.boolean().default(false).describe('서술형 채점 대기 건만 필터링 여부')
  },
  async ({ studentName, examTitle, pendingOnly }) => {
    const subData = await getLibraryRecord(RECORD_IDS.SUBMISSIONS, { submissions: [] });
    let subs = subData.submissions || [];
    const students = await getAllStudents();
    const studentMap = Object.fromEntries(students.map(s => [s.id, s.name]));

    if (studentName) {
      subs = subs.filter(s => (studentMap[s.student_id] || '').toLowerCase().includes(studentName.toLowerCase()));
    }
    if (examTitle) {
      subs = subs.filter(s => (s.exam_title || '').toLowerCase().includes(examTitle.toLowerCase()));
    }
    if (pendingOnly) {
      subs = subs.filter(s => s.has_pending_review || (s.pending_count || 0) > 0);
    }

    const formatted = subs.map(s => ({
      id: s.id,
      student_name: studentMap[s.student_id] || s.student_id,
      exam_title: s.exam_title,
      score: s.score,
      correct_count: `${s.correct_count} / ${s.total_questions}`,
      has_pending_review: s.has_pending_review || false,
      submitted_at: s.submitted_at
    }));

    return {
      content: [{ type: 'text', text: JSON.stringify(formatted, null, 2) }]
    };
  }
);

server.tool(
  'eduest_grade_descriptive_question',
  '학생의 서술형/주관식 답안 채점 (정답/오답, 획득 점수, 피드백 코멘트 반영)',
  {
    studentName: z.string().describe('학생 이름'),
    examTitle: z.string().describe('시험지 제목'),
    questionIndexOrId: z.string().describe('문항 번호(예: "3") 또는 문항 ID'),
    isCorrect: z.boolean().describe('정답 여부 (true/false)'),
    pointsEarned: z.number().describe('부여할 점수')
  },
  async ({ studentName, examTitle, questionIndexOrId, isCorrect, pointsEarned }) => {
    const students = await getAllStudents();
    const student = students.find(s => s.name.toLowerCase() === studentName.toLowerCase() || s.id === studentName);
    if (!student) {
      return { content: [{ type: 'text', text: `❌ 학생 [${studentName}]을(를) 찾을 수 없습니다.` }] };
    }

    const subData = await getLibraryRecord(RECORD_IDS.SUBMISSIONS, { submissions: [] });
    const subs = subData.submissions || [];
    const sub = subs.find(s => s.student_id === student.id && s.exam_title.toLowerCase().includes(examTitle.toLowerCase()));
    if (!sub) {
      return { content: [{ type: 'text', text: `❌ [${student.name}] 학생의 [${examTitle}] 제출 기록을 찾을 수 없습니다.` }] };
    }

    if (!sub.answers) sub.answers = {};

    let targetQId = questionIndexOrId;
    if (!sub.answers[targetQId]) {
      const qNum = parseInt(questionIndexOrId, 10);
      if (!isNaN(qNum)) {
        const keys = Object.keys(sub.answers);
        if (keys[qNum - 1]) targetQId = keys[qNum - 1];
      }
    }

    if (sub.answers[targetQId]) {
      sub.answers[targetQId].is_correct = isCorrect;
      sub.answers[targetQId].grading_status = 'graded';
      sub.answers[targetQId].reviewed_at = new Date().toISOString();
    }

    // 총점 및 맞은 개수 재계산
    let totalScore = 0;
    let correctCount = 0;
    for (const ans of Object.values(sub.answers)) {
      if (ans.is_correct) {
        correctCount += 1;
        totalScore += ans.points || 4;
      }
    }
    sub.score = totalScore;
    sub.correct_count = correctCount;
    sub.has_pending_review = false;

    await saveLibraryRecord(RECORD_IDS.SUBMISSIONS, 'test2_student_submissions.json', {
      ...subData,
      submissions: subs,
      updated_at: new Date().toISOString()
    });

    return {
      content: [{
        type: 'text',
        text: `✅ [${student.name}] 학생의 [${sub.exam_title}] 문항 채점 완료!\n- 정답 여부: ${isCorrect ? '⭕ 정답' : '❌ 오답'}\n- 부여 점수: ${pointsEarned}점\n- 학생 최종 총점: ${sub.score}점`
      }]
    };
  }
);

// ==========================================
// 6. 시험지 완벽 인쇄 & A4 출력 도구 (Print Engine)
// ==========================================

server.tool(
  'eduest_generate_printable_exam',
  '시험지를 실제 인쇄 가능한 A4 규격(1/2/4/6문항/페이지, 2단 배치, 상단 시험정보 및 성명란, 빠른 정답표) HTML 문서로 즉시 생성하고 윈도우 브라우저/인쇄창 자동 팝업',
  {
    examTitleOrId: z.string().describe('시험지 제목 또는 시험지 ID'),
    questionsPerPage: z.enum(['1', '2', '4', '6']).default('4').describe('한 페이지당 문항 수 (1, 2, 4, 6)'),
    columns: z.enum(['1', '2']).default('2').describe('단 수 (1단 또는 2단)'),
    academyName: z.string().default('Eduest 수학학원').describe('상단 표시 학원명'),
    includeAnswerKey: z.boolean().default(true).describe('마지막 장에 빠른 정답표/배점표 포함 여부'),
    autoOpen: z.boolean().default(true).describe('생성 즉시 윈도우 기본 웹브라우저로 열기'),
    autoPrint: z.boolean().default(false).describe('브라우저 열릴 때 인쇄 대화상자(window.print) 자동 실행 여부')
  },
  async ({ examTitleOrId, questionsPerPage, columns, academyName, includeAnswerKey, autoOpen, autoPrint }) => {
    const examData = await getLibraryRecord(RECORD_IDS.EXAMS, { exams: [] });
    const exams = examData.exams || [];
    const exam = exams.find(e => e.id === examTitleOrId || e.title.toLowerCase().includes(examTitleOrId.toLowerCase()));
    if (!exam) {
      return { content: [{ type: 'text', text: `❌ 시험지 [${examTitleOrId}]을(를) 찾을 수 없습니다.` }] };
    }

    const qPerPage = parseInt(questionsPerPage, 10);
    const colCount = parseInt(columns, 10);
    const questions = exam.questions || [];

    const pages = [];
    for (let i = 0; i < questions.length; i += qPerPage) {
      pages.push(questions.slice(i, i + qPerPage));
    }
    const totalPages = pages.length + (includeAnswerKey ? 1 : 0);

    const printsDir = path.join(projectRoot, 'public', 'prints');
    fs.mkdirSync(printsDir, { recursive: true });

    const cleanId = exam.id.replace(/[^a-zA-Z0-9_-]/g, '_');
    const outFilePath = path.join(printsDir, `exam_${cleanId}.html`);

    let htmlPages = '';

    pages.forEach((pageQuestions, pIdx) => {
      const pageNum = pIdx + 1;
      const questionItemsHtml = pageQuestions.map((q, qInPageIdx) => {
        const globalQNum = pIdx * qPerPage + qInPageIdx + 1;
        const pointsBadge = q.points ? `<span class="q-points">[${q.points}점]</span>` : '';
        const imgTag = q.image_url 
          ? `<div class="q-img-wrap"><img src="${q.image_url}" class="q-img" alt="문항 ${globalQNum}" /></div>`
          : `<div class="q-empty">문항 이미지가 없습니다.</div>`;

        return `
          <div class="question-card">
            <div class="q-header">
              <span class="q-num">${globalQNum}번</span>
              ${pointsBadge}
            </div>
            ${imgTag}
          </div>
        `;
      }).join('\n');

      htmlPages += `
        <div class="a4-sheet">
          <header class="sheet-header">
            <div class="header-left">
              <div class="academy-tag">${academyName}</div>
              <h1 class="exam-title">${exam.title} <span class="grade-badge">[${exam.grade || '공통'}]</span></h1>
            </div>
            <div class="header-right">
              <div class="student-box">
                <span class="box-label">점수</span>
                <span class="box-val">/ 100</span>
              </div>
              <div class="student-box name-box">
                <span class="box-label">이름</span>
                <span class="box-val"></span>
              </div>
            </div>
          </header>

          <main class="sheet-body cols-${colCount}">
            ${questionItemsHtml}
          </main>

          <footer class="sheet-footer">
            <span>Eduest Learning Management System</span>
            <span>- ${pageNum} / ${totalPages} -</span>
          </footer>
        </div>
      `;
    });

    if (includeAnswerKey) {
      const answerRows = questions.map((q, idx) => `
        <tr>
          <td>${idx + 1}</td>
          <td class="bold">${q.answer || q.raw_answer || '-'}</td>
          <td>${q.points || 4}점</td>
          <td>${q.question_type || (q.is_descriptive ? '서술형' : '선택형')}</td>
        </tr>
      `).join('\n');

      htmlPages += `
        <div class="a4-sheet">
          <header class="sheet-header">
            <div class="header-left">
              <div class="academy-tag">${academyName}</div>
              <h1 class="exam-title">${exam.title} - 빠른 정답 및 배점표</h1>
            </div>
          </header>

          <main class="sheet-body answer-sheet-body">
            <table class="answer-table">
              <thead>
                <tr>
                  <th>번호</th>
                  <th>정답</th>
                  <th>배점</th>
                  <th>유형</th>
                </tr>
              </thead>
              <tbody>
                ${answerRows}
              </tbody>
            </table>
          </main>

          <footer class="sheet-footer">
            <span>Eduest Learning Management System</span>
            <span>- ${totalPages} / ${totalPages} -</span>
          </footer>
        </div>
      `;
    }

    const fullHtml = `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="utf-8" />
  <title>${exam.title} - 시험지 인쇄</title>
  <style>
    @page {
      size: A4 portrait;
      margin: 0;
    }
    *, *::before, *::after {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Malgun Gothic", "맑은 고딕", Roboto, sans-serif;
      background: #4a4d50;
      color: #111;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    @media screen {
      body {
        padding: 24px 0;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 20px;
      }
      .toolbar {
        position: sticky;
        top: 16px;
        z-index: 9999;
        background: #1e293b;
        color: #fff;
        padding: 12px 24px;
        border-radius: 9999px;
        box-shadow: 0 10px 25px rgba(0,0,0,0.4);
        display: flex;
        align-items: center;
        gap: 16px;
      }
      .btn-print {
        background: #2563eb;
        color: #fff;
        border: none;
        padding: 8px 18px;
        border-radius: 9999px;
        font-weight: 600;
        cursor: pointer;
        font-size: 14px;
        transition: background 0.2s;
      }
      .btn-print:hover {
        background: #1d4ed8;
      }
      .a4-sheet {
        box-shadow: 0 8px 24px rgba(0,0,0,0.25);
      }
    }
    @media print {
      body {
        background: #fff;
      }
      .toolbar {
        display: none !important;
      }
    }
    .a4-sheet {
      width: 210mm;
      height: 297mm;
      min-height: 297mm;
      max-height: 297mm;
      padding: 12mm 15mm;
      background: #fff;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      page-break-after: always;
      position: relative;
    }
    .sheet-header {
      border-bottom: 2px solid #111;
      padding-bottom: 8px;
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
    }
    .academy-tag {
      font-size: 11px;
      font-weight: 700;
      color: #2563eb;
      letter-spacing: -0.5px;
      margin-bottom: 2px;
    }
    .exam-title {
      font-size: 19px;
      font-weight: 800;
      color: #111;
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .grade-badge {
      font-size: 13px;
      color: #4b5563;
      font-weight: 600;
    }
    .header-right {
      display: flex;
      gap: 8px;
    }
    .student-box {
      border: 1px solid #333;
      border-radius: 4px;
      width: 80px;
      height: 38px;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      padding: 3px 6px;
    }
    .name-box {
      width: 100px;
    }
    .box-label {
      font-size: 9px;
      color: #6b7280;
      font-weight: 600;
    }
    .box-val {
      font-size: 12px;
      font-weight: 700;
      text-align: right;
    }
    .sheet-body {
      flex: 1;
      display: grid;
      gap: 12px;
      padding: 12px 0;
      align-content: stretch;
    }
    .cols-1 {
      grid-template-columns: 1fr;
    }
    .cols-2 {
      grid-template-columns: 1fr 1fr;
    }
    .question-card {
      border: 1px dashed #d1d5db;
      border-radius: 6px;
      padding: 8px 10px;
      display: flex;
      flex-direction: column;
      justify-content: flex-start;
      overflow: hidden;
      background: #fafafa;
    }
    .q-header {
      display: flex;
      align-items: center;
      gap: 6px;
      margin-bottom: 6px;
    }
    .q-num {
      font-size: 14px;
      font-weight: 800;
      color: #1e3a8a;
    }
    .q-points {
      font-size: 11px;
      font-weight: 600;
      color: #6b7280;
    }
    .q-img-wrap {
      flex: 1;
      display: flex;
      align-items: center;
      justify-content: center;
      overflow: hidden;
    }
    .q-img {
      max-width: 100%;
      max-height: 100%;
      object-fit: contain;
    }
    .q-empty {
      color: #9ca3af;
      font-size: 12px;
      text-align: center;
      padding: 20px 0;
    }
    .sheet-footer {
      border-top: 1px solid #e5e7eb;
      padding-top: 6px;
      display: flex;
      justify-content: space-between;
      font-size: 10px;
      color: #6b7280;
    }
    .answer-sheet-body {
      padding: 20px 0;
    }
    .answer-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 13px;
    }
    .answer-table th, .answer-table td {
      border: 1px solid #cbd5e1;
      padding: 8px 12px;
      text-align: center;
    }
    .answer-table th {
      background: #f1f5f9;
      font-weight: 700;
    }
    .answer-table td.bold {
      font-weight: 700;
      color: #2563eb;
    }
  </style>
  ${autoPrint ? '<script>window.onload = function() { setTimeout(function() { window.print(); }, 400); };</script>' : ''}
</head>
<body>
  <div class="toolbar">
    <span>🖨️ ${exam.title} (${questions.length}문항, 총 ${totalPages}페이지)</span>
    <button class="btn-print" onclick="window.print()">인쇄하기 (Ctrl+P)</button>
  </div>
  ${htmlPages}
</body>
</html>`;

    fs.writeFileSync(outFilePath, fullHtml, 'utf8');

    if (autoOpen) {
      exec(`start "" "${outFilePath}"`, (err) => {
        if (err) console.error('Failed to open browser:', err);
      });
    }

    return {
      content: [{
        type: 'text',
        text: `✅ 시험지 [${exam.title}] A4 인쇄 문서 생성 완료!\n- 총 문항: ${questions.length}개\n- 총 페이지: ${totalPages}페이지 (정답표 포함: ${includeAnswerKey})\n- 생성 경로: ${outFilePath}\n- 브라우저 자동 실행: ${autoOpen ? '화면에 브라우저로 바로 띄웠습니다.' : '아니오'}`
      }]
    };
  }
);

// ==========================================
// 7. Google Drive 및 라이브러리 자료 관리 도구
// ==========================================

server.tool(
  'eduest_list_materials',
  'Google Drive 수업 자료/카트리지 목록 조회 (metadata.json)',
  {},
  async () => {
    try {
      const res = await callGas('fetch_metadata');
      if (res.success) {
        return {
          content: [{ type: 'text', text: JSON.stringify(res.materials || [], null, 2) }]
        };
      }
      return { content: [{ type: 'text', text: `❌ 자료 목록 조회 실패: ${res.error}` }] };
    } catch (err) {
      return { content: [{ type: 'text', text: `❌ GAS 통신 에러: ${err.message}` }] };
    }
  }
);

server.tool(
  'eduest_create_material_set',
  '새 수업 자료 세트 생성 (Google Drive에 본체/문제/해설/노트 4개 폴더 자동 생성)',
  {
    title: z.string().describe('자료 이름 (예: 1학기 중간고사 기출)'),
    count: z.number().describe('문항 수 (예: 25)')
  },
  async ({ title, count }) => {
    try {
      const res = await callGas('create_material_set', { title, count });
      if (res.success) {
        return {
          content: [{ type: 'text', text: `✅ 자료 세트 [${title}] 생성 완료!\n${JSON.stringify(res.material, null, 2)}` }]
        };
      }
      return { content: [{ type: 'text', text: `❌ 생성 실패: ${res.error}` }] };
    } catch (err) {
      return { content: [{ type: 'text', text: `❌ GAS 통신 에러: ${err.message}` }] };
    }
  }
);

server.tool(
  'eduest_delete_material',
  '수업 자료 세트 삭제 (Google Drive 폴더 휴지통 이동)',
  {
    materialId: z.string().describe('자료 ID'),
    mainFolderId: z.string().describe('자료 메인 폴더 ID')
  },
  async ({ materialId, mainFolderId }) => {
    try {
      const res = await callGas('delete_material', { materialId, mainFolderId });
      if (res.success) {
        return { content: [{ type: 'text', text: `✅ 자료 세트 삭제 완료!` }] };
      }
      return { content: [{ type: 'text', text: `❌ 삭제 실패: ${res.error}` }] };
    } catch (err) {
      return { content: [{ type: 'text', text: `❌ 에러: ${err.message}` }] };
    }
  }
);

server.tool(
  'eduest_sync_library_to_supabase',
  'Google Drive 시험지 라이브러리 전체 구조를 Supabase exam_library 테이블로 고속 동기화',
  {},
  async () => {
    try {
      const res = await callGas('sync_to_supabase');
      if (res.success) {
        return { content: [{ type: 'text', text: `✅ 라이브러리 동기화 완료: ${res.message || '완료됨'}` }] };
      }
      return { content: [{ type: 'text', text: `❌ 동기화 실패: ${res.error}` }] };
    } catch (err) {
      return { content: [{ type: 'text', text: `❌ 에러: ${err.message}` }] };
    }
  }
);

server.tool(
  'eduest_drive_list_files',
  '특정 Google Drive 폴더 내의 파일 및 서브폴더 목록 조회',
  {
    folderId: z.string().describe('Google Drive 폴더 ID')
  },
  async ({ folderId }) => {
    try {
      const drive = getGoogleDrive();
      const res = await drive.files.list({
        q: `'${folderId}' in parents and trashed = false`,
        fields: 'files(id, name, mimeType, modifiedTime, size)',
        orderBy: 'name',
        pageSize: 50
      });
      return {
        content: [{ type: 'text', text: JSON.stringify(res.data.files || [], null, 2) }]
      };
    } catch (err) {
      return { content: [{ type: 'text', text: `❌ 드라이브 파일 조회 실패: ${err.message}` }] };
    }
  }
);

// ==========================================
// 8. Supabase Storage (버킷) & 파일 업로드 도구
// ==========================================

server.tool(
  'eduest_storage_list_buckets',
  'Supabase Storage 버킷 목록 조회',
  {},
  async () => {
    const { data, error } = await supabase.storage.listBuckets();
    if (error) {
      return { content: [{ type: 'text', text: `❌ 버킷 목록 조회 실패: ${error.message}` }] };
    }
    return {
      content: [{ type: 'text', text: JSON.stringify(data || [], null, 2) }]
    };
  }
);

server.tool(
  'eduest_storage_create_bucket',
  'Supabase Storage 새 버킷 생성',
  {
    bucketName: z.string().describe('생성할 버킷 이름 (소문자, 영숫자, 하이픈)'),
    isPublic: z.boolean().default(true).describe('공개 버킷 여부 (기본값: true)')
  },
  async ({ bucketName, isPublic }) => {
    const { data, error } = await supabase.storage.createBucket(bucketName, {
      public: isPublic
    });
    if (error) {
      return { content: [{ type: 'text', text: `❌ 버킷 생성 실패: ${error.message}` }] };
    }
    return {
      content: [{ type: 'text', text: `✅ [${bucketName}] 버킷 생성 완료 (공개: ${isPublic})` }]
    };
  }
);

server.tool(
  'eduest_storage_upload_file',
  'Supabase Storage 버킷에 텍스트 또는 Base64 파일 업로드',
  {
    bucketName: z.string().describe('대상 버킷 이름'),
    filePath: z.string().describe('버킷 내 저장할 경로/파일명 (예: exams/q1.png)'),
    content: z.string().describe('업로드할 텍스트 내용 또는 Base64 인코딩 데이터'),
    isBase64: z.boolean().default(false).describe('내용이 Base64 형식인지 여부'),
    contentType: z.string().default('text/plain').describe('파일 MIME 타입 (예: image/png, application/pdf)')
  },
  async ({ bucketName, filePath, content, isBase64, contentType }) => {
    try {
      const buffer = isBase64 ? Buffer.from(content, 'base64') : Buffer.from(content, 'utf8');
      const { data, error } = await supabase.storage
        .from(bucketName)
        .upload(filePath, buffer, {
          contentType,
          upsert: true
        });

      if (error) throw error;

      const { data: urlData } = supabase.storage.from(bucketName).getPublicUrl(filePath);
      return {
        content: [{
          type: 'text',
          text: `✅ 파일 업로드 완료!\n- 경로: ${filePath}\n- 공개 URL: ${urlData.publicUrl}`
        }]
      };
    } catch (err) {
      return { content: [{ type: 'text', text: `❌ 업로드 실패: ${err.message}` }] };
    }
  }
);

server.tool(
  'eduest_drive_upload_file',
  'Google Drive 특정 폴더에 텍스트 또는 Base64 파일 직접 업로드',
  {
    folderId: z.string().describe('Google Drive 대상 폴더 ID'),
    fileName: z.string().describe('저장할 파일 이름'),
    content: z.string().describe('파일 텍스트 내용 또는 Base64 데이터'),
    isBase64: z.boolean().default(false).describe('Base64 여부'),
    mimeType: z.string().default('text/plain').describe('MIME 타입')
  },
  async ({ folderId, fileName, content, isBase64, mimeType }) => {
    try {
      const drive = getGoogleDrive();
      const { Readable } = await import('stream');
      const buffer = isBase64 ? Buffer.from(content, 'base64') : Buffer.from(content, 'utf8');
      const stream = Readable.from(buffer);

      const res = await drive.files.create({
        requestBody: {
          name: fileName,
          parents: [folderId]
        },
        media: {
          mimeType,
          body: stream
        },
        fields: 'id, name, webViewLink',
        supportsAllDrives: true
      });

      return {
        content: [{
          type: 'text',
          text: `✅ Google Drive 파일 업로드 완료!\n- 파일명: ${fileName}\n- 파일 ID: ${res.data.id}\n- 링크: ${res.data.webViewLink || '생성됨'}`
        }]
      };
    } catch (err) {
      return { content: [{ type: 'text', text: `❌ 드라이브 업로드 실패: ${err.message}` }] };
    }
  }
);

// 서버 기동
const transport = new StdioServerTransport();
await server.connect(transport);
console.error('🚀 EduEst MCP Server v2.0.0 connected on stdio');
