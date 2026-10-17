-- OAC pre-order: push subscription registration.
-- A browser's push endpoint is globally unique. If someone else signed in on the same phone
-- earlier, a plain insert would fail on the unique endpoint, so registration is an upsert that
-- moves the endpoint to whoever is signed in now. Errors: INVALID_SUBSCRIPTION, FORBIDDEN.

create function public.upsert_push_subscription(p_endpoint text, p_p256dh text, p_auth text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null or not exists (select 1 from public.profiles p where p.id = v_uid and p.is_active) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if coalesce(btrim(p_endpoint), '') = '' or coalesce(btrim(p_p256dh), '') = ''
     or coalesce(btrim(p_auth), '') = '' or length(p_endpoint) > 2048 then
    raise exception 'INVALID_SUBSCRIPTION';
  end if;

  insert into public.push_subscriptions (user_id, endpoint, p256dh, auth)
  values (v_uid, p_endpoint, p_p256dh, p_auth)
  on conflict (endpoint) do update
    set user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth;
end;
$$;

revoke all on function public.upsert_push_subscription(text, text, text) from public, anon;
grant execute on function public.upsert_push_subscription(text, text, text) to authenticated;
