import fs from 'fs';
import path from 'path';

const tools = [
  {
    name: 'eduest_list_students',
    description: '학생 목록 조회 (학년별 필터, 이름 검색, 잠금 상태 등 확인)',
    parameters: {
      type: 'object',
      properties: {
        grade: { type: 'string', description: '학년 필터 (예: 중1, 중2, 중3, 고1, 고2, 고3)' },
        search: { type: 'string', description: '학생 이름 검색어' }
      }
    }
  },
  {
    name: 'eduest_get_student_detail',
    description: '특정 학생의 상세 종합 프로필 및 상태 조회 (인적사항, 소속 반, 실시간 시험 진행/이탈 상태, 최근 시험 점수, 복습/과제 미완료 건수 등 종합 브리핑)',
    parameters: {
      type: 'object',
      properties: {
        search: { type: 'string', description: '학생 이름 또는 학생 ID (예: 김서율 또는 UUID)' }
      },
      required: ['search']
    }
  },
  {
    name: 'eduest_get_students_summary',
    description: '전체 또는 학년별 학생 종합 현황 요약 (현재 상태(시험중/이탈/대기), 소속 반, 복습 미완료 현황 등 종합 집계)',
    parameters: {
      type: 'object',
      properties: {
        grade: { type: 'string', description: '학년 필터 (선택, 예: 중3, 고1)' }
      }
    }
  },
  {
    name: 'eduest_create_student',
    description: '신규 학생 등록 (Google Drive 전용 폴더 자동 생성 및 Supabase DB 저장)',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: '학생 이름' },
        grade: { type: 'string', description: '학년 (예: 중3, 고1)' }
      },
      required: ['name', 'grade']
    }
  },
  {
    name: 'eduest_update_student',
    description: '학생 정보 업데이트 (잠금 여부 is_unlocked, 비밀번호 password, 학년 grade, 권한 unlocked_folders)',
    parameters: {
      type: 'object',
      properties: {
        studentId: { type: 'string', description: '학생 Supabase ID' },
        is_unlocked: { type: 'boolean', description: '라이브러리 전체 잠금 해제 여부 (true/false)' },
        password: { type: 'string', description: '4자리 숫자 비밀번호' },
        grade: { type: 'string', description: '학년 변경' },
        unlocked_folders: { type: 'array', items: { type: 'string' }, description: '열람 가능한 회차 폴더 ID 목록' }
      },
      required: ['studentId']
    }
  },
  {
    name: 'eduest_delete_student',
    description: '학생 삭제 (Supabase DB 삭제 및 Google Drive 폴더 휴지통 이동)',
    parameters: {
      type: 'object',
      properties: {
        studentId: { type: 'string', description: '학생 Supabase ID' }
      },
      required: ['studentId']
    }
  },
  {
    name: 'eduest_list_classes',
    description: '개설된 전체 수업/반 목록 조회 (수업명, 학년, 요일/시간, 수강생 수 및 명단)',
    parameters: {
      type: 'object',
      properties: {
        grade: { type: 'string', description: '학년 필터 (선택)' }
      }
    }
  },
  {
    name: 'eduest_create_class',
    description: '새로운 수업/반 개설 및 학생 등록 (DB class_schedule_root_data에 즉시 반영)',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: '수업/반 이름 (예: 고1 화목 정규반)' },
        grade: { type: 'string', description: '대상 학년 (예: 고1, 중3)' },
        days: { type: 'array', items: { type: 'string' }, description: '수업 요일 (예: ["화", "목"])' },
        time: { type: 'string', description: '수업 시간 (예: 17:00 ~ 19:00)' },
        room: { type: 'string', description: '강의실 (선택, 예: 301호)' },
        capacity: { type: 'number', description: '정원 (기본: 15)' },
        studentNames: { type: 'array', items: { type: 'string' }, description: '등록할 학생 이름 목록 (예: ["김서율", "김도현"])' }
      },
      required: ['name', 'grade']
    }
  },
  {
    name: 'eduest_update_class',
    description: '기존 수업 정보 수정 (수업명, 요일, 시간, 강의실, 정원 등)',
    parameters: {
      type: 'object',
      properties: {
        classNameOrId: { type: 'string', description: '대상 수업 이름 또는 수업 ID' },
        name: { type: 'string', description: '새로운 수업명' },
        days: { type: 'array', items: { type: 'string' }, description: '새로운 요일 목록' },
        time: { type: 'string', description: '새로운 시간' },
        room: { type: 'string', description: '새로운 강의실' },
        capacity: { type: 'number', description: '새로운 정원' }
      },
      required: ['classNameOrId']
    }
  },
  {
    name: 'eduest_assign_students_to_class',
    description: '특정 수업에 학생들을 추가 배정하거나 제외',
    parameters: {
      type: 'object',
      properties: {
        classNameOrId: { type: 'string', description: '대상 수업 이름 또는 수업 ID' },
        studentNames: { type: 'array', items: { type: 'string' }, description: '추가/제외할 학생 이름 목록' },
        action: { type: 'string', enum: ['add', 'remove'], description: '작업 구분: add(추가) 또는 remove(제외)' }
      },
      required: ['classNameOrId', 'studentNames']
    }
  },
  {
    name: 'eduest_delete_class',
    description: '수업/반 삭제',
    parameters: {
      type: 'object',
      properties: {
        classNameOrId: { type: 'string', description: '삭제할 수업 이름 또는 수업 ID' }
      },
      required: ['classNameOrId']
    }
  },
  {
    name: 'eduest_get_proctoring_status',
    description: '실시간 시험 감독 현황 조회 (시험 중, 이탈, 일시정지, 종료 학생 목록)',
    parameters: {
      type: 'object',
      properties: {}
    }
  },
  {
    name: 'eduest_set_student_test_status',
    description: '학생 시험 상태 원격 제어 (IDLE 초기화, TESTING 복귀 승인 등)',
    parameters: {
      type: 'object',
      properties: {
        studentId: { type: 'string', description: '학생 ID 또는 이름' },
        test_status: { type: 'string', enum: ['IDLE', 'TESTING', 'PAUSED', 'FINISHED'], description: '변경할 시험 상태' }
      },
      required: ['studentId', 'test_status']
    }
  },
  {
    name: 'eduest_list_exams',
    description: '등록된 전체 시험지 목록 조회 (ID, 제목, 학년, 제한시간, 문항 수, 배정 학생 수)',
    parameters: {
      type: 'object',
      properties: {
        grade: { type: 'string', description: '학년 필터 (선택)' },
        search: { type: 'string', description: '시험지 제목 검색어 (선택)' }
      }
    }
  },
  {
    name: 'eduest_get_exam_detail',
    description: '특정 시험지의 상세 정보 및 전체 문항/정답/배점 목록 조회',
    parameters: {
      type: 'object',
      properties: {
        examTitleOrId: { type: 'string', description: '시험지 제목 또는 시험지 ID' }
      },
      required: ['examTitleOrId']
    }
  },
  {
    name: 'eduest_assign_exam',
    description: '시험지를 특정 학생들 또는 특정 반 전체에 배포/배정',
    parameters: {
      type: 'object',
      properties: {
        examTitleOrId: { type: 'string', description: '시험지 제목 또는 시험지 ID' },
        studentNames: { type: 'array', items: { type: 'string' }, description: '배정할 학생 이름 목록 (선택)' },
        className: { type: 'string', description: '배정할 수업/반 이름 (선택, 해당 반 수강생 전원에게 배포)' }
      },
      required: ['examTitleOrId']
    }
  },
  {
    name: 'eduest_list_bundles',
    description: '시험지 묶음(번들/회차별 코스) 목록 조회',
    parameters: {
      type: 'object',
      properties: {
        grade: { type: 'string', description: '학년 필터 (선택)' }
      }
    }
  },
  {
    name: 'eduest_get_review_report',
    description: '학생들의 복습/숙제/시험 제출 현황 종합 분석 보고서 (미제출자 명단, 제출 완료자 점수, 서술형 채점 대기 건 등)',
    parameters: {
      type: 'object',
      properties: {
        grade: { type: 'string', description: '학년 필터 (선택)' },
        className: { type: 'string', description: '특정 반 필터 (선택)' }
      }
    }
  },
  {
    name: 'eduest_list_submissions',
    description: '최근 시험 및 복습 제출 기록 목록 조회 (학생명, 시험명, 점수, 제출시간, 서술형 채점 대기 여부)',
    parameters: {
      type: 'object',
      properties: {
        studentName: { type: 'string', description: '학생 이름 필터 (선택)' },
        examTitle: { type: 'string', description: '시험지 제목 필터 (선택)' },
        pendingOnly: { type: 'boolean', description: '서술형 채점 대기 건만 필터링 여부' }
      }
    }
  },
  {
    name: 'eduest_grade_descriptive_question',
    description: '학생의 서술형/주관식 답안 채점 (정답/오답, 획득 점수, 피드백 코멘트 반영)',
    parameters: {
      type: 'object',
      properties: {
        studentName: { type: 'string', description: '학생 이름' },
        examTitle: { type: 'string', description: '시험지 제목' },
        questionIndexOrId: { type: 'string', description: '문항 번호(예: "3") 또는 문항 ID' },
        isCorrect: { type: 'boolean', description: '정답 여부 (true/false)' },
        pointsEarned: { type: 'number', description: '부여할 점수' }
      },
      required: ['studentName', 'examTitle', 'questionIndexOrId', 'isCorrect', 'pointsEarned']
    }
  },
  {
    name: 'eduest_generate_printable_exam',
    description: '시험지를 실제 인쇄 가능한 A4 규격(1/2/4/6문항/페이지, 2단 배치, 상단 시험정보 및 성명란, 빠른 정답표) HTML 문서로 즉시 생성하고 윈도우 브라우저/인쇄창 자동 팝업',
    parameters: {
      type: 'object',
      properties: {
        examTitleOrId: { type: 'string', description: '시험지 제목 또는 시험지 ID' },
        questionsPerPage: { type: 'string', enum: ['1', '2', '4', '6'], description: '한 페이지당 문항 수 (1, 2, 4, 6, 기본값: 4)' },
        columns: { type: 'string', enum: ['1', '2'], description: '단 수 (1단 또는 2단, 기본값: 2)' },
        academyName: { type: 'string', description: '상단 표시 학원명 (기본값: Eduest 수학학원)' },
        includeAnswerKey: { type: 'boolean', description: '마지막 장에 빠른 정답표/배점표 포함 여부 (기본값: true)' },
        autoOpen: { type: 'boolean', description: '생성 즉시 윈도우 기본 웹브라우저로 열기 (기본값: true)' },
        autoPrint: { type: 'boolean', description: '브라우저 열릴 때 인쇄 대화상자(window.print) 자동 실행 여부 (기본값: false)' }
      },
      required: ['examTitleOrId']
    }
  },
  {
    name: 'eduest_list_materials',
    description: 'Google Drive 수업 자료/카트리지 목록 조회 (metadata.json)',
    parameters: { type: 'object', properties: {} }
  },
  {
    name: 'eduest_create_material_set',
    description: '새 수업 자료 세트 생성 (Google Drive에 본체/문제/해설/노트 4개 폴더 자동 생성)',
    parameters: {
      type: 'object',
      properties: {
        title: { type: 'string', description: '자료 이름 (예: 1학기 중간고사 기출)' },
        count: { type: 'number', description: '문항 수 (예: 25)' }
      },
      required: ['title', 'count']
    }
  },
  {
    name: 'eduest_delete_material',
    description: '수업 자료 세트 삭제 (Google Drive 폴더 휴지통 이동)',
    parameters: {
      type: 'object',
      properties: {
        materialId: { type: 'string', description: '자료 ID' },
        mainFolderId: { type: 'string', description: '자료 메인 폴더 ID' }
      },
      required: ['materialId', 'mainFolderId']
    }
  },
  {
    name: 'eduest_sync_library_to_supabase',
    description: 'Google Drive 시험지 라이브러리 전체 구조를 Supabase exam_library 테이블로 고속 동기화',
    parameters: { type: 'object', properties: {} }
  },
  {
    name: 'eduest_drive_list_files',
    description: '특정 Google Drive 폴더 내의 파일 및 서브폴더 목록 조회',
    parameters: {
      type: 'object',
      properties: {
        folderId: { type: 'string', description: 'Google Drive 폴더 ID' }
      },
      required: ['folderId']
    }
  },
  {
    name: 'eduest_drive_upload_file',
    description: 'Google Drive 특정 폴더에 텍스트 또는 Base64 파일 직접 업로드',
    parameters: {
      type: 'object',
      properties: {
        folderId: { type: 'string', description: 'Google Drive 대상 폴더 ID' },
        fileName: { type: 'string', description: '저장할 파일 이름' },
        content: { type: 'string', description: '파일 텍스트 내용 또는 Base64 데이터' },
        isBase64: { type: 'boolean', description: 'Base64 여부' },
        mimeType: { type: 'string', description: 'MIME 타입' }
      },
      required: ['folderId', 'fileName', 'content']
    }
  },
  {
    name: 'eduest_storage_list_buckets',
    description: 'Supabase Storage 버킷 목록 조회',
    parameters: { type: 'object', properties: {} }
  },
  {
    name: 'eduest_storage_create_bucket',
    description: 'Supabase Storage 새 버킷 생성',
    parameters: {
      type: 'object',
      properties: {
        bucketName: { type: 'string', description: '생성할 버킷 이름 (소문자, 영숫자, 하이픈)' },
        isPublic: { type: 'boolean', description: '공개 버킷 여부 (기본값: true)' }
      },
      required: ['bucketName']
    }
  },
  {
    name: 'eduest_storage_upload_file',
    description: 'Supabase Storage 버킷에 텍스트 또는 Base64 파일 업로드',
    parameters: {
      type: 'object',
      properties: {
        bucketName: { type: 'string', description: '대상 버킷 이름' },
        filePath: { type: 'string', description: '버킷 내 저장할 경로/파일명 (예: exams/q1.png)' },
        content: { type: 'string', description: '업로드할 텍스트 내용 또는 Base64 인코딩 데이터' },
        isBase64: { type: 'boolean', description: '내용이 Base64 형식인지 여부' },
        contentType: { type: 'string', description: '파일 MIME 타입 (예: image/png, application/pdf)' }
      },
      required: ['bucketName', 'filePath', 'content']
    }
  },
  {
    name: 'eduest_get_home_study_sessions',
    description: '학생들의 가정/자기주도 학습 기록 및 세션 상세 조회 (날짜별, 학년별, 학생별 접속 시간대, 총 체류시간, 라이브러리 열람/모의고사/복습 활동 상세 분석). "오늘 고2 중 집에서 라이브러리 1시간 이상 본 학생", "김대현 학생 어제 집에서 몇 시에 접속했어?" 등 자연어 질의 처리 지원.',
    parameters: {
      type: 'object',
      properties: {
        student_name: { type: 'string', description: '학생 이름 또는 학생 ID (예: 김대현, 유지찬)' },
        grade: { type: 'string', description: '학년 필터 (예: 고1, 고2, 중3)' },
        date: { type: 'string', description: '조회 날짜 (YYYY-MM-DD 형식 또는 "today", "yesterday")' },
        days: { type: 'number', description: '최근 N일치 조회 (기본값: 7)' },
        min_duration_minutes: { type: 'number', description: '최소 체류 시간(분 단위, 예: 30분 이상 공부한 학생만 조회)' },
        activity_type: { 
          type: 'string', 
          enum: ['all', 'library', 'review', 'test', 'video', 'homework'], 
          description: '특정 활동 위주 필터' 
        }
      }
    }
  },
  {
    name: 'eduest_get_home_study_rules',
    description: '학원 수업 제외 시간대(가정 학습 필터링 규칙) 조회 (학년별 공통 시간표 및 학생별 개별 예외 시간대 목록 확인)',
    parameters: {
      type: 'object',
      properties: {
        grade: { type: 'string', description: '특정 학년 필터 (예: 고1, 고2, 중3)' },
        student_name: { type: 'string', description: '특정 학생 이름 (예: 김대현, 유지찬)' }
      }
    }
  }
];

const targetDirs = [
  'C:/Users/ivory/.gemini/antigravity/mcp/eduest-mcp',
  'C:/Users/ivory/.gemini/antigravity/mcp/eduest-mcp_eduest-mcp'
];

for (const dir of targetDirs) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  for (const tool of tools) {
    const filePath = path.join(dir, `${tool.name}.json`);
    fs.writeFileSync(filePath, JSON.stringify(tool, null, 2), 'utf8');
  }
  console.log(`Saved ${tools.length} schema files to ${dir}`);
}
