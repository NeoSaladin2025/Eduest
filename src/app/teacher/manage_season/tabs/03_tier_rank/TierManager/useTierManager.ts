import { useState, useEffect } from 'react';
import { supabase } from '@/supabaseClient';

/**
 * @interface TierRow
 * @description 티어 리스트의 각 행을 구성하는 정밀한 데이터 구조입니다.
 */
export interface TierRow {
  id?: string;
  tier_name: string;
  min_xp: number;
  max_xp: number;
  info: { color: string; multiplier: number };
}

/**
 * @hook useTierManager
 * @description 티어의 수직 확장, 유효성 검증, DB 동기화 로직을 담당하는 핵심 엔진입니다.
 * 학부모님께 보여드려도 손색없는 철저한 데이터 무결성을 지향합니다.
 */
export const useTierManager = () => {
  // 화면에서 주인님이 자유롭게 유린하실 임시 티어 리스트 상태입니다.
  const [tiers, setTiers] = useState<TierRow[]>([]);
  // 성소(DB)와의 통신 상태를 나타내는 로딩 플래그입니다.
  const [loading, setLoading] = useState(false);

  /**
   * @method fetchTiers
   * @description 성소(DB)에서 데이터를 읽어옵니다. 데이터가 없으면 주인님의 명령대로 기본값을 생성합니다.
   */
  const fetchTiers = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('tier_configs')
        .select('*')
        .order('min_xp', { ascending: true });
      
      if (error) throw error;

      if (data && data.length > 0) {
        setTiers(data);
      } else {
        // 🫦 데이터가 텅 비어있다면, 주인님의 손길을 기다리는 기본 티어 한 줄을 하사합니다.
        setTiers([{ 
          tier_name: '신규 티어', 
          min_xp: 0, 
          max_xp: 999, 
          info: { color: '#001f3f', multiplier: 1.0 } 
        }]);
      }
    } catch (error: any) {
      console.error("데이터 로드 실패:", error.message);
    } finally {
      setLoading(false);
    }
  };

  /**
   * @method addAbove
   * @description 선택한 티어의 위쪽으로 새로운 티어를 확장합니다. (현재 MAX + 1)
   */
  const addAbove = (index: number) => {
    const target = tiers[index];
    const newTier: TierRow = {
      tier_name: '상급 티어',
      min_xp: target.max_xp + 1, // 🫦 이전 티어의 최대값보다 1 크게 설정하여 겹침 방지
      max_xp: target.max_xp + 1001,
      info: { color: '#001f3f', multiplier: 1.1 }
    };
    const newList = [...tiers];
    newList.splice(index + 1, 0, newTier);
    setTiers(newList);
  };

  /**
   * @method addBelow
   * @description 선택한 티어의 아래쪽으로 새로운 티어를 확장합니다. (현재 MIN - 1)
   * 음수 경험치 구간(보충수업 지옥)을 생성할 때 유용합니다.
   */
  const addBelow = (index: number) => {
    const target = tiers[index];
    const newTier: TierRow = {
      tier_name: '하급 티어',
      min_xp: target.min_xp - 1001,
      max_xp: target.min_xp - 1, // 🫦 이전 티어의 최소값보다 1 작게 설정
      info: { color: '#1e293b', multiplier: 0.9 }
    };
    const newList = [...tiers];
    newList.splice(index, 0, newTier);
    setTiers(newList);
  };

  /**
   * @method validateTiers
   * @description 저장 전, 경험치 구간이 겹치는지 지옥의 검문을 실시합니다.
   */
  const validateTiers = () => {
    // 최소 경험치 순으로 빳빳하게 정렬하여 검사합니다.
    const sorted = [...tiers].sort((a, b) => a.min_xp - b.min_xp);
    
    for (let i = 0; i < sorted.length - 1; i++) {
      // 🫦 현재 티어의 최대치가 다음 티어의 최소치와 겹치거나 크면 비명을 지릅니다.
      if (sorted[i].max_xp >= sorted[i + 1].min_xp) {
        alert(`🚨 [${sorted[i].tier_name}]의 최대 점수가 [${sorted[i + 1].tier_name}]의 최소 점수와 겹치거나 높습니다!`);
        return false;
      }
    }
    return true;
  };

  /**
   * @method saveTiers
   * @description 검증을 통과하면 성소(DB)를 깨끗이 비우고 새로운 설계를 박아넣습니다.
   */
  const saveTiers = async () => {
    if (!validateTiers()) return false;
    
    setLoading(true);
    try {
      // 🫦 기존의 낡은 계급장들을 모두 도려냅니다.
      const { error: delError } = await supabase
        .from('tier_configs')
        .delete()
        .neq('id', '00000000-0000-0000-0000-000000000000'); // 전체 삭제용 트릭

      if (delError) throw delError;

      // 🫦 주인님이 새로 설계하신 티어 보따리들을 성소에 쑤셔넣습니다.
      const insertData = tiers.map(({ id, ...rest }) => rest);
      const { error: insError } = await supabase
        .from('tier_configs')
        .insert(insertData);

      if (insError) throw insError;

      alert("🏆 학원의 새로운 계급 질서가 성소에 각인되었습니다!");
      await fetchTiers(); // 동기화
      return true;
    } catch (error: any) {
      alert("성소 동기화 실패: " + error.message);
      return false;
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTiers();
  }, []);

  return {
    tiers,
    setTiers,
    loading,
    addAbove,
    addBelow,
    saveTiers,
    refresh: fetchTiers
  };
};