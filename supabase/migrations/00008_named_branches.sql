-- The business starts with two active branches. Keep the old third branch and
-- its ledger rows for historical integrity, but retire it from day-to-day use.
update public.branches
set name = case short_code
      when 'BR1' then 'العرب'
      when 'BR2' then 'زرزاره'
      else name
    end,
    is_active = case when short_code = 'BR3' then false else is_active end,
    updated_at = now()
where short_code in ('BR1', 'BR2', 'BR3');

-- Keep any staff previously assigned to the retired demo branch operational.
update public.profiles
set branch_id = (select b.id from public.branches b where b.short_code = 'BR2' limit 1),
    updated_at = now()
where branch_id = (select b.id from public.branches where short_code = 'BR3' limit 1)
  and role <> 'OWNER'
  and exists (select 1 from public.branches where short_code = 'BR2');

drop policy if exists branches_select on public.branches;
create policy branches_select on public.branches
  for select to authenticated
  using (
    company_id = public.current_company_id()
    and public.is_active_user()
    and (public.is_owner() or is_active)
  );

drop policy if exists branch_inventory_select on public.branch_inventory;
create policy branch_inventory_select on public.branch_inventory
  for select to authenticated
  using (public.is_active_user() and exists (
    select 1 from public.branches b
    where b.id = branch_id
      and b.company_id = public.current_company_id()
      and b.is_active
  ));
