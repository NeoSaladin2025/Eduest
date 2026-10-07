'use client';

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { 
  FileCheck, 
  Clock, 
  ArrowLeft, 
  ArrowRight, 
  CheckCircle2, 
  XCircle, 
  Eye, 
  Send, 
  Check, 
  Loader2, 
  AlertCircle, 
  BookOpen, 
  RotateCcw,
  Sparkles,
  ExternalLink,
  ShieldAlert,
  HelpCircle,
  Lock,
  Layers,
  PlayCircle,
  Star,
  Camera,
  Trash2,
  Maximize2
} from 'lucide-react';
import { ExamPaper, ExamQuestion } from '@/app/api/test2/exam/route';
import { ExamBundle, ExamBundleItem } from '@/app/api/test2/bundle/route';
import { StudentSubmission } from '@/app/api/test2/student-exams/route';
import { supabase } from '@/lib/supabase';
import { StudentReviewData, ReviewItem, ReviewFolder } from './types';

interface StudentTest2ViewProps {
  studentId: string;
  studentName?: string;
  studentGrade?: string;
  studentFolderId?: string;
  reviewData?: StudentReviewData;
  onUpdateReviewData?: (data: StudentReviewData) => void;
}

// ⚡ 브라우저 초고속 이미지 리사이징 & 압축 (가로/세로 최대 1200px, JPEG 0.70 퀄리티)
// 5~15MB 대용량 스마트폰 사진을 createImageBitmap 하드웨어 가속으로 0.03초 만에 약 70~100KB로 초경량 압축
// 구글 드라이브 및 Apps Script 업로드 속도 극대화 & 풀이 글씨 가독성 완벽 유지
async function compressProofImage(
  file: File, 
  maxDim = 1200, 
  quality = 0.70
): Promise<{ blob: Blob; objectUrl: string }> {
  // 이미 90KB 이하의 가벼운 jpg인 경우
  if (file.size < 90 * 1024 && file.type === 'image/jpeg') {
    return { blob: file, objectUrl: URL.createObjectURL(file) };
  }

  // 모던 브라우저: createImageBitmap 지원 시 네이티브 초고속 디코딩 (~0.02초)
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(file);
      let width = bitmap.width;
      let height = bitmap.height;

      if (width > height) {
        if (width > maxDim) {
          height = Math.round((height * maxDim) / width);
          width = maxDim;
        }
      } else {
        if (height > maxDim) {
          width = Math.round((width * maxDim) / height);
          height = maxDim;
        }
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Canvas context not available');

      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, width, height);
      ctx.drawImage(bitmap, 0, 0, width, height);
      bitmap.close();

      return new Promise((resolve, reject) => {
        canvas.toBlob(
          (blob) => {
            if (blob) {
              resolve({ blob, objectUrl: URL.createObjectURL(blob) });
            } else {
              reject(new Error('Canvas toBlob failed'));
            }
          },
          'image/jpeg',
          quality
        );
      });
    } catch (e) {
      console.warn('createImageBitmap fallback to Image element:', e);
    }
  }

  // Fallback: URL.createObjectURL + HTMLImageElement (FileReader 대비 10배 빠름)
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      let width = img.width;
      let height = img.height;

      if (width > height) {
        if (width > maxDim) {
          height = Math.round((height * maxDim) / width);
          width = maxDim;
        }
      } else {
        if (height > maxDim) {
          width = Math.round((width * maxDim) / height);
          height = maxDim;
        }
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) return reject(new Error('Canvas context not available'));

      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, width, height);
      ctx.drawImage(img, 0, 0, width, height);

      canvas.toBlob(
        (blob) => {
          if (blob) {
            resolve({ blob, objectUrl: URL.createObjectURL(blob) });
          } else {
            reject(new Error('Canvas toBlob failed'));
          }
        },
        'image/jpeg',
        quality
      );
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('Image load failed'));
    };
    img.src = objectUrl;
  });
}

export default function StudentTest2View({
  studentId,
  studentName,
  studentGrade,
  studentFolderId,
  reviewData,
  onUpdateReviewData,
}: StudentTest2ViewProps) {
  // 모드: 목록('list') | 응시 중('taking') | 결과/채점 보기('result')
  const [viewMode, setViewMode] = useState<'list' | 'taking' | 'result'>('list');
  const [listTab, setListTab] = useState<'single' | 'bundle' | 'special' | 'wrong'>('single');
  const [loading, setLoading] = useState(true);

  // 배정된 단일 시험지 및 묶음 시험지 목록
  const [examList, setExamList] = useState<any[]>([]);
  const [bundleList, setBundleList] = useState<ExamBundle[]>([]);

  // 현재 응시 중인 시험지 & 묶음 정보
  const [currentExam, setCurrentExam] = useState<ExamPaper | null>(null);
  const [currentBundle, setCurrentBundle] = useState<ExamBundle | null>(null);
  const [currentRound, setCurrentRound] = useState<number>(1);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);

  // 답안 및 소요시간 관리
  const [userAnswers, setUserAnswers] = useState<Record<string, string>>({});
  const [questionSpentTimes, setQuestionSpentTimes] = useState<Record<string, number>>({});
  const questionEnteredAtRef = useRef<number>(Date.now());

  // 📸 [신규] 풀이과정 사진 인증샷 상태 & 모달 (체감 0초 낙관적 UI 지원)
  const [proofImages, setProofImages] = useState<
    Record<string, { drive_id: string; url: string; remote_url?: string; fileName: string; isUploading?: boolean }>
  >({});
  const proofImagesRef = useRef(proofImages);
  useEffect(() => {
    proofImagesRef.current = proofImages;
  }, [proofImages]);

  const [uploadingProofQId, setUploadingProofQId] = useState<string | null>(null);
  const [viewingProofUrl, setViewingProofUrl] = useState<string | null>(null);

  // 타이머 & 일시정지 & 이탈 감지 화면 잠금
  const [timeLeft, setTimeLeft] = useState<number>(0);
  const [isLocked, setIsLocked] = useState<boolean>(false);
  const [isPaused, setIsPaused] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showSubmitConfirm, setShowSubmitConfirm] = useState(false);

  // 제출 결과 정보
  const [submissionResult, setSubmissionResult] = useState<StudentSubmission | null>(null);

  // 원본 해설 보기 모달 (HTML iframe)
  const [solutionModalFileId, setSolutionModalFileId] = useState<string | null>(null);
  const [solutionHtml, setSolutionHtml] = useState<string | null>(null);
  const [solutionLoading, setSolutionLoading] = useState(false);

  // 복습 토스트 메시지
  const [reviewToast, setReviewToast] = useState<string | null>(null);
  const showReviewToast = (msg: string) => {
    setReviewToast(msg);
    setTimeout(() => setReviewToast(null), 3000);
  };

  // 복습 데이터 로컬 상태 (prop 없을 시 fallback)
  const [localReviewData, setLocalReviewData] = useState<StudentReviewData>(
    reviewData || { folders: [], items: [] }
  );

  useEffect(() => {
    if (reviewData) {
      setLocalReviewData(reviewData);
    } else if (studentId) {
      fetch(`/api/student/review?studentId=${studentId}`)
        .then(res => res.json())
        .then(data => {
          if (data.reviewData) {
            setLocalReviewData(data.reviewData);
          }
        })
        .catch(() => {});
    }
  }, [reviewData, studentId]);

  const currentReviewData = reviewData || localReviewData;

  // 스페셜, 단일, 오답 시험지 분류
  const specialExams = useMemo(() => {
    return examList.filter(e => e.is_special || (e.title && e.title.includes('[스페셜]')));
  }, [examList]);

  const wrongExams = useMemo(() => {
    return examList.filter(e => !e.is_special && !e.title?.includes('[스페셜]') && (e.is_wrong_review || e.title.startsWith('[오답]')));
  }, [examList]);

  const singleExams = useMemo(() => {
    return examList.filter(e => !e.is_special && !e.title?.includes('[스페셜]') && !(e.is_wrong_review || e.title.startsWith('[오답]')));
  }, [examList]);

  // 📸 풀이 인증샷 초고속 즉시 처리 & 백그라운드 구글 드라이브 업로드 핸들러
  const handleUploadProof = async (questionId: string, qNum: number, file?: File | null) => {
    if (!file || !currentExam) return;
    setUploadingProofQId(questionId);

    // 1. 브라우저에서 0.03초 만에 초고속 경량 압축 & 미리보기 URL 생성 (5~15MB -> 70~100KB)
    let compressedBlob: Blob;
    let localPreviewUrl: string;
    try {
      const comp = await compressProofImage(file, 1200, 0.70);
      compressedBlob = comp.blob;
      localPreviewUrl = comp.objectUrl;
    } catch (e) {
      console.warn('Image compression fallback:', e);
      compressedBlob = file;
      localPreviewUrl = URL.createObjectURL(file);
    }

    const sanitizedTitle = currentExam.title.replace(/[/\\?%*:|"<>]/g, '_').trim();
    const tempFileName = `[스페셜풀이] ${qNum}번_${sanitizedTitle}_${Date.now()}.jpg`;

    // 2. ⚡ 낙관적 UI: 학생 화면에는 0초 만에 즉시 썸네일 노출 및 첨부 완료 처리!
    // (학생은 기다릴 필요 없이 즉시 다음 문제로 넘어가 풀이를 계속할 수 있습니다)
    setProofImages(prev => ({
      ...prev,
      [questionId]: {
        drive_id: '',
        url: localPreviewUrl,
        remote_url: '',
        fileName: tempFileName,
        isUploading: true,
      },
    }));

    showReviewToast(`📸 ${qNum}번 풀이 사진이 첨부되었습니다!`);
    setUploadingProofQId(null); // 학생 대기 스피너 즉시 해제!

    // 3. 백그라운드에서 비동기 구글 드라이브 초고속 업로드 수행 (~70KB라 고속 처리)
    try {
      const formData = new FormData();
      formData.append('file', compressedBlob, tempFileName);
      formData.append('studentId', studentId);
      if (studentFolderId) {
        formData.append('studentFolderId', studentFolderId);
      }
      if (studentName) {
        formData.append('studentName', studentName);
      }
      formData.append('examId', currentExam.id);
      formData.append('examTitle', currentExam.title);
      formData.append('questionNumber', String(qNum));
      formData.append('questionId', questionId);

      const res = await fetch('/api/drive/upload-proof', {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setProofImages(prev => {
          if (!prev[questionId]) return prev; // 학생이 그 사이 삭제했다면 무시
          return {
            ...prev,
            [questionId]: {
              drive_id: data.fileId,
              url: localPreviewUrl,
              remote_url: data.url,
              fileName: data.fileName || tempFileName,
              isUploading: false,
            },
          };
        });
      } else {
        console.error('Background drive upload error:', data.error);
        setProofImages(prev => {
          if (!prev[questionId]) return prev;
          return {
            ...prev,
            [questionId]: {
              ...prev[questionId],
              isUploading: false,
            },
          };
        });
        alert(`⚠️ ${qNum}번 풀이 인증샷의 구글 드라이브 동기화에 실패했습니다: ${data.error || '오류'}\n다시 한 번 촬영해 주세요.`);
      }
    } catch (err: any) {
      console.error('Proof upload error:', err);
      setProofImages(prev => {
        if (!prev[questionId]) return prev;
        return {
          ...prev,
          [questionId]: {
            ...prev[questionId],
            isUploading: false,
          },
        };
      });
      alert(`⚠️ ${qNum}번 풀이 사진 업로드 중 통신 오류가 발생했습니다.`);
    }
  };

  const handleRemoveProof = (questionId: string) => {
    setProofImages(prev => {
      const next = { ...prev };
      delete next[questionId];
      return next;
    });
  };

  // 문항이 현재 복습에 담겨있는지 확인
  const isQuestionInReview = (qId: string) => {
    if (!currentExam) return false;
    const targetFileId = `exam_${currentExam.id}_q_${qId}`;
    return (currentReviewData.items || []).some(
      item => item.id === targetFileId || item.fileId === targetFileId
    );
  };

  // 문항 복습 토글 (체크 / 해제)
  const handleToggleQuestionReview = async (q: ExamQuestion, idx: number) => {
    if (!currentExam) return;
    const targetFileId = `exam_${currentExam.id}_q_${q.id}`;
    const alreadyIn = isQuestionInReview(q.id);

    let nextFolders = [...(currentReviewData.folders || [])];
    let nextItems = [...(currentReviewData.items || [])];

    if (alreadyIn) {
      nextItems = nextItems.filter(item => item.id !== targetFileId && item.fileId !== targetFileId);
      showReviewToast(`'${currentExam.title} ${idx + 1}번' 문제가 복습에서 제외되었습니다.`);
    } else {
      const folderName = currentExam.title;
      let targetFolder = nextFolders.find(f => f.name === folderName);
      if (!targetFolder) {
        targetFolder = {
          id: `folder_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
          name: folderName,
          createdAt: new Date().toISOString(),
          parentId: null,
        };
        nextFolders.push(targetFolder);
      }

      const newItem: ReviewItem = {
        id: targetFileId,
        fileId: targetFileId,
        name: `${currentExam.title} ${idx + 1}번`,
        folderId: targetFolder.id,
        folderName: targetFolder.name,
        problemUrl: q.image_url,
        solutionUrl: q.solution_drive_id || q.drive_id,
        type: 'image',
        addedAt: new Date().toISOString(),
        answer: String(q.answer ?? '').trim(),
        raw_answer: String(q.raw_answer ?? '').trim(),
        points: q.points || 4,
        questionNumber: idx + 1,
        examTitle: currentExam.title,
      };
      nextItems.push(newItem);
      showReviewToast(`⭐ '${currentExam.title} ${idx + 1}번' 문제가 내 복습 홈에 담겼습니다! 📁`);
    }

    const updated: StudentReviewData = {
      folders: nextFolders,
      items: nextItems,
    };

    setLocalReviewData(updated);
    if (onUpdateReviewData) {
      onUpdateReviewData(updated);
    }

    try {
      await fetch('/api/student/review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          studentId,
          reviewData: updated,
        }),
      });
    } catch (e) {
      console.error('Failed to sync review:', e);
    }
  };

  // 실시간 채널 ref
  const channelRef = useRef<any>(null);

  // 시간 포맷팅 헬퍼 (HH:MM:SS 또는 MM:SS)
  const formatRemainingTime = (totalSec: number) => {
    if (totalSec <= 0) return '00:00';
    const hours = Math.floor(totalSec / 3600);
    const minutes = Math.floor((totalSec % 3600) / 60);
    const seconds = totalSec % 60;
    if (hours > 0) {
      return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    }
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  };

  // 1. 배정된 시험지 및 묶음(카트리지) 목록 불러오기
  const loadAssignedData = useCallback(async () => {
    try {
      setLoading(true);
      const [examRes, bundleRes] = await Promise.all([
        fetch(`/api/test2/student-exams?studentId=${studentId}`),
        fetch(`/api/test2/bundle?studentId=${studentId}`),
      ]);
      const examData = await examRes.json();
      const bundleData = await bundleRes.json();

      if (examData.success) {
        setExamList(examData.exams || []);
      }
      if (bundleData.success) {
        setBundleList(bundleData.bundles || []);
      }

      // 🌟 [미응시 대기 상태 보장] 목록 화면에 머무를 때는 DB의 과거 유령 상태를 IDLE로 안전하게 초기화
      supabase
        .from('students')
        .select('test_status')
        .eq('id', studentId)
        .single()
        .then(({ data }) => {
          if (data && (data.test_status === 'TESTING' || data.test_status === 'AWAY')) {
            supabase
              .from('students')
              .update({
                test_status: 'IDLE',
                test_remaining_sec: 0,
                updated_at: new Date().toISOString(),
              })
              .eq('id', studentId)
              .then();
          }
        });
    } catch (e) {
      console.error('Failed to load assigned data:', e);
    } finally {
      setLoading(false);
    }
  }, [studentId]);

  useEffect(() => {
    if (studentId) {
      loadAssignedData();
    }
  }, [studentId, loadAssignedData]);

  // 실시간 모니터링 상태 전송 헬퍼 (Broadcast + DB sync)
  const broadcastProctorStatus = useCallback(
    (status: 'TESTING' | 'AWAY' | 'PAUSED' | 'FINISHED', overrideTime?: number) => {
      if (!currentExam) return;
      const curTime = overrideTime !== undefined ? overrideTime : timeLeft;
      const payload = {
        student_id: studentId,
        student_name: studentName,
        student_grade: studentGrade,
        exam_id: currentExam.id,
        exam_title: currentExam.title,
        bundle_id: currentBundle?.id || null,
        bundle_title: currentBundle?.title || null,
        round: currentRound,
        question_idx: currentQuestionIndex + 1,
        total_questions: currentExam.questions.length,
        test_status: status,
        test_remaining_sec: curTime,
        updated_at: new Date().toISOString(),
      };

      // 1) Realtime Broadcast 발송 (즉각 반응)
      if (channelRef.current) {
        channelRef.current.send({
          type: 'broadcast',
          event: 'proctor_sync',
          payload,
        });
      }

      // 2) Supabase students 테이블 업데이트
      supabase
        .from('students')
        .update({
          test_status: status,
          test_remaining_sec: curTime,
          last_away_at: status === 'AWAY' ? new Date().toISOString() : undefined,
          updated_at: new Date().toISOString(),
        })
        .eq('id', studentId)
        .then();
    },
    [currentExam, timeLeft, studentId, studentName, studentGrade, currentBundle, currentRound, currentQuestionIndex]
  );

  // 📡 Supabase Realtime 채널 연결 (선생님의 원격 잠금 해제 승인 수신 & 브로드캐스트)
  useEffect(() => {
    if (!studentId) return;

    const channel = supabase.channel('proctoring_room');
    channelRef.current = channel;

    // 선생님의 잠금 해제 승인 이벤트 수신
    channel
      .on('broadcast', { event: 'unlock_student' }, (eventPayload: any) => {
        if (eventPayload?.payload?.studentId === studentId) {
          setIsLocked(false);
          setIsPaused(false);
        }
      })
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'students',
        filter: `id=eq.${studentId}`,
      }, (payload: any) => {
        const newStatus = payload.new?.test_status;
        if (newStatus === 'TESTING') {
          setIsLocked(false);
          setIsPaused(false);
        } else if (newStatus === 'PAUSED') {
          setIsPaused(true);
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [studentId]);

  // 2. 시험 시작하기
  const handleStartExam = async (examId: string, bundle?: ExamBundle, roundNum = 1) => {
    try {
      setLoading(true);
      const res = await fetch(`/api/test2/student-exams?studentId=${studentId}&examId=${examId}`);
      const data = await res.json();

      if (data.success && data.exam) {
        setCurrentExam(data.exam);
        setCurrentBundle(bundle || null);
        setCurrentRound(roundNum);
        setCurrentQuestionIndex(0);
        questionEnteredAtRef.current = Date.now();

        // 이미 제출된 시험지라면 결과 보기 화면으로
        if (data.is_submitted && data.submission) {
          setSubmissionResult(data.submission);
          setViewMode('result');
        } else {
          // 로컬 임시 저장 답안 복원
          const savedAnswers = localStorage.getItem(`test2_answers_${studentId}_${examId}`);
          if (savedAnswers) {
            try {
              setUserAnswers(JSON.parse(savedAnswers));
            } catch {
              setUserAnswers({});
            }
          } else {
            setUserAnswers({});
          }

          // 문항별 소요시간 복원
          const savedQTimes = localStorage.getItem(`test2_qtimes_${studentId}_${examId}`);
          if (savedQTimes) {
            try {
              setQuestionSpentTimes(JSON.parse(savedQTimes));
            } catch {
              setQuestionSpentTimes({});
            }
          } else {
            setQuestionSpentTimes({});
          }

          // 남은 시간 복원 또는 기본 설정 (분 -> 초)
          const savedTime = localStorage.getItem(`test2_time_${studentId}_${examId}`);
          const initialDurationSec = (data.exam.duration_min || 60) * 60;
          const initialTime = savedTime ? parseInt(savedTime, 10) : initialDurationSec;
          setTimeLeft(initialTime);

          setIsLocked(false);
          setIsPaused(false);
          setViewMode('taking');

          // 시작 상태 알림
          setTimeout(() => {
            supabase
              .from('students')
              .update({
                test_status: 'TESTING',
                test_remaining_sec: initialTime,
                test_duration_min: data.exam.duration_min || 60,
                updated_at: new Date().toISOString(),
              })
              .eq('id', studentId)
              .then();
          }, 200);
        }
      } else {
        alert(data.error || '시험지 로드에 실패했습니다.');
      }
    } catch (e) {
      console.error('Error starting exam:', e);
      alert('시험을 시작하는 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  // 3. 타이머 자동 카운트다운 (1초 주기)
  useEffect(() => {
    if (viewMode !== 'taking' || !currentExam || isLocked || isPaused) return;

    const timer = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          clearInterval(timer);
          alert('시험 제한시간이 종료되었습니다! 작성된 답안을 자동으로 제출합니다.');
          handleSubmitExam();
          return 0;
        }
        const next = prev - 1;
        // 5초마다 로컬스토리지 저장
        if (next % 5 === 0) {
          localStorage.setItem(`test2_time_${studentId}_${currentExam.id}`, String(next));
        }
        return next;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [viewMode, currentExam, isLocked, isPaused, studentId]);

  // 주기적(20초마다) DB 동기화
  useEffect(() => {
    if (viewMode !== 'taking' || !currentExam || isLocked || isPaused) return;

    const syncInterval = setInterval(() => {
      broadcastProctorStatus('TESTING', timeLeft);
    }, 20000);

    return () => clearInterval(syncInterval);
  }, [viewMode, currentExam, isLocked, isPaused, timeLeft, broadcastProctorStatus]);

  // 4. 답안 변경 처리 및 문항 소요시간 자동 체크 (정답 입력 기준)
  const handleAnswerSelect = (questionId: string, answerValue: string) => {
    if (isLocked) return;

    // 답안 저장
    setUserAnswers(prev => {
      const next = { ...prev, [questionId]: answerValue };
      if (currentExam) {
        localStorage.setItem(`test2_answers_${studentId}_${currentExam.id}`, JSON.stringify(next));
      }
      return next;
    });

    // ⏱️ 정답 입력 기준 소요시간 자동 체크 & 누적
    const now = Date.now();
    const elapsedSec = Math.max(1, Math.round((now - questionEnteredAtRef.current) / 1000));
    questionEnteredAtRef.current = now; // 입력 시점 기준으로 시작 시점 리셋

    setQuestionSpentTimes(prev => {
      const updated = {
        ...prev,
        [questionId]: (prev[questionId] || 0) + elapsedSec,
      };
      if (currentExam) {
        localStorage.setItem(`test2_qtimes_${studentId}_${currentExam.id}`, JSON.stringify(updated));
      }
      return updated;
    });

    // 모니터링 실시간 정보 전송 (문항 풀이 중)
    broadcastProctorStatus('TESTING');
  };

  // 문항 전환 시 풀이 시작 시각 갱신
  const handleNavigateQuestion = (targetIdx: number) => {
    // 이전 문항에서 머문 시간 누적 (만약 답안을 마킹하지 않고 넘어가더라도 풀이 시간으로 인정)
    if (currentExam) {
      const curQ = currentExam.questions[currentQuestionIndex];
      if (curQ) {
        const now = Date.now();
        const elapsedSec = Math.max(0, Math.round((now - questionEnteredAtRef.current) / 1000));
        if (elapsedSec > 0) {
          setQuestionSpentTimes(prev => {
            const updated = { ...prev, [curQ.id]: (prev[curQ.id] || 0) + elapsedSec };
            localStorage.setItem(`test2_qtimes_${studentId}_${currentExam.id}`, JSON.stringify(updated));
            return updated;
          });
        }
      }
    }

    setCurrentQuestionIndex(targetIdx);
    questionEnteredAtRef.current = Date.now();

    // 진도 변경 실시간 통지
    setTimeout(() => {
      broadcastProctorStatus('TESTING');
    }, 100);
  };

  // 🚨 5. 화면 이탈 감지 (부정행위 방지: 화면 잠금 + 타이머 정지 + 원격 해제 대기)
  useEffect(() => {
    if (viewMode !== 'taking' || !currentExam) return;

    // 🔥 스페셜 시험이거나 풀이 인증샷 첨부 시험인 경우 카메라/사진 앱 전환을 허용하기 위해 화면 이탈 잠금 해제
    const isSpecialTest = Boolean(
      currentExam.is_special ||
      currentExam.require_proof_image ||
      (currentExam.title && currentExam.title.includes('[스페셜]'))
    );
    if (isSpecialTest) return;

    const triggerAwayLock = () => {
      if (isLocked) return;
      setIsLocked(true);

      // 모니터링 경보 발송
      broadcastProctorStatus('AWAY', timeLeft);
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        triggerAwayLock();
      }
    };

    const handleBlur = () => {
      triggerAwayLock();
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('blur', handleBlur);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('blur', handleBlur);
    };
  }, [viewMode, currentExam, isLocked, timeLeft, broadcastProctorStatus]);

  // 잠금 상태일 때 2.5초마다 DB 상태 폴링 (웹소켓 유실 대비 백업 해제 감지)
  useEffect(() => {
    if (!isLocked || !studentId) return;

    const interval = setInterval(async () => {
      const { data } = await supabase
        .from('students')
        .select('test_status, test_remaining_sec')
        .eq('id', studentId)
        .single();

      if (data && data.test_status === 'TESTING') {
        setIsLocked(false);
        setIsPaused(false);
        if (data.test_remaining_sec !== undefined && data.test_remaining_sec !== null) {
          setTimeLeft(data.test_remaining_sec);
        }
      }
    }, 2500);

    return () => clearInterval(interval);
  }, [isLocked, studentId]);

  // 6. 최종 답안 제출
  const handleSubmitExam = async () => {
    if (!currentExam) return;

    // 📸 풀이 인증샷 필수 검증
    const currentProofsAtStart = proofImagesRef.current;
    if (currentExam.require_proof_image) {
      const proofCount = Object.keys(currentProofsAtStart).length;
      if (proofCount === 0) {
        alert("📸 이 시험은 풀이과정 사진 인증이 필수입니다!\n\n문항별로 풀이과정 사진을 첨부한 후 제출해 주세요.");
        setShowSubmitConfirm(false);
        return;
      }
    }

    try {
      setIsSubmitting(true);

      // 📸 혹시 아직 백그라운드 동기화 중인 인증샷이 있다면 튕겨내지 않고 자동 대기 완료
      const hasUploading = Object.values(proofImagesRef.current).some((p) => p.isUploading);
      if (hasUploading) {
        const startWait = Date.now();
        const MAX_WAIT_MS = 12000;
        while (Date.now() - startWait < MAX_WAIT_MS) {
          await new Promise((r) => setTimeout(r, 350));
          const still = Object.values(proofImagesRef.current).some((p) => p.isUploading);
          if (!still) break;
        }
      }

      const finalProofImages = proofImagesRef.current;

      const res = await fetch('/api/test2/student-exams', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          studentId,
          examId: currentExam.id,
          answers: userAnswers,
          questionTimes: questionSpentTimes,
          proofImages: finalProofImages,
        }),
      });

      const data = await res.json();
      if (data.success && data.submission) {
        setSubmissionResult(data.submission);
        setShowSubmitConfirm(false);

        // 로컬 임시 데이터 정리
        localStorage.removeItem(`test2_answers_${studentId}_${currentExam.id}`);
        localStorage.removeItem(`test2_qtimes_${studentId}_${currentExam.id}`);
        localStorage.removeItem(`test2_time_${studentId}_${currentExam.id}`);

        // 모니터링 종료 통지
        broadcastProctorStatus('FINISHED', 0);

        // 목록 갱신
        loadAssignedData();
        setViewMode('result');
      } else {
        alert(data.error || '답안 제출에 실패했습니다.');
      }
    } catch (e) {
      console.error('Error submitting exam:', e);
      alert('답안 제출 중 오류가 발생했습니다.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // 7. 원본 라이브러리 해설 보기 모달 열기
  const handleOpenSolution = async (driveId: string) => {
    if (!driveId) return;
    setSolutionModalFileId(driveId);
    setSolutionLoading(true);
    setSolutionHtml(null);

    try {
      const res = await fetch(`/api/drive/library/file?fileId=${encodeURIComponent(driveId)}&type=html`);
      const data = await res.json();
      if (data.success && data.data) {
        setSolutionHtml(data.data);
      } else {
        alert('해설을 불러오지 못했습니다.');
      }
    } catch (e) {
      console.error('Error loading solution:', e);
      alert('해설 로딩 중 오류가 발생했습니다.');
    } finally {
      setSolutionLoading(false);
    }
  };

  // 로딩 상태
  if (loading && viewMode === 'list') {
    return (
      <div className="py-24 flex flex-col items-center justify-center space-y-4">
        <Loader2 className="animate-spin text-violet-500" size={44} />
        <p className="text-white text-base font-black tracking-wider uppercase">
          시험 목록을 동기화하는 중...
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-500 relative">

      {/* ─────────────────────────────────────────────────────────────
          🚨 화면 이탈 잠금 오버레이 (선생님의 해제 승인 대기)
      ───────────────────────────────────────────────────────────── */}
      {isLocked && (
        <div className="fixed inset-0 z-[100] bg-black/95 backdrop-blur-md flex flex-col items-center justify-center p-6 text-center animate-in fade-in duration-300">
          <div className="w-24 h-24 rounded-3xl bg-rose-500/20 border-2 border-rose-500/50 text-rose-500 flex items-center justify-center mb-6 shadow-2xl shadow-rose-500/30 animate-pulse">
            <ShieldAlert size={56} />
          </div>
          <h2 className="text-3xl md:text-5xl font-black text-white mb-4 tracking-tight">
            ⚠️ 시험 화면이 잠겼습니다!
          </h2>
          <p className="text-base md:text-lg text-rose-300 font-bold max-w-lg mb-2">
            시험 화면을 벗어나거나 다른 프로그램을 조작하여 이탈이 감지되었습니다.
          </p>
          <p className="text-xs md:text-sm text-slate-400 max-w-md mb-8 leading-relaxed">
            부정행위 방지를 위해 화면이 잠겼으며 <strong className="text-white font-bold">시험 시간은 일시정지</strong>되었습니다.<br />
            선생님이 모니터링 화면에서 확인 후 <strong className="text-rose-400 font-bold">잠금 해제 승인</strong>을 해주셔야 계속 응시할 수 있습니다.
          </p>

          <div className="flex items-center gap-3 px-6 py-4 bg-white/5 rounded-2xl border border-white/10 text-xs md:text-sm text-slate-300 font-mono shadow-inner">
            <Loader2 className="animate-spin text-rose-400" size={18} />
            <span>선생님의 잠금 해제 승인을 실시간 대기하고 있습니다...</span>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          1. 배정된 시험지 목록 화면 (VIEW: 'list')
      ───────────────────────────────────────────────────────────── */}
      {viewMode === 'list' && (
        <div className="space-y-8 pb-16">
          <div className="text-center space-y-3">
            <h2 className="text-3xl md:text-5xl font-black italic tracking-tighter uppercase text-white">
              ASSIGNED <span className="text-violet-500">EXAMS</span>
            </h2>
            <p className="text-xs md:text-sm font-bold text-slate-400">
              선생님이 배정한 단일 시험지 및 카트리지(묶음) 시험지 목록입니다.
            </p>

            {/* 탭 전환 (단일 시험지 vs 카트리지 묶음 vs 오답 시험지) */}
            <div className="flex justify-center pt-2">
              <div className="bg-white/5 p-1 rounded-2xl border border-white/10 flex gap-1">
                <button
                  onClick={() => setListTab('single')}
                  className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-black transition-all ${
                    listTab === 'single'
                      ? 'bg-violet-600 text-white shadow-lg shadow-violet-600/30'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <FileCheck size={16} />
                  단일 시험지 ({singleExams.length})
                </button>
                <button
                  onClick={() => setListTab('special')}
                  className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-black transition-all ${
                    listTab === 'special'
                      ? 'bg-amber-500 text-slate-950 shadow-lg shadow-amber-500/30 font-extrabold'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <Sparkles size={16} className={listTab === 'special' ? 'text-slate-950 fill-slate-950' : 'text-amber-400'} />
                  스페셜 시험지 ({specialExams.length})
                </button>
                <button
                  onClick={() => setListTab('bundle')}
                  className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-black transition-all ${
                    listTab === 'bundle'
                      ? 'bg-violet-600 text-white shadow-lg shadow-violet-600/30'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <Layers size={16} />
                  시험지 묶음 카트리지 ({bundleList.length})
                </button>
                <button
                  onClick={() => setListTab('wrong')}
                  className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-black transition-all ${
                    listTab === 'wrong'
                      ? 'bg-rose-600 text-white shadow-lg shadow-rose-600/30'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <RotateCcw size={16} />
                  오답 시험지 ({wrongExams.length})
                </button>
              </div>
            </div>
          </div>

          {/* 🌟 탭: 스페셜 시험지 목록 */}
          {listTab === 'special' && (
            specialExams.length === 0 ? (
              <div className="bg-white/5 border border-dashed border-amber-500/20 rounded-[40px] p-16 text-center space-y-4 max-w-xl mx-auto">
                <div className="w-16 h-16 bg-amber-500/20 text-amber-400 rounded-3xl flex items-center justify-center mx-auto shadow-lg shadow-amber-500/10">
                  <Sparkles size={32} />
                </div>
                <div className="space-y-1">
                  <h3 className="text-xl font-black text-white">배정된 스페셜 시험지가 없습니다</h3>
                  <p className="text-xs text-slate-500 font-bold">
                    선생님이 복습 관리에서 나만을 위한 스페셜 시험지를 배정하면 이곳에 나타납니다!
                  </p>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {specialExams.map((exam: any) => {
                  const isSubmitted = exam.is_submitted;
                  return (
                    <div
                      key={exam.id}
                      className="bg-gradient-to-b from-amber-500/10 to-transparent border border-amber-500/30 hover:border-amber-400 rounded-[32px] p-6 shadow-2xl backdrop-blur-3xl transition-all flex flex-col justify-between group relative overflow-hidden"
                    >
                      <div className="space-y-4">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1.5">
                            <span className="px-3 py-1 bg-amber-500/20 text-amber-300 border border-amber-500/40 text-[11px] font-black rounded-full flex items-center gap-1">
                              <Sparkles size={11} /> 스페셜
                            </span>
                            {exam.require_proof_image && (
                              <span className="px-2.5 py-1 bg-rose-500/20 text-rose-300 border border-rose-500/30 text-[10px] font-black rounded-full flex items-center gap-1">
                                <Camera size={11} /> 사진인증
                              </span>
                            )}
                          </div>
                          {isSubmitted ? (
                            <span className="flex items-center gap-1 text-xs font-bold text-emerald-400 bg-emerald-500/10 px-2.5 py-0.5 rounded-full border border-emerald-500/20">
                              <CheckCircle2 size={13} />
                              완료 ({exam.submission?.score}점)
                            </span>
                          ) : (
                            <span className="flex items-center gap-1 text-xs font-bold text-amber-300 bg-amber-500/20 px-2.5 py-0.5 rounded-full border border-amber-500/30 animate-pulse">
                              <Clock size={13} />
                              응시 대기
                            </span>
                          )}
                        </div>

                        <div>
                          <h3 className="text-2xl font-black text-white group-hover:text-amber-300 transition-colors line-clamp-2 leading-tight">
                            {exam.title}
                          </h3>
                          <p className="text-xs text-slate-400 font-bold mt-2">
                            총 {exam.question_count}문항 • 제한시간 {exam.duration_min}분
                          </p>
                        </div>

                        {isSubmitted && exam.submission && (
                          <div className="bg-white/5 rounded-2xl p-3 flex items-center justify-between border border-white/5 text-xs">
                            <span className="text-slate-400 font-bold">채점 결과</span>
                            <span className="text-amber-400 font-black text-sm">
                              {exam.submission.correct_count} / {exam.submission.total_questions} 정답 ({exam.submission.score}점)
                            </span>
                          </div>
                        )}
                      </div>

                      <div className="pt-6 mt-6 border-t border-white/10">
                        {isSubmitted ? (
                          <button
                            onClick={() => handleStartExam(exam.id)}
                            className="w-full py-4 bg-white/10 hover:bg-white/20 text-white font-black text-xs rounded-2xl transition-all flex items-center justify-center gap-2 group-hover:scale-[1.02]"
                          >
                            <Eye size={16} />
                            결과 및 인증샷 확인
                          </button>
                        ) : (
                          <button
                            onClick={() => handleStartExam(exam.id)}
                            className="w-full py-4 bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs rounded-2xl transition-all shadow-xl shadow-amber-500/20 flex items-center justify-center gap-2 group-hover:scale-[1.02]"
                          >
                            <PlayCircle size={16} />
                            스페셜 시험 시작하기
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )
          )}

          {/* 탭 1: 단일 시험지 목록 */}
          {listTab === 'single' && (
            singleExams.length === 0 ? (
              <div className="bg-white/5 border border-dashed border-white/10 rounded-[40px] p-16 text-center space-y-4 max-w-xl mx-auto">
                <div className="w-16 h-16 bg-violet-500/20 text-violet-400 rounded-3xl flex items-center justify-center mx-auto">
                  <FileCheck size={32} />
                </div>
                <div className="space-y-1">
                  <h3 className="text-xl font-black text-white">배정된 시험지가 없습니다</h3>
                  <p className="text-xs text-slate-500 font-bold">
                    선생님이 새로운 시험지를 배정하면 이곳에 표시됩니다!
                  </p>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {singleExams.map((exam: any) => {
                  const isSubmitted = exam.is_submitted;
                  return (
                    <div
                      key={exam.id}
                      className="bg-white/5 border border-white/10 hover:border-violet-500/50 rounded-[32px] p-6 shadow-2xl backdrop-blur-3xl transition-all flex flex-col justify-between group relative overflow-hidden"
                    >
                      <div className="space-y-4">
                        <div className="flex items-center justify-between">
                          <span className="px-3 py-1 bg-violet-500/20 text-violet-300 border border-violet-500/30 text-[11px] font-black rounded-full">
                            {exam.grade}
                          </span>
                          {isSubmitted ? (
                            <span className="flex items-center gap-1 text-xs font-bold text-emerald-400 bg-emerald-500/10 px-2.5 py-0.5 rounded-full border border-emerald-500/20">
                              <CheckCircle2 size={13} />
                              제출 완료 ({exam.submission?.score}점)
                            </span>
                          ) : (
                            <span className="flex items-center gap-1 text-xs font-bold text-amber-400 bg-amber-500/10 px-2.5 py-0.5 rounded-full border border-amber-500/20">
                              <Clock size={13} />
                              미응시
                            </span>
                          )}
                        </div>

                        <div>
                          <h3 className="text-2xl font-black text-white group-hover:text-violet-400 transition-colors line-clamp-2 leading-tight">
                            {exam.title}
                          </h3>
                          <p className="text-xs text-slate-500 font-bold mt-2">
                            총 {exam.question_count}문항 • 제한시간 {exam.duration_min}분
                          </p>
                        </div>

                        {isSubmitted && exam.submission && (
                          <div className="bg-white/5 rounded-2xl p-3 flex items-center justify-between border border-white/5 text-xs">
                            <span className="text-slate-400 font-bold">채점 결과</span>
                            <span className="text-emerald-400 font-black text-sm">
                              {exam.submission.correct_count} / {exam.submission.total_questions} 정답 ({exam.submission.score}점)
                            </span>
                          </div>
                        )}
                      </div>

                      <div className="pt-6 mt-4 border-t border-white/10">
                        <button
                          onClick={() => handleStartExam(exam.id)}
                          className={`w-full py-4 rounded-2xl font-black text-xs uppercase tracking-widest transition-all flex items-center justify-center gap-2 ${
                            isSubmitted
                              ? 'bg-white/10 hover:bg-white/20 text-white'
                              : 'bg-violet-600 hover:bg-violet-500 text-white shadow-lg shadow-violet-600/30'
                          }`}
                        >
                          {isSubmitted ? (
                            <>
                              <Eye size={16} />
                              <span>채점 결과 & 해설 보기</span>
                            </>
                          ) : (
                            <>
                              <FileCheck size={16} />
                              <span>시험 시작하기</span>
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )
          )}

          {/* 탭 2: 카트리지(시험지 묶음) 목록 */}
          {listTab === 'bundle' && (
            bundleList.length === 0 ? (
              <div className="bg-white/5 border border-dashed border-white/10 rounded-[40px] p-16 text-center space-y-4 max-w-xl mx-auto">
                <div className="w-16 h-16 bg-violet-500/20 text-violet-400 rounded-3xl flex items-center justify-center mx-auto">
                  <Layers size={32} />
                </div>
                <div className="space-y-1">
                  <h3 className="text-xl font-black text-white">배정된 시험지 묶음이 없습니다</h3>
                  <p className="text-xs text-slate-500 font-bold">
                    선생님이 카트리지 묶음 시험지를 배정하면 이곳에 표시됩니다!
                  </p>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {bundleList.map(bundle => (
                  <div
                    key={bundle.id}
                    className="bg-white/5 border border-white/10 hover:border-violet-500/50 rounded-[32px] p-6 shadow-2xl backdrop-blur-3xl transition-all flex flex-col justify-between group relative overflow-hidden"
                  >
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <span className="px-3 py-1 bg-violet-500/20 text-violet-300 border border-violet-500/30 text-[11px] font-black rounded-full flex items-center gap-1.5">
                          <Layers size={12} />
                          {bundle.grade} 묶음
                        </span>
                        <span className="text-xs font-bold text-violet-400 bg-violet-500/10 px-2.5 py-0.5 rounded-full border border-violet-500/20">
                          총 {bundle.items.length}회차 구성
                        </span>
                      </div>

                      <div>
                        <h3 className="text-2xl font-black text-white group-hover:text-violet-400 transition-colors line-clamp-2 leading-tight">
                          {bundle.title}
                        </h3>
                        {bundle.description && (
                          <p className="text-xs text-slate-400 font-medium mt-1 line-clamp-2">
                            {bundle.description}
                          </p>
                        )}
                      </div>

                      {/* 회차별 시험지 서브 리스트 */}
                      <div className="space-y-2 pt-2 border-t border-white/5">
                        <p className="text-[11px] font-black text-slate-500 uppercase tracking-widest">
                          포함된 시험지 순서
                        </p>
                        <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                          {bundle.items.map((item, idx) => (
                            <div
                              key={item.exam_id}
                              className="flex items-center justify-between p-2.5 rounded-xl bg-white/5 border border-white/5 text-xs"
                            >
                              <div className="flex items-center gap-2 truncate">
                                <span className="w-5 h-5 rounded-lg bg-violet-600/30 text-violet-300 font-black flex items-center justify-center text-[10px] shrink-0">
                                  {idx + 1}
                                </span>
                                <span className="font-bold text-slate-200 truncate">{item.exam_title}</span>
                              </div>
                              <span className="text-[10px] text-slate-500 shrink-0 font-medium ml-2">
                                {item.question_count ? `${item.question_count}문항` : ''}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>

                    <div className="pt-6 mt-4 border-t border-white/10">
                      <button
                        onClick={() => {
                          if (bundle.items.length > 0) {
                            handleStartExam(bundle.items[0].exam_id, bundle, 1);
                          }
                        }}
                        className="w-full py-4 rounded-2xl font-black text-xs uppercase tracking-widest transition-all flex items-center justify-center gap-2 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white shadow-lg shadow-violet-600/30"
                      >
                        <PlayCircle size={16} />
                        <span>카트리지 1회차부터 응시 시작</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )
          )}

          {/* 탭 3: 오답 시험지 목록 */}
          {listTab === 'wrong' && (
            wrongExams.length === 0 ? (
              <div className="bg-white/5 border border-dashed border-rose-500/20 rounded-[40px] p-16 text-center space-y-4 max-w-xl mx-auto">
                <div className="w-16 h-16 bg-rose-500/20 text-rose-400 rounded-3xl flex items-center justify-center mx-auto">
                  <RotateCcw size={32} />
                </div>
                <div className="space-y-1">
                  <h3 className="text-xl font-black text-white">배정된 오답 시험지가 없습니다</h3>
                  <p className="text-xs text-slate-500 font-bold">
                    선생님이 시험 응시 후 오답 처리를 진행하면, 틀린 문제들만 모아 이곳에 오답 시험지가 배정됩니다!
                  </p>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {wrongExams.map((exam: any) => {
                  const isSubmitted = exam.is_submitted;
                  return (
                    <div
                      key={exam.id}
                      className="bg-white/5 border border-rose-500/30 hover:border-rose-500/60 rounded-[32px] p-6 shadow-2xl backdrop-blur-3xl transition-all flex flex-col justify-between group relative overflow-hidden"
                    >
                      <div className="space-y-4">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1.5">
                            <span className="px-3 py-1 bg-rose-500/20 text-rose-300 border border-rose-500/30 text-[11px] font-black rounded-full flex items-center gap-1.5">
                              <RotateCcw size={12} />
                              오답 클리닉
                            </span>
                            {exam.title?.includes('쌍둥이') && (
                              <span className="px-2.5 py-1 bg-gradient-to-r from-purple-500/30 to-indigo-500/30 text-purple-200 border border-purple-500/40 text-[10px] font-black rounded-full flex items-center gap-1 shadow-sm">
                                <span>👯 쌍둥이 변형</span>
                              </span>
                            )}
                          </div>
                          {isSubmitted ? (
                            <span className="flex items-center gap-1 text-xs font-bold text-emerald-400 bg-emerald-500/10 px-2.5 py-0.5 rounded-full border border-emerald-500/20">
                              <CheckCircle2 size={13} />
                              제출 완료 ({exam.submission?.score}점)
                            </span>
                          ) : (
                            <span className="flex items-center gap-1 text-xs font-bold text-rose-400 bg-rose-500/10 px-2.5 py-0.5 rounded-full border border-rose-500/20">
                              <Clock size={13} />
                              미응시
                            </span>
                          )}
                        </div>

                        <div>
                          <h3 className="text-2xl font-black text-white group-hover:text-rose-400 transition-colors line-clamp-2 leading-tight">
                            {exam.title}
                          </h3>
                          <p className="text-xs text-slate-500 font-bold mt-2">
                            오답 문항 총 {exam.question_count}문제 • 제한시간 {exam.duration_min}분
                          </p>
                        </div>

                        {isSubmitted && exam.submission && (
                          <div className="bg-white/5 rounded-2xl p-3 flex items-center justify-between border border-white/5 text-xs">
                            <span className="text-slate-400 font-bold">오답 재채점 결과</span>
                            <span className="text-emerald-400 font-black text-sm">
                              {exam.submission.correct_count} / {exam.submission.total_questions} 정답 ({exam.submission.score}점)
                            </span>
                          </div>
                        )}
                      </div>

                      <div className="pt-6 mt-4 border-t border-white/10">
                        <button
                          onClick={() => handleStartExam(exam.id)}
                          className={`w-full py-4 rounded-2xl font-black text-xs uppercase tracking-widest transition-all flex items-center justify-center gap-2 ${
                            isSubmitted
                              ? 'bg-white/10 hover:bg-white/20 text-white'
                              : 'bg-rose-600 hover:bg-rose-500 text-white shadow-lg shadow-rose-600/30'
                          }`}
                        >
                          {isSubmitted ? (
                            <>
                              <Eye size={16} />
                              <span>채점 결과 & 해설 보기</span>
                            </>
                          ) : (
                            <>
                              <RotateCcw size={16} />
                              <span>오답 다시 풀기</span>
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )
          )}
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          2. 시험 응시 화면 (VIEW: 'taking')
      ───────────────────────────────────────────────────────────── */}
      {viewMode === 'taking' && currentExam && (
        <div className="space-y-6 animate-in slide-in-from-bottom-5 duration-500 pb-16">
          
          {/* 상단 헤더 바 */}
          <div className="bg-white/5 p-4 md:p-6 rounded-[32px] border border-white/10 backdrop-blur-3xl flex flex-col md:flex-row items-center justify-between gap-4 shadow-2xl">
            <div className="flex items-center gap-3 w-full md:w-auto">
              <button
                onClick={() => {
                  if (confirm('시험 응시를 중단하고 목록으로 나가시겠습니까? 작성 중인 답안은 보존됩니다.')) {
                    broadcastProctorStatus('PAUSED');
                    setViewMode('list');
                  }
                }}
                className="w-12 h-12 rounded-2xl bg-white/5 hover:bg-white/10 flex items-center justify-center text-slate-400 hover:text-white transition-colors shrink-0"
                title="목록으로"
              >
                <ArrowLeft size={20} />
              </button>
              <div>
                <div className="flex items-center gap-2">
                  {currentBundle && (
                    <span className="px-2 py-0.5 rounded-md bg-indigo-500/20 text-indigo-300 font-bold text-[10px] border border-indigo-500/30">
                      {currentBundle.title} • {currentRound}회차
                    </span>
                  )}
                  <h3 className="text-lg md:text-xl font-black text-white line-clamp-1">
                    {currentExam.title}
                  </h3>
                </div>
                <span className="text-[11px] font-bold text-violet-400">
                  문항 {currentQuestionIndex + 1} / {currentExam.questions.length}
                </span>
              </div>
            </div>

            {/* 🔥 상단 실시간 제한시간 자동 카운트다운 타이머 */}
            <div className={`px-5 py-2.5 rounded-2xl flex items-center gap-2.5 border font-mono font-black text-sm md:text-base shadow-lg transition-all ${
              timeLeft < 300 
                ? 'bg-rose-500/20 text-rose-300 border-rose-500/50 animate-pulse' 
                : 'bg-white/10 text-white border-white/10'
            }`}>
              <Clock size={19} className={timeLeft < 300 ? 'text-rose-400' : 'text-violet-400'} />
              <div className="flex flex-col text-left">
                <span className="text-[9px] uppercase tracking-wider text-slate-400 font-sans">남은 제한시간</span>
                <span className="tracking-widest">{formatRemainingTime(timeLeft)}</span>
              </div>
            </div>

            {/* 문항 번호 네비게이션 칩 */}
            <div className="flex items-center gap-1.5 overflow-x-auto max-w-full md:max-w-md py-1 scrollbar-hide">
              {currentExam.questions.map((q, idx) => {
                const isCurrent = currentQuestionIndex === idx;
                const ans = userAnswers[q.id];
                const isUnknown = ans === '모름';
                const isAnswered = !!ans && !isUnknown;

                return (
                  <button
                    key={q.id}
                    onClick={() => handleNavigateQuestion(idx)}
                    className={`w-9 h-9 rounded-xl font-black text-xs shrink-0 transition-all flex items-center justify-center relative ${
                      isCurrent
                        ? 'bg-violet-600 text-white shadow-lg shadow-violet-500/50 scale-105 ring-2 ring-violet-400'
                        : isUnknown
                        ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                        : isAnswered
                        ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                        : 'bg-white/5 text-slate-500 hover:text-white border border-white/5'
                    }`}
                  >
                    {isUnknown ? '?' : idx + 1}
                  </button>
                );
              })}
            </div>

            {/* 답안 제출 버튼 */}
            <button
              onClick={() => setShowSubmitConfirm(true)}
              className="px-6 py-3 bg-violet-600 hover:bg-violet-500 text-white font-black text-xs rounded-2xl transition-all shadow-lg shadow-violet-600/30 flex items-center gap-2 shrink-0"
            >
              <Send size={15} />
              <span>답안 제출</span>
            </button>
          </div>

          {/* 메인 문제 영역 */}
          {(() => {
            const question = currentExam.questions[currentQuestionIndex];
            if (!question) return null;
            const currentAnswer = userAnswers[question.id] || '';
            const spentSec = questionSpentTimes[question.id] || 0;

            return (
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                
                {/* 좌측/중앙: 문제 이미지 뷰어 */}
                <div className="lg:col-span-8 bg-white/5 border border-white/10 rounded-[40px] p-6 md:p-8 backdrop-blur-3xl shadow-3xl min-h-[500px] flex flex-col justify-between relative overflow-hidden">
                  <div className="flex items-center justify-between text-xs font-black text-slate-500 uppercase tracking-widest pb-4">
                    <div className="flex items-center gap-2">
                      <span>QUESTION {currentQuestionIndex + 1}</span>
                      {question.folder_name && (
                        <span className="px-2 py-0.5 rounded-lg bg-violet-500/20 text-violet-300 font-bold text-[11px] normal-case">
                          [{question.folder_name}] {question.question_number ? `${question.question_number}번` : ''}
                        </span>
                      )}
                    </div>

                    {/* 문제별 소요시간 실시간 표시 */}
                    <div className="flex items-center gap-1.5 text-slate-400 font-mono text-[11px] bg-white/5 px-2.5 py-1 rounded-lg border border-white/5">
                      <Clock size={13} className="text-violet-400" />
                      <span>소요시간: <strong className="text-white font-bold">{spentSec}초</strong></span>
                    </div>
                  </div>

                  {question.image_url ? (
                    <div className="w-full flex-1 flex justify-center items-center py-4">
                      <img
                        src={question.image_url}
                        alt={`문제 ${currentQuestionIndex + 1}번`}
                        className="max-w-full max-h-[65vh] object-contain rounded-2xl shadow-2xl bg-white p-2"
                      />
                    </div>
                  ) : (
                    <div className="text-center space-y-2 py-20 text-slate-500 my-auto">
                      <AlertCircle size={40} className="mx-auto text-amber-500 opacity-60" />
                      <p className="text-sm font-bold">문제 이미지를 준비 중입니다.</p>
                      <p className="text-xs text-slate-600 font-medium">{question.name}</p>
                    </div>
                  )}

                  {/* 이전 / 다음 문제 이동 버튼 */}
                  <div className="w-full flex items-center justify-between pt-4 mt-auto border-t border-white/10">
                    <button
                      onClick={() => handleNavigateQuestion(Math.max(0, currentQuestionIndex - 1))}
                      disabled={currentQuestionIndex === 0}
                      className="px-5 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 disabled:opacity-30 text-white font-black text-xs transition-colors flex items-center gap-1.5"
                    >
                      <ArrowLeft size={16} />
                      이전 문제
                    </button>

                    <button
                      onClick={() => handleNavigateQuestion(Math.min(currentExam.questions.length - 1, currentQuestionIndex + 1))}
                      disabled={currentQuestionIndex === currentExam.questions.length - 1}
                      className="px-5 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 disabled:opacity-30 text-white font-black text-xs transition-colors flex items-center gap-1.5"
                    >
                      다음 문제
                      <ArrowRight size={16} />
                    </button>
                  </div>
                </div>

                {/* 우측: 답안 입력 패널 (객관식 1~5번, 모름 버튼, 주관식) */}
                <div className="lg:col-span-4 bg-white/5 border border-white/10 rounded-[40px] p-6 md:p-8 backdrop-blur-3xl shadow-3xl flex flex-col justify-between space-y-6">
                  <div>
                    <h4 className="text-base font-black text-white mb-1 flex items-center gap-2">
                      <FileCheck size={18} className="text-violet-400" />
                      답안 마킹
                    </h4>
                    <p className="text-xs text-slate-400 font-medium">
                      문제 풀이 후 정답을 선택하거나 입력하세요.
                    </p>

                    {/* 객관식 1~5번 선택 버튼 */}
                    <div className="mt-8 space-y-3">
                      <label className="block text-[11px] font-black text-slate-500 uppercase tracking-widest">
                        객관식 정답 선택
                      </label>
                      <div className="grid grid-cols-5 gap-2">
                        {['1', '2', '3', '4', '5'].map((num, i) => {
                          const symbols = ['①', '②', '③', '④', '⑤'];
                          const isSelected = currentAnswer === num || currentAnswer === symbols[i];
                          return (
                            <button
                              key={num}
                              type="button"
                              onClick={() => handleAnswerSelect(question.id, num)}
                              className={`py-4 rounded-2xl font-black text-base transition-all ${
                                isSelected
                                  ? 'bg-violet-600 text-white shadow-xl shadow-violet-600/50 scale-105 ring-2 ring-violet-400'
                                  : 'bg-white/5 hover:bg-white/10 text-slate-300 border border-white/5'
                              }`}
                            >
                              {symbols[i]}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* 🔥 [모름] 버튼 추가 */}
                    <div className="mt-4">
                      <button
                        type="button"
                        onClick={() => handleAnswerSelect(question.id, '모름')}
                        className={`w-full py-3.5 rounded-2xl font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition-all ${
                          currentAnswer === '모름'
                            ? 'bg-amber-500 text-slate-950 shadow-xl shadow-amber-500/40 ring-2 ring-amber-300 font-extrabold scale-[1.02]'
                            : 'bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30'
                        }`}
                      >
                        <HelpCircle size={16} />
                        <span>{currentAnswer === '모름' ? '✓ 모름으로 마킹됨' : '모름 (정답 체크 및 시간 저장)'}</span>
                      </button>
                    </div>

                    {/* 주관식 직접 입력란 */}
                    <div className="mt-8 space-y-2">
                      <label className="block text-[11px] font-black text-slate-500 uppercase tracking-widest">
                        주관식 답안 직접 입력
                      </label>
                      <input
                        type="text"
                        value={currentAnswer === '모름' ? '' : currentAnswer}
                        onChange={e => handleAnswerSelect(question.id, e.target.value)}
                        placeholder="정답 입력 (예: 83, -2 등)"
                        className="w-full bg-white/5 border border-white/10 focus:border-violet-500 rounded-2xl py-3.5 px-4 text-center text-lg font-black text-white focus:outline-none transition-all placeholder:text-slate-600"
                      />
                    </div>

                    {/* 📸 [신규] 풀이과정 사진 인증샷 업로드 영역 */}
                    <div className="mt-6 pt-5 border-t border-white/10 space-y-2.5">
                      <div className="flex items-center justify-between">
                        <label className="text-[11px] font-black text-amber-400 uppercase tracking-widest flex items-center gap-1.5">
                          <Camera size={14} />
                          풀이 인증샷 {currentExam.require_proof_image && <span className="text-rose-400 font-extrabold">*필수</span>}
                        </label>
                        {proofImages[question.id] && (
                          proofImages[question.id].isUploading ? (
                            <span className="text-[10px] font-bold text-amber-400 flex items-center gap-1">
                              <Loader2 size={12} className="animate-spin" /> 구글 드라이브 동기화 중...
                            </span>
                          ) : (
                            <span className="text-[10px] font-bold text-emerald-400 flex items-center gap-1">
                              <CheckCircle2 size={12} /> 구글 드라이브 저장됨
                            </span>
                          )
                        )}
                      </div>

                      {proofImages[question.id] ? (
                        <div className="relative bg-white/5 rounded-2xl p-2.5 border border-emerald-500/40 flex items-center gap-3">
                          <img
                            src={proofImages[question.id].url}
                            alt="풀이 인증샷"
                            className="w-14 h-14 object-cover rounded-xl border border-white/10 cursor-pointer hover:scale-105 transition-transform"
                            onClick={() => setViewingProofUrl(proofImages[question.id].url)}
                            title="클릭하여 크게 보기"
                          />
                          <div className="flex-1 min-w-0">
                            <div className="text-xs font-bold text-white truncate">{proofImages[question.id].fileName}</div>
                            <div className="flex items-center gap-2 mt-1">
                              {proofImages[question.id].isUploading ? (
                                <span className="text-[10px] text-amber-400 font-bold flex items-center gap-1">
                                  <Loader2 size={10} className="animate-spin" /> 동기화 중...
                                </span>
                              ) : (
                                <span className="text-[10px] text-emerald-400 font-bold flex items-center gap-1">
                                  <CheckCircle2 size={10} /> 저장 완료
                                </span>
                              )}
                              <button
                                type="button"
                                onClick={() => setViewingProofUrl(proofImages[question.id].url)}
                                className="text-[10px] text-amber-400 hover:underline flex items-center gap-1"
                              >
                                <Maximize2 size={10} /> 크게 보기
                              </button>
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleRemoveProof(question.id)}
                            className="p-1.5 text-slate-400 hover:text-rose-400 rounded-lg transition-colors"
                            title="삭제 후 다시 촬영"
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                      ) : (
                        <div>
                          <input
                            type="file"
                            id={`proof-upload-${question.id}`}
                            accept="image/*"
                            capture="environment"
                            className="hidden"
                            onChange={(e) => {
                              const f = e.target.files?.[0];
                              if (f) handleUploadProof(question.id, currentQuestionIndex + 1, f);
                              e.target.value = '';
                            }}
                          />
                          <label
                            htmlFor={`proof-upload-${question.id}`}
                            className={`w-full py-3.5 px-4 rounded-2xl border border-dashed flex items-center justify-center gap-2 cursor-pointer transition-all ${
                              uploadingProofQId === question.id
                                ? 'bg-amber-500/20 border-amber-400/50 text-amber-300'
                                : 'bg-amber-500/10 hover:bg-amber-500/20 border-amber-400/30 text-amber-300 hover:border-amber-400/60'
                            }`}
                          >
                            {uploadingProofQId === question.id ? (
                              <>
                                <Loader2 size={16} className="animate-spin text-amber-400" />
                                <span className="text-xs font-black">내 구글 드라이브에 저장 중...</span>
                              </>
                            ) : (
                              <>
                                <Camera size={16} className="text-amber-400" />
                                <span className="text-xs font-black">풀이과정 사진 촬영 / 업로드</span>
                              </>
                            )}
                          </label>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* 마킹 현황 요약 */}
                  <div className="pt-4 border-t border-white/10 text-xs text-slate-400 flex items-center justify-between">
                    <span>작성한 문항</span>
                    <span className="font-black text-violet-400">
                      {Object.keys(userAnswers).length} / {currentExam.questions.length}문항
                    </span>
                  </div>
                </div>

              </div>
            );
          })()}

        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          3. 제출 확인 모달
      ───────────────────────────────────────────────────────────── */}
      {showSubmitConfirm && currentExam && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-[#0f172a] border border-white/10 rounded-[32px] max-w-md w-full p-8 space-y-6 shadow-3xl text-center">
            <div className="w-16 h-16 rounded-full bg-violet-500/20 text-violet-400 flex items-center justify-center mx-auto">
              <Send size={28} />
            </div>

            <div className="space-y-2">
              <h3 className="text-2xl font-black text-white">시험지를 제출하시겠습니까?</h3>
              <p className="text-xs text-slate-400">
                총 {currentExam.questions.length}문제 중{' '}
                <strong className="text-violet-400 font-bold">{Object.keys(userAnswers).length}문제</strong>에 답안을 작성했습니다.
                제출 즉시 자동 채점이 진행됩니다.
              </p>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setShowSubmitConfirm(false)}
                className="flex-1 py-3.5 rounded-2xl bg-white/5 hover:bg-white/10 text-slate-400 font-black text-xs transition-colors"
              >
                계속 풀기
              </button>
              <button
                onClick={handleSubmitExam}
                disabled={isSubmitting}
                className="flex-1 py-3.5 rounded-2xl bg-violet-600 hover:bg-violet-500 text-white font-black text-xs transition-all shadow-lg shadow-violet-600/30 flex items-center justify-center gap-1.5"
              >
                {isSubmitting ? <Loader2 size={16} className="animate-spin" /> : <span>제출 확정</span>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          4. 채점 결과 화면 (VIEW: 'result')
      ───────────────────────────────────────────────────────────── */}
      {viewMode === 'result' && submissionResult && currentExam && (
        <div className="space-y-8 animate-in fade-in duration-500 pb-16">
          <div className="flex items-center justify-between">
            <button
              onClick={() => {
                setViewMode('list');
                setCurrentExam(null);
                setSubmissionResult(null);
              }}
              className="px-5 py-2.5 rounded-2xl bg-white/5 hover:bg-white/10 text-white font-black text-xs transition-colors flex items-center gap-2"
            >
              <ArrowLeft size={16} />
              시험 목록으로 돌아가기
            </button>

            {currentBundle && (
              <span className="px-3 py-1 bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 rounded-full text-xs font-black">
                {currentBundle.title} • {currentRound}회차 결과
              </span>
            )}
          </div>

          {/* 결과 요약 카드 */}
          <div className="bg-gradient-to-br from-violet-900/30 via-slate-900/40 to-slate-900/60 border border-violet-500/30 rounded-[40px] p-8 md:p-12 shadow-3xl text-center space-y-6">
            <div className="space-y-2">
              {submissionResult.has_pending_review ? (
                <span className="px-4 py-1.5 bg-amber-500/20 text-amber-300 border border-amber-500/30 text-xs font-black rounded-full inline-flex items-center gap-1.5 animate-pulse">
                  <Clock size={12} />
                  <span>서술형 {submissionResult.pending_count || 1}문항 채점 대기 중</span>
                </span>
              ) : (
                <span className="px-4 py-1.5 bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-xs font-black rounded-full inline-block">
                  채점 완료
                </span>
              )}
              <h2 className="text-3xl md:text-5xl font-black text-white">
                {submissionResult.exam_title}
              </h2>
              {submissionResult.has_pending_review && (
                <p className="text-xs text-amber-300/80 font-medium max-w-lg mx-auto pt-1">
                  💡 서술형 문제는 선생님께서 직접 검토 후 최종 점수가 업데이트됩니다.
                </p>
              )}
            </div>

            <div className="flex justify-center items-center gap-8 md:gap-16 pt-4">
              <div>
                <p className="text-xs text-slate-400 font-bold uppercase tracking-widest">
                  {submissionResult.has_pending_review ? '현재 가채점 점수' : '내 점수'}
                </p>
                <p className="text-5xl md:text-7xl font-black text-violet-400 mt-1">
                  {submissionResult.score}
                  <span className="text-2xl text-slate-500 font-medium">점</span>
                </p>
              </div>
              <div className="w-px h-16 bg-white/10" />
              <div>
                <p className="text-xs text-slate-400 font-bold uppercase tracking-widest">정답 문항</p>
                <p className="text-5xl md:text-7xl font-black text-emerald-400 mt-1">
                  {submissionResult.correct_count}
                  <span className="text-2xl text-slate-500 font-medium"> / {submissionResult.total_questions}</span>
                </p>
              </div>
            </div>
          </div>

          {/* 문항별 상세 채점 내역 & 해설 보기 */}
          <div className="space-y-4">
            <h3 className="text-xl font-black text-white">문항별 상세 채점 & 해설</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {currentExam.questions.map((q, idx) => {
                const ansInfo = submissionResult.answers?.[q.id];
                const isDescriptive = !!q.is_descriptive || !!ansInfo?.is_descriptive;
                const isPending = ansInfo?.grading_status === 'pending' || (isDescriptive && ansInfo?.is_correct === null);
                const isReviewed = ansInfo?.grading_status === 'reviewed';
                const isCorrect = ansInfo?.is_correct === true;
                const canShowSolution = ansInfo?.show_solution !== false;
                const userAns = ansInfo?.user_answer || '(미입력)';
                const correctAns = canShowSolution
                  ? (ansInfo?.correct_answer || q.answer || '')
                  : '(선생님 채점 검토 후 공개)';
                const spentSec = ansInfo?.time_spent_sec || questionSpentTimes[q.id] || 0;

                let cardStyle = 'bg-rose-500/5 border-rose-500/20';
                let badgeStyle = 'bg-rose-500 text-white';
                let statusLabel = '오답';

                if (isPending) {
                  cardStyle = 'bg-amber-500/5 border-amber-500/25 ring-1 ring-amber-500/10';
                  badgeStyle = 'bg-amber-500 text-slate-950 font-black';
                  statusLabel = '⏳ 선생님 채점 대기';
                } else if (isCorrect) {
                  cardStyle = 'bg-emerald-500/5 border-emerald-500/20';
                  badgeStyle = 'bg-emerald-500 text-white';
                  statusLabel = isReviewed ? '⭕ 정답 (선생님 승인)' : '정답';
                } else if (isReviewed) {
                  statusLabel = '❌ 오답 (선생님 확인)';
                }

                return (
                  <div
                    key={q.id}
                    className={`p-6 rounded-[28px] border transition-all ${cardStyle}`}
                  >
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-2">
                        <span className={`w-8 h-8 rounded-xl font-black text-xs flex items-center justify-center ${badgeStyle}`}>
                          {idx + 1}
                        </span>
                        <span className={`text-xs font-bold ${
                          isPending ? 'text-amber-300' : isCorrect ? 'text-emerald-300' : 'text-slate-300'
                        }`}>
                          {statusLabel}
                        </span>
                        {isDescriptive && (
                          <span className="px-1.5 py-0.5 rounded bg-violet-500/20 text-violet-300 border border-violet-500/30 text-[9px] font-black">
                            서술형
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-2.5 text-xs">
                        <span className="text-slate-400 font-mono">⏱️ {spentSec}초 소요</span>
                        {q.solution_drive_id && canShowSolution && (
                          <button
                            onClick={() => handleOpenSolution(q.solution_drive_id)}
                            className="px-3 py-1.5 rounded-xl bg-violet-600/30 hover:bg-violet-600/50 text-violet-300 font-black text-[11px] transition-colors flex items-center gap-1 cursor-pointer"
                          >
                            <BookOpen size={13} />
                            <span>해설 보기</span>
                          </button>
                        )}
                        <button
                          onClick={() => handleToggleQuestionReview(q, idx)}
                          className={`px-3 py-1.5 rounded-xl font-black text-[11px] transition-all flex items-center gap-1.5 ${
                            isQuestionInReview(q.id)
                              ? 'bg-amber-400 text-slate-950 shadow-md shadow-amber-400/20'
                              : 'bg-white/10 hover:bg-white/20 text-slate-300 hover:text-white border border-white/10'
                          }`}
                          title={isQuestionInReview(q.id) ? '클릭 시 복습에서 제거' : '체크 시 내 복습 홈에 자동 추가'}
                        >
                          <Star
                            size={13}
                            fill={isQuestionInReview(q.id) ? 'currentColor' : 'none'}
                            className={isQuestionInReview(q.id) ? 'text-slate-950' : 'text-amber-400'}
                          />
                          <span>{isQuestionInReview(q.id) ? '복습 담김' : '복습 체크'}</span>
                        </button>
                      </div>
                    </div>

                    {q.image_url && (
                      <div className="bg-white p-2 rounded-xl mb-4 max-h-48 overflow-hidden flex justify-center">
                        <img
                          src={q.image_url}
                          alt={`문제 ${idx + 1}번`}
                          className="max-h-44 object-contain"
                        />
                      </div>
                    )}

                    <div className="grid grid-cols-2 gap-2 text-xs pt-2 border-t border-white/5">
                      <div className="p-2 rounded-xl bg-white/5">
                        <span className="text-slate-500 block text-[10px] font-bold">내가 작성한 답</span>
                        <span className={`font-black text-sm ${
                          isPending ? 'text-amber-300' : isCorrect ? 'text-emerald-400' : 'text-rose-400'
                        }`}>
                          {userAns}
                        </span>
                      </div>
                      <div className="p-2 rounded-xl bg-white/5">
                        <span className="text-slate-500 block text-[10px] font-bold">
                          {isPending ? '정답 (채점 대기 중)' : '정답'}
                        </span>
                        <span className={`font-black text-sm ${
                          !canShowSolution ? 'text-slate-500 italic text-xs' : 'text-slate-200'
                        }`}>
                          {correctAns}
                        </span>
                      </div>
                    </div>

                    {/* 📸 제출된 풀이 인증샷 보기 버튼 */}
                    {ansInfo?.proof_image_url && (
                      <div className="mt-2.5 pt-2 border-t border-white/5">
                        <button
                          type="button"
                          onClick={() => setViewingProofUrl(ansInfo.proof_image_url!)}
                          className="w-full py-2 bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-colors"
                        >
                          <Camera size={13} />
                          <span>내가 올린 풀이 인증샷 확인</span>
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* 🌟 풀이과정 사진 인증샷 확대 보기 모달 */}
      {viewingProofUrl && (
        <div className="fixed inset-0 z-[120] bg-black/90 backdrop-blur-md flex items-center justify-center p-4">
          <div className="relative max-w-4xl w-full max-h-[90vh] bg-slate-900 border border-white/10 rounded-[32px] p-6 flex flex-col items-center shadow-3xl">
            <div className="w-full flex items-center justify-between pb-4 border-b border-white/10 mb-4">
              <div className="flex items-center gap-2 text-white font-black text-sm">
                <Camera size={18} className="text-amber-400" />
                <span>풀이과정 사진 인증샷 (원본)</span>
              </div>
              <button
                onClick={() => setViewingProofUrl(null)}
                className="w-9 h-9 rounded-xl bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors font-black"
              >
                ✕
              </button>
            </div>
            <div className="flex-1 w-full overflow-auto flex items-center justify-center">
              <img
                src={viewingProofUrl}
                alt="풀이 인증샷 원본"
                className="max-w-full max-h-[75vh] object-contain rounded-2xl shadow-2xl bg-black"
              />
            </div>
          </div>
        </div>
      )}

      {/* 🌟 복습 토스트 메시지 */}
      {reviewToast && (
        <div className="fixed bottom-6 right-6 z-[60] bg-slate-900 border border-amber-400/40 text-white px-5 py-3.5 rounded-2xl shadow-2xl flex items-center gap-2.5 animate-in slide-in-from-bottom-5">
          <Star size={16} className="text-amber-400 fill-amber-400 shrink-0" />
          <span className="text-xs font-bold">{reviewToast}</span>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          5. 원본 해설 보기 모달 (HTML iframe)
      ───────────────────────────────────────────────────────────── */}
      {solutionModalFileId && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-[#0f172a] border border-white/10 rounded-[36px] max-w-4xl w-full h-[85vh] flex flex-col overflow-hidden shadow-3xl">
            <div className="p-6 border-b border-white/10 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <BookOpen size={20} className="text-violet-400" />
                <h3 className="text-lg font-black text-white">문제 정답 및 상세 해설</h3>
              </div>
              <button
                onClick={() => setSolutionModalFileId(null)}
                className="w-10 h-10 rounded-xl bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white flex items-center justify-center transition-colors"
              >
                ✕
              </button>
            </div>

            <div className="flex-1 bg-white p-4 overflow-y-auto">
              {solutionLoading ? (
                <div className="h-full flex flex-col items-center justify-center space-y-3">
                  <Loader2 className="animate-spin text-violet-600" size={36} />
                  <p className="text-xs font-bold text-slate-500">해설을 불러오는 중입니다...</p>
                </div>
              ) : solutionHtml ? (
                <iframe
                  srcDoc={solutionHtml}
                  title="해설"
                  className="w-full h-full border-0"
                />
              ) : (
                <div className="h-full flex items-center justify-center text-slate-400 text-sm">
                  해설 내용을 표시할 수 없습니다.
                </div>
              )}
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
