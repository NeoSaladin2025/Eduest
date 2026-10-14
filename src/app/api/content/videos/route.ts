import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifyAdminToken } from '@/lib/authUtils';
import { VideoLectureItem, VideoTagItem, DEFAULT_TAGS } from '@/lib/videoTypes';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const RECORD_DRIVE_ID = 'content_videos_root_data';

interface ContentVideosData {
  videos: VideoLectureItem[];
  tags: VideoTagItem[];
  updated_at: string;
}

// 헬퍼: DB에서 최신 데이터 읽기
async function getStoredData(): Promise<{ videos: VideoLectureItem[]; tags: VideoTagItem[] }> {
  try {
    const { data, error } = await supabase
      .from('exam_library')
      .select('file_data')
      .eq('drive_id', RECORD_DRIVE_ID)
      .maybeSingle();

    if (error || !data || !data.file_data) {
      return { videos: [], tags: DEFAULT_TAGS };
    }

    const parsed = JSON.parse(data.file_data);
    return {
      videos: Array.isArray(parsed.videos) ? parsed.videos : [],
      tags: Array.isArray(parsed.tags) && parsed.tags.length > 0 ? parsed.tags : DEFAULT_TAGS,
    };
  } catch (e) {
    console.error('getStoredData error:', e);
    return { videos: [], tags: DEFAULT_TAGS };
  }
}

// 헬퍼: DB에 데이터 저장
async function saveStoredData(videos: VideoLectureItem[], tags: VideoTagItem[]) {
  const payload: ContentVideosData = {
    videos,
    tags,
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabase
    .from('exam_library')
    .upsert({
      drive_id: RECORD_DRIVE_ID,
      name: 'content_videos_root_data.json',
      type: 'file',
      grade: '공통',
      file_data: JSON.stringify(payload),
      updated_at: new Date().toISOString(),
    }, { onConflict: 'drive_id' });

  if (error) {
    throw new Error(error.message);
  }
}

// GET: 영상 목록 및 태그 칩 목록 조회
export async function GET() {
  try {
    const data = await getStoredData();
    return NextResponse.json({ success: true, ...data });
  } catch (error: any) {
    console.error('Content videos GET error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

// POST: 영상 및 태그 칩 관리 (추가, 수정, 삭제, 태그 수정 시 영상 연동 변경)
export async function POST(req: Request) {
  try {
    // 🛡️ 관리자 권한 확인 (외부 무단 호출 차단)
    const cookieStore = await cookies();
    const token = cookieStore.get('admin_session_token')?.value;
    const session = verifyAdminToken(token);
    if (!session || !session.adminName) {
      return NextResponse.json({ error: '관리자 권한이 필요합니다. (로그인 필요)' }, { status: 401 });
    }

    const body = await req.json();
    const { action } = body;

    let { videos, tags } = await getStoredData();

    // 1. 태그(필터 칩) 추가
    if (action === 'create_tag') {
      const newTag: VideoTagItem = body.tag;
      if (!newTag || !newTag.name) {
        return NextResponse.json({ success: false, error: '태그 정보가 올바르지 않습니다.' }, { status: 400 });
      }
      // 중복 체크
      if (tags.some(t => t.name.trim() === newTag.name.trim())) {
        return NextResponse.json({ success: false, error: '이미 존재하는 태그 이름입니다.' }, { status: 400 });
      }
      tags.push(newTag);
      await saveStoredData(videos, tags);
      return NextResponse.json({ success: true, videos, tags });
    }

    // 2. 태그(필터 칩) 수정 -> 🌟 해당 칩으로 등록된 기존 영상들의 칩도 자동 연동 변경!
    if (action === 'update_tag') {
      const { tagId, oldName, newName, newColor } = body;
      if (!tagId || !newName) {
        return NextResponse.json({ success: false, error: '필수 인자가 누락되었습니다.' }, { status: 400 });
      }

      // 태그 목록 업데이트
      tags = tags.map(t => {
        if (t.id === tagId) {
          return {
            ...t,
            name: newName.trim(),
            color: newColor || t.color,
          };
        }
        return t;
      });

      // 기존 영상들에서 oldName 태그를 가지고 있던 영상들 모두 newName으로 자동 치환!
      if (oldName && oldName.trim() !== newName.trim()) {
        const targetOld = oldName.trim();
        const targetNew = newName.trim();
        videos = videos.map(v => {
          if (Array.isArray(v.tags) && v.tags.includes(targetOld)) {
            return {
              ...v,
              tags: v.tags.map(t => t === targetOld ? targetNew : t),
              updatedAt: new Date().toISOString(),
            };
          }
          return v;
        });
      }

      await saveStoredData(videos, tags);
      return NextResponse.json({ success: true, videos, tags });
    }

    // 3. 태그(필터 칩) 삭제 -> 🌟 해당 칩으로 등록된 기존 영상들에서 해당 태그 자동 제거
    if (action === 'delete_tag') {
      const { tagId, tagName } = body;
      tags = tags.filter(t => t.id !== tagId);

      if (tagName) {
        const targetName = tagName.trim();
        videos = videos.map(v => {
          if (Array.isArray(v.tags) && v.tags.includes(targetName)) {
            return {
              ...v,
              tags: v.tags.filter(t => t !== targetName),
              updatedAt: new Date().toISOString(),
            };
          }
          return v;
        });
      }

      await saveStoredData(videos, tags);
      return NextResponse.json({ success: true, videos, tags });
    }

    // 4. 영상 단건 등록/수정 (Upsert Video)
    if (action === 'upsert_video') {
      const video: VideoLectureItem = body.video;
      if (!video || !video.title || !video.embedUrl) {
        return NextResponse.json({ success: false, error: '영상 필수 정보(제목, 링크)가 누락되었습니다.' }, { status: 400 });
      }

      const existingIndex = videos.findIndex(v => v.id === video.id);
      if (existingIndex >= 0) {
        videos[existingIndex] = {
          ...videos[existingIndex],
          ...video,
          updatedAt: new Date().toISOString(),
        };
      } else {
        videos.unshift({
          ...video,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
      }

      await saveStoredData(videos, tags);
      return NextResponse.json({ success: true, videos, tags });
    }

    // 5. 영상 단건 삭제 (Delete Video)
    if (action === 'delete_video') {
      const { videoId } = body;
      videos = videos.filter(v => v.id !== videoId);
      await saveStoredData(videos, tags);
      return NextResponse.json({ success: true, videos, tags });
    }

    // 6. 전체 일괄 저장 (Batch save)
    if (action === 'save_all' || (!action && body.videos)) {
      videos = Array.isArray(body.videos) ? body.videos : videos;
      tags = Array.isArray(body.tags) ? body.tags : tags;
      await saveStoredData(videos, tags);
      return NextResponse.json({ success: true, videos, tags });
    }

    return NextResponse.json({ success: false, error: '알 수 없는 action입니다.' }, { status: 400 });
  } catch (error: any) {
    console.error('Content videos POST error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
