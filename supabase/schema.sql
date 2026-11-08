-- Kör detta en gång i Supabase: SQL Editor → New query → klistra in → Run.
-- En rad per användare och dokument (inställningar, dagar per månad, loggar per månad).
create table if not exists public.user_docs (
  user_id    uuid not null references auth.users(id) on delete cascade,
  doc        text not null,
  body       jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (user_id, doc)
);

alter table public.user_docs enable row level security;

-- Varje användare kan bara läsa och skriva sina egna rader.
drop policy if exists "egna rader läsa" on public.user_docs;
drop policy if exists "egna rader skapa" on public.user_docs;
drop policy if exists "egna rader ändra" on public.user_docs;
drop policy if exists "egna rader ta bort" on public.user_docs;
create policy "egna rader läsa"     on public.user_docs for select using (auth.uid() = user_id);
create policy "egna rader skapa"    on public.user_docs for insert with check (auth.uid() = user_id);
create policy "egna rader ändra"    on public.user_docs for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "egna rader ta bort"  on public.user_docs for delete using (auth.uid() = user_id);
