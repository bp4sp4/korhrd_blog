-- Add topic column to keyword_records table
alter table public.keyword_records
  add column if not exists topic text;

-- Create index for faster filtering by topic
create index if not exists keyword_records_topic_idx
  on public.keyword_records (topic);

