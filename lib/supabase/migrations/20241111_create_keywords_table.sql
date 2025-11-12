create table if not exists public.keyword_records (
  id uuid default gen_random_uuid() primary key,
  keyword text not null,
  blog_id text not null,
  memo text,
  created_at timestamptz default now()
);

alter table public.keyword_records
add constraint keyword_records_unique unique (keyword, blog_id);

