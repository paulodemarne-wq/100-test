-- Mise à jour Lockin+ : offrir Lockin+ avec un lien (comme Snapchat+), et « Tu as reçu Lockin+ » dans l'app.
-- Supabase → SQL Editor → + → colle tout → Run. On peut le relancer sans risque.
-- ═════════════════════════════════════════════════════════════════════════════
-- v20: Lockin+ gifts by link (like Snapchat+), and "you received Lockin+" in the app.
-- A subscriber makes a gift link (one of their 5 trials); whoever opens it first and never
-- had Lockin+ gets 7 days. Each received period is shown once in the app (plus_grants.seen_at).
-- ═════════════════════════════════════════════════════════════════════════════
alter table public.plus_grants add column if not exists seen_at timestamptz;

create table if not exists public.plus_gifts (
  code text primary key,
  giver uuid not null references public.profiles (id) on delete cascade,
  days int not null default 7 check (days between 1 and 31),
  claimed_by uuid references public.profiles (id) on delete set null,
  claimed_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists plus_gifts_giver on public.plus_gifts (giver);
alter table public.plus_gifts enable row level security;
drop policy if exists "see own gifts" on public.plus_gifts;
create policy "see own gifts" on public.plus_gifts
  for select to authenticated using (giver = auth.uid());
revoke insert, update, delete on public.plus_gifts from anon, authenticated;

-- 5 trials: the ones already taken plus the links still waiting.
create or replace function public.trials_left(u uuid)
returns int language sql stable security definer set search_path = public as $$
  select case
    when not public.is_premium(u) then 0
    when not (exists (select 1 from public.profiles where id = u and featured)
              or exists (select 1 from public.plus_grants where user_id = u and source = 'paid')) then 0
    else greatest(0, 5
      - (select count(*)::int from public.plus_grants where granted_by = u and source = 'trial')
      - (select count(*)::int from public.plus_gifts where giver = u and claimed_by is null))
  end;
$$;

-- My gift link: the one still waiting if there is one (sharing twice doesn't use 2 trials), else a new one.
create or replace function public.create_gift_link()
returns text language plpgsql security definer set search_path = public as $$
declare
  me public.profiles;
  c text;
begin
  select * into me from public.profiles where id = auth.uid() for update;
  if me.id is null then raise exception 'Non connecté'; end if;
  select code into c from public.plus_gifts where giver = me.id and claimed_by is null order by created_at limit 1;
  if c is not null then return c; end if;
  if public.trials_left(me.id) <= 0 then raise exception 'Plus d''essai à offrir' using errcode = 'P0001'; end if;
  loop
    c := upper(substr(md5(gen_random_uuid()::text), 1, 8));
    exit when not exists (select 1 from public.plus_gifts where code = c);
  end loop;
  insert into public.plus_gifts (code, giver) values (c, me.id);
  return c;
end $$;
revoke execute on function public.create_gift_link() from public, anon;
grant execute on function public.create_gift_link() to authenticated;

-- What a gift link shows before it is taken.
create or replace function public.gift_info(code text)
returns table (giver_name text, giver_avatar text, days int, claimed boolean, mine boolean)
language sql stable security definer set search_path = public as $$
  select p.display_name, p.avatar_url, g.days, g.claimed_by is not null, g.giver = auth.uid()
  from public.plus_gifts g join public.profiles p on p.id = g.giver
  where g.code = upper(trim(gift_info.code));
$$;
revoke execute on function public.gift_info(text) from public, anon;
grant execute on function public.gift_info(text) to authenticated;

-- Takes a gift: only once, not your own, and only if you never had Lockin+.
create or replace function public.claim_gift(code text)
returns text language plpgsql security definer set search_path = public as $$
declare
  me public.profiles;
  g public.plus_gifts;
  giver_name text;
begin
  select * into me from public.profiles where id = auth.uid() for update;
  if me.id is null then raise exception 'Non connecté'; end if;
  select * into g from public.plus_gifts where plus_gifts.code = upper(trim(claim_gift.code)) for update;
  if g.code is null then raise exception 'Lien cadeau inconnu' using errcode = 'P0001'; end if;
  if g.giver = me.id then raise exception 'C''est ton propre cadeau 😅 Envoie-le à un pote.' using errcode = 'P0001'; end if;
  if g.claimed_by is not null then raise exception 'Ce cadeau a déjà été récupéré' using errcode = 'P0001'; end if;
  if me.featured or me.premium_until is not null or exists (select 1 from public.plus_grants where user_id = me.id) then
    raise exception 'Le cadeau, c''est pour ceux qui n''ont jamais eu Lockin+' using errcode = 'P0001';
  end if;
  update public.plus_gifts set claimed_by = me.id, claimed_at = now() where plus_gifts.code = g.code;
  perform public.grant_plus(me.id, g.days, 'trial', g.giver);
  -- Already shown on the gift screen.
  update public.plus_grants set seen_at = now() where user_id = me.id and seen_at is null;
  select display_name into giver_name from public.profiles where id = g.giver;
  perform public.send_push(array[g.giver], 'Cadeau récupéré 🎁', me.display_name || ' a pris ton essai Lockin+.', '{"type":"plus"}');
  return giver_name;
end $$;
revoke execute on function public.claim_gift(text) from public, anon;
grant execute on function public.claim_gift(text) to authenticated;

-- Lockin+ received and not shown yet (only while it still runs).
create or replace function public.unseen_plus()
returns table (source text, days int, giver_name text)
language sql stable security definer set search_path = public as $$
  select g.source, g.days, p.display_name
  from public.plus_grants g left join public.profiles p on p.id = g.granted_by
  where g.user_id = auth.uid() and g.seen_at is null and g.source <> 'paid'
    and g.created_at > now() - interval '30 days' and public.is_premium(auth.uid())
  order by g.created_at;
$$;
revoke execute on function public.unseen_plus() from public, anon;
grant execute on function public.unseen_plus() to authenticated;

create or replace function public.mark_plus_seen()
returns void language sql security definer set search_path = public as $$
  update public.plus_grants set seen_at = now() where user_id = auth.uid() and seen_at is null;
$$;
revoke execute on function public.mark_plus_seen() from public, anon;
grant execute on function public.mark_plus_seen() to authenticated;

-- L'app voit tout de suite les nouvelles colonnes (badge, titre…).
notify pgrst, 'reload schema';
