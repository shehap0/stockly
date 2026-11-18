-- Phone numbers are staff contact data. Only owners can list company profiles;
-- branch staff can read their own profile for the application shell.
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles
  for select to authenticated
  using (
    company_id = public.current_company_id()
    and public.is_active_user()
    and (public.is_owner() or id = auth.uid())
  );
