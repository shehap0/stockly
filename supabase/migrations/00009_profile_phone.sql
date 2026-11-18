alter table public.profiles add column if not exists phone text;

-- A phone number identifies one staff account within this company.
create unique index if not exists profiles_company_phone_unique
  on public.profiles (company_id, phone)
  where phone is not null;

-- Backfill numbers already verified by Supabase Auth, when available.
update public.profiles p
set phone = u.phone
from auth.users u
where u.id = p.id
  and u.phone is not null
  and p.phone is null;
