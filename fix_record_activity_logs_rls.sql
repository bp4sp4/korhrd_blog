-- record_activity_logs RLS 정책 수정
-- Supabase SQL Editor에서 실행하세요

-- 1. 기존 SELECT 정책 삭제
DROP POLICY IF EXISTS allow_activity_logs_select_for_admins ON record_activity_logs;

-- 2. owner, super_admin, admin 모두 허용하는 새로운 SELECT 정책 생성
CREATE POLICY allow_activity_logs_select_for_admins
ON record_activity_logs
FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM profiles
    WHERE profiles.id = auth.uid()
      AND profiles.role IN ('owner', 'super_admin', 'admin')
  )
);

-- 3. 정책 확인
SELECT 
  policyname,
  cmd,
  qual
FROM pg_policies
WHERE schemaname = 'public' 
  AND tablename = 'record_activity_logs'
  AND cmd = 'SELECT';

