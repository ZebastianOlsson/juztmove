-- ============================================================================
-- Den lilla kretsen – tabeller, regler och funktioner.
--
-- SÅ KÖR DU DEN
--   1. Öppna projektet i Supabase → SQL Editor → New query.
--   2. Klistra in hela den här filen och tryck Run.
--   3. Filen går att köra flera gånger. Den rör inte tabellen user_docs.
--
-- SÅ SER DU ATT DET GICK BRA
--   - Längst ner i resultatet ska det stå "Success. No rows returned".
--   - Under Table Editor finns nu tabellerna kretsar, krets_medlem, krets_status,
--     krets_pepp och krets_delning, alla märkta "RLS enabled".
--   - Under Database → Functions finns skapa_krets, ga_med, krets_namn_for_kod,
--     krets_idag, ar_medlem, samma_krets, delar och krets_rensa.
--   - Kör gärna den här raden i en ny query som kontroll (ska ge 5):
--       select count(*) from pg_tables where schemaname='public' and tablename like 'krets%' and rowsecurity;
--
-- Vad som delas: bara om dagen är hel (ja/nej) för var och en, samt peppningar.
-- Inga mängder, inga loggar, inga jämförelser.
--
-- VEM KAN LÄSA OCH SKRIVA VAD (inloggade; anonyma kommer inte åt något)
--   kretsar        läsa: medlemmar i kretsen.  skriva: ingen direkt – bara via skapa_krets(); tas bort av trigger när den blir tom.
--   krets_medlem   läsa: medlemmar i samma krets.  skriva: gå med via ga_med()/skapa_krets(), ändra eget visningsnamn, ta bort egen rad (lämna).
--   krets_status   läsa: bara ägaren.  skriva: bara egna rader, datum kring idag; ta bort egna rader.
--                  De andras läge (hel/tom/neutral) kommer bara via krets_idag().
--   krets_pepp     läsa: skickade och mottagna.  skriva: i eget namn till någon i samma krets, en per dag och mottagare;
--                  ta bort skickade och mottagna (rensning av gamla).
--   krets_delning  läsa och skriva: bara ägaren.
--   Funktioner     skapa_krets, ga_med, krets_namn_for_kod, krets_idag: inloggade.
--                  ar_medlem, samma_krets: inloggade (behövs av policyerna).  delar, krets_rensa: ingen klient.
-- ============================================================================

-- ---------- Tabeller ----------

create table if not exists public.kretsar (
  id         uuid primary key default gen_random_uuid(),
  namn       text not null check (char_length(namn) between 1 and 40),
  kod        text not null unique,
  -- Den som skapat kretsen. Raderas kontot står kretsen kvar för de andra (set null);
  -- medlemskapet försvinner via krets_medlem, och en tom krets tas bort av triggern nedan.
  skapad_av  uuid references auth.users(id) on delete set null,
  skapad     timestamptz not null default now()
);

create table if not exists public.krets_medlem (
  krets        uuid not null references public.kretsar(id) on delete cascade,
  anvandare    uuid not null references auth.users(id) on delete cascade,
  visningsnamn text not null check (char_length(visningsnamn) between 1 and 30),
  gick_med     timestamptz not null default now(),
  primary key (krets, anvandare)
);
create index if not exists krets_medlem_anvandare on public.krets_medlem(anvandare);

create table if not exists public.krets_status (
  anvandare  uuid not null references auth.users(id) on delete cascade,
  datum      date not null,
  hel        boolean not null default false,
  -- neutral = "Inte på topp": pricken visas varken fylld eller tom.
  neutral    boolean not null default false,
  uppdaterad timestamptz not null default now(),
  primary key (anvandare, datum)
);

create table if not exists public.krets_pepp (
  fran   uuid not null default auth.uid() references auth.users(id) on delete cascade,
  till   uuid not null references auth.users(id) on delete cascade,
  datum  date not null,
  skapad timestamptz not null default now(),
  primary key (fran, till, datum),        -- högst en peppning per avsändare, mottagare och dag
  check (fran <> till)
);
create index if not exists krets_pepp_till on public.krets_pepp(till, datum);

-- Pausad delning ligger i en egen tabell som bara ägaren själv kan läsa,
-- så att de andra i kretsen inte kan se att någon pausat.
create table if not exists public.krets_delning (
  anvandare uuid primary key references auth.users(id) on delete cascade,
  pausad    boolean not null default false
);

alter table public.kretsar       enable row level security;
alter table public.krets_medlem  enable row level security;
alter table public.krets_status  enable row level security;
alter table public.krets_pepp    enable row level security;
alter table public.krets_delning enable row level security;

-- ---------- Hjälpfunktioner (security definer, så att policyerna inte blir rekursiva) ----------

-- Är jag medlem i kretsen k?
create or replace function public.ar_medlem(k uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from krets_medlem where krets = k and anvandare = auth.uid());
$$;

-- Är användaren u med i någon krets där jag också är med?
create or replace function public.samma_krets(u uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from krets_medlem a join krets_medlem b on a.krets = b.krets
    where a.anvandare = auth.uid() and b.anvandare = u);
$$;

-- Delar användaren u sin status (inte pausad)? Används bara inne i krets_idag() – inte körbar för klienter.
create or replace function public.delar(u uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select not exists (select 1 from krets_delning where anvandare = u and pausad);
$$;

-- ---------- Regler (RLS) ----------

-- kretsar: läsa bara kretsar man är med i. Skapas bara via skapa_krets(). Ingen kan ändra eller ta bort direkt.
drop policy if exists "krets läsa" on public.kretsar;
create policy "krets läsa" on public.kretsar for select to authenticated using (public.ar_medlem(id));

-- krets_medlem: läsa medlemmar i de egna kretsarna. Ändra bara sitt eget visningsnamn. Lämna = ta bort sin egen rad.
-- Gå med sker bara via ga_med() eller skapa_krets() (ingen insert-regel).
drop policy if exists "medlem läsa" on public.krets_medlem;
drop policy if exists "medlem ändra eget namn" on public.krets_medlem;
drop policy if exists "medlem lämna" on public.krets_medlem;
create policy "medlem läsa" on public.krets_medlem for select to authenticated using (public.ar_medlem(krets));
create policy "medlem ändra eget namn" on public.krets_medlem for update to authenticated using (anvandare = auth.uid()) with check (anvandare = auth.uid());
create policy "medlem lämna" on public.krets_medlem for delete to authenticated using (anvandare = auth.uid());

-- krets_status: bara ägaren läser sina rader. De andras läge kommer bara som hel/tom/neutral via krets_idag().
-- Skriva bara sin egen, och bara för idag och igår (med en dags marginal för tidszoner). Ta bort egna rader (appen rensar äldre än två dagar).
drop policy if exists "status läsa" on public.krets_status;
drop policy if exists "status skapa" on public.krets_status;
drop policy if exists "status ändra" on public.krets_status;
drop policy if exists "status ta bort" on public.krets_status;
create policy "status läsa" on public.krets_status for select to authenticated
  using (anvandare = auth.uid());
create policy "status skapa" on public.krets_status for insert to authenticated
  with check (anvandare = auth.uid() and datum between current_date - 2 and current_date + 1);
create policy "status ändra" on public.krets_status for update to authenticated
  using (anvandare = auth.uid())
  with check (anvandare = auth.uid() and datum between current_date - 2 and current_date + 1);
create policy "status ta bort" on public.krets_status for delete to authenticated using (anvandare = auth.uid());

-- krets_pepp: läsa de man skickat och de man fått. Skicka bara i eget namn, till någon i samma krets, för idag.
-- Ta bort de man skickat eller fått (appen rensar äldre än två dagar).
drop policy if exists "pepp läsa" on public.krets_pepp;
drop policy if exists "pepp skicka" on public.krets_pepp;
drop policy if exists "pepp ta bort" on public.krets_pepp;
create policy "pepp läsa" on public.krets_pepp for select to authenticated using (fran = auth.uid() or till = auth.uid());
create policy "pepp skicka" on public.krets_pepp for insert to authenticated
  with check (fran = auth.uid() and till <> auth.uid() and public.samma_krets(till) and datum between current_date - 1 and current_date + 1);
create policy "pepp ta bort" on public.krets_pepp for delete to authenticated using (fran = auth.uid() or till = auth.uid());

-- krets_delning: bara ägaren läser och skriver.
drop policy if exists "delning egen läsa" on public.krets_delning;
drop policy if exists "delning egen skapa" on public.krets_delning;
drop policy if exists "delning egen ändra" on public.krets_delning;
create policy "delning egen läsa" on public.krets_delning for select to authenticated using (anvandare = auth.uid());
create policy "delning egen skapa" on public.krets_delning for insert to authenticated with check (anvandare = auth.uid());
create policy "delning egen ändra" on public.krets_delning for update to authenticated using (anvandare = auth.uid()) with check (anvandare = auth.uid());

-- Rättigheter: inget för anonyma. På krets_medlem får man bara uppdatera kolumnen visningsnamn
-- (så att ingen kan flytta sin rad till en annan krets).
revoke all on public.kretsar, public.krets_medlem, public.krets_status, public.krets_pepp, public.krets_delning from anon;
revoke insert, update, delete on public.kretsar from authenticated;
grant select on public.kretsar to authenticated;
revoke insert, update on public.krets_medlem from authenticated;
grant select, delete on public.krets_medlem to authenticated;
grant update (visningsnamn) on public.krets_medlem to authenticated;
grant select, insert, update, delete on public.krets_status to authenticated;
grant select, insert, delete on public.krets_pepp to authenticated;
grant select, insert, update on public.krets_delning to authenticated;

-- ---------- En tom krets tas bort när sista medlemmen lämnat ----------

create or replace function public.krets_rensa() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  delete from kretsar k where k.id = old.krets and not exists (select 1 from krets_medlem m where m.krets = old.krets);
  return old;
end $$;
drop trigger if exists krets_rensa on public.krets_medlem;
create trigger krets_rensa after delete on public.krets_medlem for each row execute function public.krets_rensa();

-- ---------- Funktioner som appen anropar ----------

-- Skapa en krets och gå med själv. Högst 3 kretsar per användare.
create or replace function public.skapa_krets(p_namn text, p_visningsnamn text) returns json
language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_kod text; v_n int;
begin
  if auth.uid() is null then raise exception 'inte inloggad'; end if;
  select count(*) into v_n from krets_medlem where anvandare = auth.uid();
  if v_n >= 3 then raise exception 'högst 3 kretsar'; end if;
  loop
    v_kod := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
    exit when not exists (select 1 from kretsar where kod = v_kod);
  end loop;
  insert into kretsar(namn, kod, skapad_av) values (left(trim(p_namn), 40), v_kod, auth.uid()) returning id into v_id;
  insert into krets_medlem(krets, anvandare, visningsnamn) values (v_id, auth.uid(), left(trim(p_visningsnamn), 30));
  return json_build_object('id', v_id, 'namn', left(trim(p_namn), 40), 'kod', v_kod);
end $$;

-- Namnet på kretsen för en kod, så att appen kan fråga "Gå med i <namn>?". Visar inget annat.
create or replace function public.krets_namn_for_kod(p_kod text) returns json
language sql stable security definer set search_path = public as $$
  select case when auth.uid() is null then null
    else (select json_build_object('namn', namn, 'medlem', exists(select 1 from krets_medlem m where m.krets = k.id and m.anvandare = auth.uid()))
          from kretsar k where k.kod = upper(trim(p_kod))) end;
$$;

-- Gå med via inbjudningskod. Högst 6 medlemmar per krets och högst 3 kretsar per användare.
create or replace function public.ga_med(p_kod text, p_visningsnamn text) returns json
language plpgsql security definer set search_path = public as $$
declare v_k kretsar%rowtype; v_n int;
begin
  if auth.uid() is null then raise exception 'inte inloggad'; end if;
  select * into v_k from kretsar where kod = upper(trim(p_kod)) for update;
  if not found then raise exception 'okänd kod'; end if;
  if exists (select 1 from krets_medlem where krets = v_k.id and anvandare = auth.uid()) then
    return json_build_object('id', v_k.id, 'namn', v_k.namn, 'redan', true);
  end if;
  select count(*) into v_n from krets_medlem where krets = v_k.id;
  if v_n >= 6 then raise exception 'kretsen är full'; end if;
  select count(*) into v_n from krets_medlem where anvandare = auth.uid();
  if v_n >= 3 then raise exception 'högst 3 kretsar'; end if;
  insert into krets_medlem(krets, anvandare, visningsnamn) values (v_k.id, auth.uid(), left(trim(p_visningsnamn), 30));
  return json_build_object('id', v_k.id, 'namn', v_k.namn);
end $$;

-- Dagens läge i mina kretsar: en rad per medlem med 'hel', 'tom' eller 'neutral'.
-- Pausad delning och "Inte på topp" blir 'neutral' – det går inte att se vilket det är.
create or replace function public.krets_idag(p_dag date) returns table(krets uuid, namn text, kod text, anvandare uuid, visningsnamn text, ar_jag boolean, lage text)
language sql stable security definer set search_path = public as $$
  select k.id, k.namn, k.kod, m.anvandare, m.visningsnamn, m.anvandare = auth.uid(),
    case when not public.delar(m.anvandare) or coalesce(s.neutral, false) then 'neutral'
         when coalesce(s.hel, false) then 'hel' else 'tom' end
  from krets_medlem jag
  join kretsar k on k.id = jag.krets
  join krets_medlem m on m.krets = k.id
  left join krets_status s on s.anvandare = m.anvandare and s.datum = p_dag
  where jag.anvandare = auth.uid() and p_dag between current_date - 2 and current_date + 1
  order by k.skapad, m.gick_med;
$$;

revoke all on function public.skapa_krets(text, text), public.ga_med(text, text), public.krets_namn_for_kod(text), public.krets_idag(date) from anon, public;
grant execute on function public.skapa_krets(text, text), public.ga_med(text, text), public.krets_namn_for_kod(text), public.krets_idag(date) to authenticated;
-- Hjälpfunktionerna: ar_medlem och samma_krets behövs av policyerna och får köras av inloggade, inte av anon/public.
-- delar och triggerfunktionen krets_rensa är inte körbara för någon klient.
revoke all on function public.ar_medlem(uuid), public.samma_krets(uuid) from public, anon;
grant execute on function public.ar_medlem(uuid), public.samma_krets(uuid) to authenticated;
revoke all on function public.delar(uuid) from public, anon, authenticated;
revoke all on function public.krets_rensa() from public, anon, authenticated;
