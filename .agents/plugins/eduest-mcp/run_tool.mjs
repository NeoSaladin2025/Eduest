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
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

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

async function getAllStudents() {
  const { data, error } = await supabase.from('students').select('*').order('name');
  if (error) throw error;
  return data || [];
}

const toolName = process.argv[2];
const toolArgs = process.argv[3] ? JSON.parse(process.argv[3]) : {};

async function execute() {
  if (toolName === 'eduest_list_classes') {
    const classData = await getLibraryRecord(RECORD_IDS.CLASSES, { classes: [] });
    const students = await getAllStudents();
    const studentMap = Object.fromEntries(students.map(s => [s.id, s.name]));
    let classes = classData.classes || [];
    if (toolArgs.grade && toolArgs.grade !== '전체') {
      classes = classes.filter(c => c.grade?.includes(toolArgs.grade));
    }
    const summary = classes.map(c => ({
      id: c.id,
      name: c.name,
      grade: c.grade,
      days: c.days || [],
      time: c.time || '',
      capacity: c.capacity || 0,
      student_count: (c.student_ids || []).length,
      students: (c.student_ids || []).map(id => studentMap[id] || id)
    }));
    console.log(JSON.stringify(summary, null, 2));
  } else if (toolName === 'eduest_get_students_summary') {
    const students = await getAllStudents();
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
    console.log(`| 이름 | 학년 | 소속 반 | 현재 상태 | 최근 시험 | 계정 |\n| :--- | :--- | :--- | :--- | :--- | :--- |\n${rows.join('\n')}`);
  } else if (toolName === 'eduest_get_library_content_analytics') {
    const data = await getLibraryRecord('home_study_sessions', { records: {} });
    let records = Object.values(data.records || {});
    if (toolArgs.grade && toolArgs.grade !== '전체' && toolArgs.grade !== 'ALL') {
      records = records.filter(r => r.student_grade && r.student_grade.includes(toolArgs.grade));
    }
    const folderStats = {};
    records.forEach(r => {
      const stName = r.student_name;
      (r.sessions || []).forEach(ses => {
        (ses.activities || []).forEach(act => {
          if (act.mode !== 'library' || (act.duration_sec || 0) <= 0) return;
          const dur = act.duration_sec || 0;
          const title = act.title || '';
          const sub = act.sub_detail || '';
          const clean = title.replace(/^라이브러리\s*>\s*/i, '').trim();
          if (!clean || clean === '홈 화면') return;
          let targetFolder = '', targetDoc = '';
          const bracketMatch = clean.match(/\[(.*?)\](?:\s*>\s*(.*?))?$/);
          if (bracketMatch) {
            targetFolder = bracketMatch[1].trim();
            if (bracketMatch[2]) targetDoc = bracketMatch[2].trim();
          } else if (clean.includes('>')) {
            const parts = clean.split('>').map(p => p.trim());
            targetFolder = parts[parts.length - 2] || parts[0];
            targetDoc = parts[parts.length - 1];
          } else {
            targetFolder = clean;
          }
          if (!targetFolder) return;
          if (toolArgs.folder_name && !targetFolder.toLowerCase().includes(toolArgs.folder_name.toLowerCase()) && !clean.toLowerCase().includes(toolArgs.folder_name.toLowerCase())) return;

          if (!folderStats[targetFolder]) {
            folderStats[targetFolder] = { duration: 0, students: new Set(), sessions: 0, files: {} };
          }
          const fEntry = folderStats[targetFolder];
          fEntry.duration += dur;
          fEntry.students.add(stName);
          fEntry.sessions += 1;
          if (targetDoc) {
            const cleanDoc = targetDoc.replace(/\.html?$/i, '');
            if (!fEntry.files[cleanDoc]) {
              fEntry.files[cleanDoc] = { duration: 0, students: new Set(), views: 0, solutionViews: 0 };
            }
            const fileEntry = fEntry.files[cleanDoc];
            fileEntry.duration += dur;
            fileEntry.students.add(stName);
            fileEntry.views += 1;
            if (sub.includes('해설')) fileEntry.solutionViews += 1;
          }
        });
      });
    });
    console.log(JSON.stringify(Object.fromEntries(Object.entries(folderStats).map(([k, v]) => [k, {
      duration_sec: v.duration,
      duration_min: Math.round(v.duration / 60),
      student_count: v.students.size,
      session_count: v.sessions,
      files: Object.fromEntries(Object.entries(v.files).map(([fk, fv]) => [fk, {
        duration_sec: fv.duration,
        duration_min: Math.round(fv.duration / 60),
        views: fv.views,
        solution_views: fv.solutionViews
      }]))
    }])), null, 2));
  } else {
    console.log(`Tool ${toolName} not directly handled in CLI runner`);
  }
}

execute().catch(e => console.error(e));
