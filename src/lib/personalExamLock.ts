export interface PersonalExamLike {
  id?: string;
  title?: string;
  target_student_id?: string;
  target_student_name?: string;
  parent_exam_id?: string;
  is_wrong_review?: boolean;
  is_treasure_hunt?: boolean;
  assigned_student_ids?: string[];
}

/**
 * 1인 전용 맞춤(보물회수·개인 오답) 시험지인지 판별합니다.
 * - target_student_id가 명시되었거나,
 * - parent_exam_id로 파생된 오답/보물회수/특정학생 시험지인 경우 true.
 * ('새 시험지 만들기'에서 다인용으로 만든 일반 보물회수 시험지는 제외)
 */
export function isPersonalOnlyExam(exam: PersonalExamLike | null | undefined): boolean {
  if (!exam) return false;
  if (exam.target_student_id) return true;
  if (exam.parent_exam_id && (exam.is_wrong_review || exam.is_treasure_hunt || exam.target_student_name)) {
    return true;
  }
  return false;
}

/**
 * 학생 화면 조회 시 1인 전용 시험지 노출 허용 여부를 검증합니다.
 */
export function canStudentAccessExam(exam: PersonalExamLike | null | undefined, studentId: string): boolean {
  if (!exam || !studentId) return false;
  if (!Array.isArray(exam.assigned_student_ids) || !exam.assigned_student_ids.includes(studentId)) {
    return false;
  }
  if (exam.target_student_id && exam.target_student_id !== studentId) {
    return false;
  }
  return true;
}

/**
 * 1인 전용 시험지에 허용되지 않은 타 학생 배정이 추가되는지 검사합니다.
 * 기존에 잘못 들어가 있던 타 학생을 '제거(축소)'만 하는 경우는 항상 허용합니다.
 */
export function getDisallowedExtraStudentsForPersonalExam(
  currentExam: PersonalExamLike | null | undefined,
  nextStudentIds: string[]
): string[] {
  if (!isPersonalOnlyExam(currentExam) || !currentExam) return [];

  const prevSet = new Set(Array.isArray(currentExam.assigned_student_ids) ? currentExam.assigned_student_ids : []);
  const isPureRemovalOrUnchanged = nextStudentIds.every((id) => prevSet.has(id));
  if (isPureRemovalOrUnchanged) {
    return [];
  }

  if (currentExam.target_student_id) {
    return nextStudentIds.filter((id) => id !== currentExam.target_student_id);
  }

  // 레거시 파생 시험지(target_student_id 미보관)는 기존 배정 목록에 없던 신규 타 학생 추가를 차단
  return nextStudentIds.filter((id) => !prevSet.has(id));
}
