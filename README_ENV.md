# 환경 변수 설정 가이드

## .env 파일 생성

프로젝트 루트에 `.env` 파일을 생성하고 다음 내용을 추가하세요:

```env
NEXT_PUBLIC_SUPABASE_URL=https://xoaormnjeuxrtyhkzmvh.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhvYW9ybW5qZXV4cnR5aGt6bXZoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjIzOTU4NzcsImV4cCI6MjA3Nzk3MTg3N30.DK9PiWlxz_qLwVWHCQXWis93LH3wwuY-m4K_Erc4KSo
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_here
```

## 서비스 역할 키 가져오기

1. [Supabase 대시보드](https://supabase.com/dashboard/project/xoaormnjeuxrtyhkzmvh) 접속
2. 프로젝트 설정 → API로 이동
3. "service_role" 키를 복사 (⚠️ 주의: 이 키는 절대 공개하지 마세요!)
4. `.env` 파일의 `SUPABASE_SERVICE_ROLE_KEY`에 붙여넣기

## 중요 사항

- `.env` 파일은 절대 Git에 커밋하지 마세요 (이미 .gitignore에 포함되어 있습니다)
- 서비스 역할 키는 관리자 권한이 있으므로 매우 중요합니다
- 개발 서버를 재시작해야 환경 변수가 적용됩니다

