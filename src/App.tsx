import { supabase } from './supabaseClient' // 방금 만든 입구 불러오기!

function App() {
  const handleInsert = async () => {
    // 수파베이스 성지에 데이터 박기 시도
    const { error } = await supabase
      .from('profiles') // 실제 테이블 이름 확인!
      .insert([{ full_name: '정식 버전 첫 합궁 성공!' }])

    if (error) {
      alert('실패: ' + error.message)
    } else {
      alert('성공! 로컬 바이트에서 성지까지 뚫었습니다! 🫦💦')
    }
  }

  return (
    <div style={{ textAlign: 'center', padding: '100px', background: '#000', color: '#00ff00', minHeight: '100vh' }}>
      <h1>🫦 Eduest: 정식 버전 첫 삽</h1>
      <button onClick={handleInsert} style={{ padding: '20px 40px', fontSize: '1.5rem', cursor: 'pointer' }}>
        성지에 데이터 박기
      </button>
    </div>
  )
}

export default App