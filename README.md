# 한평생블로그

블로그 기록을 관리하는 웹 애플리케이션입니다.

## 주요 기능

- 블로그 기록 관리 (등록, 조회, 필터링)
- 사용자 인증 및 권한 관리
- 관리자 페이지 (계정 생성, 기록 수정/삭제)

## 기술 스택

- **프레임워크**: Next.js 14 (App Router)
- **언어**: TypeScript
- **스타일링**: Tailwind CSS, CSS Modules
- **데이터베이스**: Supabase (PostgreSQL)
- **인증**: Supabase Auth

## 시작하기

### 필수 요구사항

- Node.js 18 이상
- npm 또는 yarn
- Supabase 프로젝트

### 설치

1. 저장소 클론:
```bash
git clone https://github.com/bp4sp4/korhrd_blog.git
cd korhrd_blog
```

2. 의존성 설치:
```bash
npm install
```

3. 환경 변수 설정:
`.env.local` 파일을 생성하고 다음 변수들을 설정하세요:

```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
```

4. Supabase 데이터베이스 설정:
- `supabase-setup.sql` 파일의 SQL 쿼리를 Supabase SQL Editor에서 실행하세요.

5. 개발 서버 실행:
```bash
npm run dev
```

브라우저에서 [http://localhost:3000](http://localhost:3000)을 열어 확인하세요.

## 프로젝트 구조

```
korhrd_blog/
├── app/                    # Next.js App Router 페이지
│   ├── admin/             # 관리자 페이지
│   ├── api/               # API 라우트
│   ├── login/             # 로그인 페이지
│   └── page.tsx           # 메인 페이지
├── components/            # React 컴포넌트
│   ├── Header/            # 헤더 컴포넌트
│   ├── Sidebar/           # 사이드바 컴포넌트
│   ├── Table/             # 테이블 컴포넌트
│   └── ...
├── lib/                   # 유틸리티 및 설정
│   └── supabase/          # Supabase 클라이언트
├── contexts/              # React Context
└── public/                # 정적 파일
```

## 기능 설명

### 블로그 기록 관리
- 블로그 기록 추가, 조회, 필터링
- ID, 분야, 키워드, 순위, 검색량, 제목, 링크, 작성자 정보 관리

### 사용자 인증
- 이메일/비밀번호 로그인
- 세션 관리

### 관리자 기능
- 계정 생성
- 블로그 기록 수정/삭제
- 사용자 목록 조회

## 라이센스

이 프로젝트는 개인 프로젝트입니다.
