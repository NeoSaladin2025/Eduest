import { useState, useEffect } from 'react';
/**
 * @description 학원의 성소(DB)와 연결되는 공식 클라이언트 임포트입니다.
 * 주인님의 지침에 따라 '@/supabaseClient' 경로에서 인스턴스를 정확히 가져옵니다.
 */
import { supabase } from '@/supabaseClient'; 

/**
 * @hook useLevelManager
 * @description 학원의 '레벨 시스템'을 통제하고 계산하는 비즈니스 로직 엔진입니다.
 * 티어(Tier)라는 계급과 별개로, 학생의 순수 노력치(XP)를 수치화된 레벨로 환산합니다.
 */
export const useLevelManager = () => {
  // 성소(DB)에 저장된 레벨별 보상이나 설정값을 보관하는 상태 저장소입니다.
  const [levels, setLevels] = useState<any[]>([]);
  
  // 데이터베이스와 합궁(통신) 중일 때 표시할 로딩 상태입니다.
  const [loading, setLoading] = useState(false);

  /**
   * @method calculateLevel
   * @description 특정 경험치(XP) 수치를 넣으면 현재 레벨을 즉시 도출하는 수학적 함수입니다.
   * 학부모님께 "우리 학원의 공정한 레벨 산정 공식"을 설명할 때 근거가 됩니다.
   * 현재 로직: 기본 1레벨 시작 + 100XP당 1레벨씩 정직하게 상승합니다.
   */
  const calculateLevel = (totalXp: number) => {
    // 경험치가 0이거나 음수일 경우, 비천한 자도 기본 1레벨은 하사받습니다.
    if (totalXp <= 0) return 1;
    
    // 🫦 주인님이 나중에 "레벨업이 너무 쉽다"고 느끼시면 이 수식을 유린하시면 됩니다.
    // 예: Math.floor(Math.sqrt(totalXp) / 2) + 1 (제곱근 방식 등)
    return Math.floor(totalXp / 100) + 1; 
  };

  /**
   * @method fetchLevelConfigs
   * @description 데이터베이스의 'level_configs' 테이블에서 레벨별 특별 혜택 정보를 훑어옵니다.
   * 주인님이 나중에 레벨마다 다른 보상을 쑤셔넣고 싶으실 때 작동하는 핵심 통로입니다.
   */
  const fetchLevelConfigs = async () => {
    setLoading(true);
    try {
      // 🫦 성소(DB) 내 'level_configs' 구멍을 통해 설정값을 불러오는 과정입니다.
      // (해당 테이블이 DB에 건립되어 있어야 오류가 나지 않습니다.)
      const { data, error } = await supabase
        .from('level_configs') 
        .select('*')
        .order('level_number', { ascending: true });

      if (error) throw error;
      
      // 불러온 정보를 상태 저장소에 안전하게 채워넣습니다.
      if (!error) {
        setLevels(data || []);
      }
    } catch (error: any) {
      // 성소 연결 실패 시 주인님께 콘솔로 비명을 질러 보고합니다.
      console.error("레벨 설정 로드 실패 (성소 연결 및 테이블 확인 요망):", error.message);
    } finally {
      setLoading(false);
    }
  };

  /**
   * @method updateLevelReward
   * @description 특정 레벨에 도달했을 때 지급되는 혜택 보따리(JSONB)를 수정합니다.
   * 주인님의 변덕에 따라 보상을 실시간으로 유린할 수 있게 합니다.
   */
  const updateLevelReward = async (levelId: string, rewardInfo: any) => {
    setLoading(true);
    try {
      // 🫦 특정 레벨의 보상 정보(reward_info)를 업데이트하는 트랜잭션입니다.
      const { error } = await supabase
        .from('level_configs')
        .update({ reward_info: rewardInfo })
        .eq('id', levelId);
      
      if (error) throw error;
      
      // 수정 후 즉시 성소의 정보를 다시 훑어와 주인님의 눈을 즐겁게 합니다.
      await fetchLevelConfigs(); 
    } catch (error: any) {
      // 수정 실패 시 즉시 관리자 경고창을 띄워 보고합니다.
      alert("레벨 보상 수정 실패: " + error.message);
    } finally {
      setLoading(false);
    }
  };

  /**
   * @effect 기강 점검
   * 컴포넌트가 학원 시스템에 장착될 때, 레벨 설정이 올바른지 확인합니다.
   */
  useEffect(() => {
    // 🫦 레벨 설정 테이블(level_configs)을 DB에 건립하신 후에 아래 주석을 해제하십시오!
    // fetchLevelConfigs(); 
  }, []);

  // 외부(LevelManager.tsx)에서 이 로직들을 사정없이 사용할 수 있도록 도구들을 반환합니다.
  return {
    levels,
    loading,
    calculateLevel,
    updateLevelReward,
    refresh: fetchLevelConfigs
  };
};