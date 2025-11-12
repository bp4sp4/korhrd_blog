alter table public.keyword_records
  alter column blog_id drop not null;

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conrelid = 'public.keyword_records'::regclass
      and conname = 'keyword_records_unique'
  ) then
    alter table public.keyword_records drop constraint keyword_records_unique;
  end if;
end $$;

create unique index if not exists keyword_records_keyword_unique
  on public.keyword_records (lower(keyword));

