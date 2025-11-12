-- Add category column to keyword_records table
alter table public.keyword_records
  add column if not exists category text;

-- Create index for faster filtering by category
create index if not exists keyword_records_category_idx
  on public.keyword_records (category);

