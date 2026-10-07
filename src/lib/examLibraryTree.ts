/** exam_library 평면 행 → 트리 (학생 페이지와 동일 규칙) */
export type ExamLibraryRow = {
  drive_id: string;
  parent_id: string | null;
  name: string;
  type: 'folder' | 'file';
  grade: string;
  /** GAS 동기화 시 HTML과 짝인 문제 이미지 파일의 drive_id */
  question_image_drive_id?: string | null;
};

export type ExamLibraryNode = ExamLibraryRow & {
  id: string;
  subFolders: ExamLibraryNode[];
  files: ExamLibraryNode[];
};

export function buildExamLibraryTree(items: ExamLibraryRow[], excludeTwins: boolean = true): ExamLibraryNode[] {
  let targetItems = items;
  if (excludeTwins) {
    const twinIds = new Set<string>();
    items.forEach((item) => {
      if (item.name && item.name.includes('쌍둥이')) {
        twinIds.add(item.drive_id);
      }
    });

    let added = true;
    while (added) {
      added = false;
      items.forEach((item) => {
        if (item.parent_id && twinIds.has(item.parent_id) && !twinIds.has(item.drive_id)) {
          twinIds.add(item.drive_id);
          added = true;
        }
      });
    }

    targetItems = items.filter((item) => !twinIds.has(item.drive_id));
  }

  const map: Record<string, ExamLibraryNode> = {};
  const roots: ExamLibraryNode[] = [];

  targetItems.forEach((item) => {
    map[item.drive_id] = {
      ...item,
      id: item.drive_id,
      subFolders: [],
      files: [],
    };
  });

  targetItems.forEach((item) => {
    const node = map[item.drive_id];
    if (item.parent_id && map[item.parent_id]) {
      if (item.type === 'folder') map[item.parent_id].subFolders.push(node);
      else map[item.parent_id].files.push(node);
    } else {
      roots.push(node);
    }
  });

  return roots;
}

export function extractFileIndexKey(name: string): string {
  const m = name.match(/(\d+)/);
  return m ? m[1].padStart(4, '0') : '9999';
}

/** EduOS: 폴더 로드 시 HTML + question_image_drive_id 전달 */
export type LibraryFileRow = {
  drive_id: string;
  name: string;
  question_image_drive_id?: string | null;
};
