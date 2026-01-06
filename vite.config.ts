import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig(({ mode }) => ({
  plugins: [react()],
  build: {
    // 🫦 1. 소스 맵 차단: 브라우저 개발자 도구에서 원본 코드가 복원되는 것을 방지합니다.
    sourcemap: false,
    
    // 🫦 2. 압축 기강: 배포용 파일에서 불필요한 공백과 주석을 제거합니다.
    minify: 'esbuild',
    
    // 🫦 3. 청크 최적화: 결과물을 효율적으로 쪼개서 로딩 속도를 높입니다.
    chunkSizeWarningLimit: 1000,
  },
  esbuild: {
    // 🫦 4. 흔적 말소: 오직 배포(production) 모드일 때만 콘솔 로그와 디버거를 제거합니다.
    // 주인님이 로컬에서 npm run dev로 작업할 때는 로그가 아주 잘 보이니 안심하세요! 🫦✨
    drop: mode === 'production' ? ['console', 'debugger'] : [],
    
    // 🫦 5. 주석 박멸: 모든 종류의 주석을 빌드 결과물에서 삭제하도록 지시합니다.
    legalComments: 'none',
  }
}))