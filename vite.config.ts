import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path' // 🫦 절대 경로 계산을 위해 추가

// https://vite.dev/config/
export default defineConfig(({ mode }) => ({
  plugins: [react()],
  
  // 🫦 추가: 경로 별칭 설정 (기존 설정 유지하며 이 섹션만 추가됨)
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },

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
    drop: mode === 'production' ? ['console', 'debugger'] : [],
    
    // 🫦 5. 주석 박멸: 모든 종류의 주석을 빌드 결과물에서 삭제하도록 지시합니다.
    legalComments: 'none',
  }
}))