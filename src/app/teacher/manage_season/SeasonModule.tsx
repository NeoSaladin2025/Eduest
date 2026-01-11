import { useSeasonModule } from './useSeasonModule';

// 하위 탭들 임포트 (폴더 경로 그대로!)
import SeasonGenesis from './tabs/01_starting_and_ending/SeasonGenesis';
import PointControl from './tabs/02_point_and_xp/PointControl';
import TierHierarchy from './tabs/03_tier_rank/TierHierarchy';
import RuleMultiplier from './tabs/04_daily_rule/RuleMultiplier';
import EmblemMark from './tabs/05_emblem_mark/EmblemMark';

const SeasonModule = () => {
  const { activeTab, setActiveTab, seasonTabs } = useSeasonModule();

  return (
    <div className="flex flex-col h-[calc(100vh-5rem)] bg-white animate-in fade-in duration-700">
      
      {/*  탭 네비게이션 구역*/}
      <div className="flex px-10 bg-[#fafafa] border-b border-[#f3f4f6]">
        {seasonTabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`py-5 px-6 text-xs font-black tracking-widest transition-all border-b-2 ${
              activeTab === tab.id
                ? 'border-[#001f3f] text-[#001f3f]'
                : 'border-transparent text-[#9ca3af] hover:text-[#111827]'
            }`}
          >
            <span className="mr-2 opacity-50">{tab.icon}</span>
            {tab.label}
          </button>
        ))}
      </div>

      {/* 탭별 실제 내용물  */}
      <div className="flex-1 overflow-y-auto p-10">
        {activeTab === '01_START' && <SeasonGenesis />}
        {activeTab === '02_POINT' && <PointControl />}
        {activeTab === '03_RANK' && <TierHierarchy />}
        {activeTab === '04_RULE' && <RuleMultiplier />}
        {activeTab === '05_EMBLEM' && <EmblemMark />}
      </div>
    </div>
  );
};

export default SeasonModule;