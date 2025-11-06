-- 특이사항 컬럼 추가
ALTER TABLE blog_records 
ADD COLUMN IF NOT EXISTS special_note TEXT;

