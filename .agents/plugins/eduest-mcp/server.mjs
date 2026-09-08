import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { createClient } from '@supabase/supabase-js';
import { google } from 'googleapis';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

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

// MCP 서버 인스턴스 생성
const server = new McpServer({
  name: 'eduest-mcp',
  version: '1.0.0'
});

// ==========================================
// 1. 학생 관리 도구 (Supabase Students)
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
      // 1. Google Drive 학생 폴더 생성
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

      // 2. 4자리 랜덤 비밀번호 생성
      const tempPassword = String(Math.floor(1000 + Math.random() * 9000));

      // 3. Supabase DB 저장
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
      // 1. 학생 정보 조회
      const { data: student, error: fetchErr } = await supabase
        .from('students')
        .select('name, drive_folder_id')
        .eq('id', studentId)
        .single();

      if (fetchErr || !student) {
        return { content: [{ type: 'text', text: `❌ 학생을 찾을 수 없습니다: ${fetchErr?.message}` }] };
      }

      // 2. 드라이브 폴더 휴지통 이동
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

      // 3. DB 삭제
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
// 2. 시험 감독 (Proctoring) 도구
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
    studentId: z.string().describe('학생 ID'),
    test_status: z.enum(['IDLE', 'TESTING', 'PAUSED', 'FINISHED']).describe('변경할 시험 상태')
  },
  async ({ studentId, test_status }) => {
    const payload = { test_status };
    if (test_status === 'IDLE') {
      payload.test_start_at = null;
      payload.last_away_at = null;
      payload.test_remaining_sec = null;
    }
    const { data, error } = await supabase
      .from('students')
      .update(payload)
      .eq('id', studentId)
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
// 3. Google Drive / GAS 자료 관리 도구
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
// 4. Supabase Storage (버킷) & 파일 업로드 도구
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
console.error('🚀 EduEst MCP Server connected on stdio');
