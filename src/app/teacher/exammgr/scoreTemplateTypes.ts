export interface ScoreTemplate {
  id: string;
  name: string;
  total_questions: number;
  total_points: number;
  points: number[];
  description?: string;
  is_preset?: boolean;
  created_at: string;
  updated_at: string;
}

export const DEFAULT_SCORE_PRESETS: ScoreTemplate[] = [
  {
    id: 'preset-high-20',
    name: '⭐ 고등 내신 20문항 표준형 (객16+서4)',
    total_questions: 20,
    total_points: 100.0,
    points: [
      // 1~16번: 4.0점 (64점)
      4.0, 4.0, 4.0, 4.0, 4.0, 4.0, 4.0, 4.0,
      4.0, 4.0, 4.0, 4.0, 4.0, 4.0, 4.0, 4.0,
      // 17~20번: 9.0점 (36점)
      9.0, 9.0, 9.0, 9.0
    ],
    description: '객관식 16문항(4.0점) + 서술형 4문항(9.0점) = 100점',
    is_preset: true,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  },
  {
    id: 'preset-high-22',
    name: '⭐ 고등 내신 22문항 표준형 (객18+서4)',
    total_questions: 22,
    total_points: 100.0,
    points: [
      // 1~18번: 4.0점 (72점)
      4.0, 4.0, 4.0, 4.0, 4.0, 4.0, 4.0, 4.0, 4.0,
      4.0, 4.0, 4.0, 4.0, 4.0, 4.0, 4.0, 4.0, 4.0,
      // 19~22번: 7.0점 (28점)
      7.0, 7.0, 7.0, 7.0
    ],
    description: '객관식 18문항(4.0점) + 서술형 4문항(7.0점) = 100점',
    is_preset: true,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  },
  {
    id: 'preset-csat-30',
    name: '⭐ 수능 수학 30문항 모의고사형',
    total_questions: 30,
    total_points: 100.0,
    points: [
      // 1, 2번: 2점
      2.0, 2.0,
      // 3~8번: 3점
      3.0, 3.0, 3.0, 3.0, 3.0, 3.0,
      // 9~15번: 4점
      4.0, 4.0, 4.0, 4.0, 4.0, 4.0, 4.0,
      // 16~19번: 3점
      3.0, 3.0, 3.0, 3.0,
      // 20~22번: 4점
      4.0, 4.0, 4.0,
      // 23번: 2점
      2.0,
      // 24~27번: 3점
      3.0, 3.0, 3.0, 3.0,
      // 28~30번: 4점
      4.0, 4.0, 4.0
    ],
    description: '수능/평가원 수학 30문항 (2점 3개, 3점 14개, 4점 13개 = 100점)',
    is_preset: true,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  },
  {
    id: 'preset-mid-25',
    name: '⭐ 중등 25문항 단원평가 (균등 4점)',
    total_questions: 25,
    total_points: 100.0,
    points: Array(25).fill(4.0),
    description: '1~25번 전 문항 균등 4.0점 = 100점',
    is_preset: true,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  },
  {
    id: 'preset-high-25',
    name: '⭐ 고등 내신 25문항 표준형 (객20+서5)',
    total_questions: 25,
    total_points: 100.0,
    points: [
      // 1~20번: 3.5점 (70점)
      ...Array(20).fill(3.5),
      // 21~25번: 6.0점 (30점)
      ...Array(5).fill(6.0)
    ],
    description: '객관식 20문항(3.5점) + 서술형 5문항(6.0점) = 100점',
    is_preset: true,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  }
];

export const STORAGE_KEY_SCORE_TEMPLATES = 'eduest_score_templates_v1';

export function getStoredScoreTemplates(): ScoreTemplate[] {
  if (typeof window === 'undefined') return DEFAULT_SCORE_PRESETS;
  try {
    const raw = localStorage.getItem(STORAGE_KEY_SCORE_TEMPLATES);
    if (!raw) {
      localStorage.setItem(STORAGE_KEY_SCORE_TEMPLATES, JSON.stringify(DEFAULT_SCORE_PRESETS));
      return DEFAULT_SCORE_PRESETS;
    }
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length > 0) {
      return parsed;
    }
    return DEFAULT_SCORE_PRESETS;
  } catch (e) {
    console.error('Failed to load score templates:', e);
    return DEFAULT_SCORE_PRESETS;
  }
}

export function saveStoredScoreTemplates(templates: ScoreTemplate[]) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY_SCORE_TEMPLATES, JSON.stringify(templates));
  } catch (e) {
    console.error('Failed to save score templates:', e);
  }
}
