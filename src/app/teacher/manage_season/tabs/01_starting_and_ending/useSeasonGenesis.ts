import { useState, useEffect } from 'react';
import { supabase } from '@/supabaseClient'; // 프로젝트 경로 별칭 설정(@/* -> src/*)에 따른 임포트

/**
 * @hook useSeasonGenesis
 * @description 시즌의 시작(창조)과 종료(파괴)를 관장하는 비즈니스 로직 엔진입니다.
 * 기획 총괄의 지침에 따라 종료와 시작 로직을 엄격히 분리하여 설계되었습니다.
 */
export const useSeasonGenesis = () => {
  // 현재 시스템에서 활성화된 시즌 정보를 저장하는 상태
  const [activeSeason, setActiveSeason] = useState<any>(null);
  
  // 데이터베이스 트랜잭션 및 네트워크 통신 상태를 나타내는 플래그
  const [loading, setLoading] = useState(false);

  /**
   * @method fetchActiveSeason
   * @description 데이터베이스의 seasons 테이블을 조회하여 현재 'active' 상태인 시즌을 식별합니다.
   * 시스템 내에서 활성 시즌은 반드시 단 하나만 존재해야 하는 데이터 무결성 원칙을 따릅니다.
   */
  const fetchActiveSeason = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('seasons')
        .select('*')
        .eq('status', 'active')
        .maybeSingle(); // 단일 행 반환을 기대하며, 없을 경우 null을 반환합니다.
      
      if (error) throw error;
      setActiveSeason(data);
    } catch (error: any) {
      console.error("시스템 상태 조회 실패:", error.message);
    } finally {
      setLoading(false);
    }
  };

  // 컴포넌트 초기 로드 시 현재 시즌 상태를 확인합니다.
  useEffect(() => {
    fetchActiveSeason();
  }, []);

  /**
   * @method handleEndSeason
   * @description [절차 1: 시즌 종료 및 XP 귀속]
   * 현재 진행 중인 시즌을 종료(closed) 처리하고, 학생들의 시즌 경험치를 전체 경험치 합계에 누적합니다.
   * 이 과정은 PostgreSQL RPC(end_current_season)를 통해 원자적(Atomic)으로 실행됩니다.
   */
  const handleEndSeason = async () => {
    if (!activeSeason) {
      alert("종료할 수 있는 활성 시즌이 존재하지 않습니다.");
      return;
    }

    setLoading(true);
    try {
      // 서버측 RPC 함수 호출: 시즌 종료 및 XP 합산 수행
      const { error } = await supabase.rpc('end_current_season');
      
      if (error) throw error;
      
      alert("현재 시즌이 정상적으로 종료되었으며, 학생들의 데이터가 성공적으로 합산되었습니다.");
      await fetchActiveSeason(); // 상태 동기화
    } catch (err: any) {
      alert("시즌 종료 처리 중 오류 발생: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  /**
   * @method handleStartSeason
   * @description [절차 2: 새 시즌 창조 및 XP 초기화]
   * 새로운 시즌을 생성하기 전, 모든 학생의 시즌 경험치를 0으로 세척(Reset)합니다.
   * 이후 지정된 명칭으로 새로운 활성 시즌(active)을 생성합니다.
   */
  const handleStartSeason = async (newTitle: string) => {
    // 중복 시즌 활성화 방지를 위한 유효성 검사
    if (activeSeason) {
      alert("이미 활성화된 시즌이 존재합니다. 새 시즌을 시작하려면 먼저 기존 시즌을 종료하십시오.");
      return;
    }

    if (!newTitle.trim()) {
      alert("새로운 시즌의 명칭을 입력해 주십시오.");
      return;
    }

    setLoading(true);
    try {
      // 서버측 RPC 함수 호출: XP 초기화 및 신규 시즌 생성 수행
      const { error } = await supabase.rpc('start_new_season', { new_title: newTitle });
      
      if (error) throw error;
      
      alert(`신규 시즌 '${newTitle}'이(가) 성공적으로 시작되었습니다.`);
      await fetchActiveSeason(); // 상태 동기화
    } catch (err: any) {
      alert("시즌 시작 처리 중 오류 발생: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  return {
    activeSeason,
    loading,
    handleEndSeason,
    handleStartSeason,
    refresh: fetchActiveSeason
  };
};