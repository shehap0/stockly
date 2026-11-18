-- Stockly migration 00006: Realtime change feed
-- Events are used by clients ONLY to invalidate query caches; Postgres
-- remains the source of truth. RLS-aware delivery keeps events scoped.

do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
end;
$$;

alter publication supabase_realtime add table public.products;
alter publication supabase_realtime add table public.branch_inventory;
alter publication supabase_realtime add table public.sales;
