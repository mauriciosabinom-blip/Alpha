-- =====================================================================
-- Refrão — banco de dados (Supabase)
-- Como usar: Supabase → SQL Editor → New query → cole TUDO isto → Run.
-- Pode rodar de novo sem problema (não apaga nada).
-- =====================================================================

-- ---------- Perfis: um por usuário, com @usuario único ----------
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  handle text not null unique check (handle ~ '^[a-z0-9]{2,20}$'),
  name text not null,
  created_at timestamptz not null default now()
);

-- cria o perfil automaticamente quando alguém se cadastra no app
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, handle, name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'handle', split_part(new.email, '@', 1)),
    coalesce(new.raw_user_meta_data ->> 'name', split_part(new.email, '@', 1))
  )
  on conflict (id) do nothing;
  return new;
end;
$$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ---------- Amizades (pedido → aceito) ----------
create table if not exists public.friendships (
  id bigint generated always as identity primary key,
  requester uuid not null references public.profiles (id) on delete cascade,
  addressee uuid not null references public.profiles (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted')),
  created_at timestamptz not null default now(),
  unique (requester, addressee),
  check (requester <> addressee)
);

-- ---------- Mensagens do chat (só entre amigos) ----------
create table if not exists public.messages (
  id bigint generated always as identity primary key,
  sender uuid not null references public.profiles (id) on delete cascade,
  receiver uuid not null references public.profiles (id) on delete cascade,
  body text not null check (char_length(body) between 1 and 1000),
  created_at timestamptz not null default now(),
  read_at timestamptz
);
create index if not exists messages_pair_idx on public.messages (sender, receiver, created_at);

-- ---------- Notas do karaokê (histórico e ranking) ----------
create table if not exists public.karaoke_scores (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade default auth.uid(),
  song_title text not null,
  artist text not null,
  score int not null check (score between 0 and 100),
  created_at timestamptz not null default now()
);

-- ---------- Moderação: só texto, sem links e sem palavrões ----------
-- Lista de termos bloqueados (o app tem a mesma lista em moderacao.js).
-- Para acrescentar: insert into public.blocked_words (word) values ('palavra') on conflict do nothing;
create table if not exists public.blocked_words (word text primary key);
alter table public.blocked_words enable row level security;  -- ninguém lê/edita pelo app
insert into public.blocked_words (word) values
  ('porra'),
  ('caralho'),
  ('karalho'),
  ('buceta'),
  ('boceta'),
  ('puta'),
  ('puto'),
  ('putaria'),
  ('puteiro'),
  ('merda'),
  ('bosta'),
  ('foder'),
  ('foda'),
  ('fodase'),
  ('fodasse'),
  ('fodido'),
  ('fodida'),
  ('fudido'),
  ('fudida'),
  ('cu'),
  ('cuzao'),
  ('cuzinho'),
  ('arrombado'),
  ('arrombada'),
  ('viado'),
  ('viadinho'),
  ('bicha'),
  ('corno'),
  ('corna'),
  ('otario'),
  ('otaria'),
  ('babaca'),
  ('imbecil'),
  ('retardado'),
  ('retardada'),
  ('vagabundo'),
  ('vagabunda'),
  ('piranha'),
  ('vadia'),
  ('cacete'),
  ('piroca'),
  ('xota'),
  ('xoxota'),
  ('punheta'),
  ('punheteiro'),
  ('siririca'),
  ('broxa'),
  ('desgracado'),
  ('desgracada'),
  ('filhodaputa'),
  ('fdp'),
  ('vsf'),
  ('vtnc'),
  ('tnc'),
  ('pqp'),
  ('krl'),
  ('crl'),
  ('prr'),
  ('puta que pariu'),
  ('vai se foder'),
  ('vai tomar no cu'),
  ('filho da puta'),
  ('toma no cu'),
  ('fuck'),
  ('fucking'),
  ('fucker'),
  ('motherfucker'),
  ('shit'),
  ('bullshit'),
  ('bitch'),
  ('bastard'),
  ('asshole'),
  ('dick'),
  ('cock'),
  ('pussy'),
  ('cunt'),
  ('whore'),
  ('slut'),
  ('nigger'),
  ('nigga'),
  ('faggot'),
  ('fag'),
  ('retard'),
  ('wtf'),
  ('stfu')
on conflict do nothing;

create or replace function public.squeeze(t text) returns text language sql immutable as $$
  select regexp_replace(t, '(.)\1+', '\1', 'g')
$$;
-- normaliza: minúsculas, sem acento, números/símbolos usados no lugar de letras
create or replace function public.norm_text(t text) returns text language sql immutable as $$
  select translate(lower(t), 'áàâãäéèêëíìîïóòôõöúùûüç0@41357$', 'aaaaaeeeeiiiiooooouuuucoaaiests')
$$;
create or replace function public.has_blocked_words(t text) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare n text := norm_text(coalesce(t, '')); glued text;
begin
  -- palavra inteira (também com letras repetidas: "porrrra")
  if exists (
    select 1 from regexp_split_to_table(n, '[^a-z]+') as tok
    join blocked_words b on position(' ' in b.word) = 0
      and (tok = b.word or squeeze(tok) = squeeze(b.word))
  ) then return true; end if;
  -- letras separadas: "f u c k", "p.o.r.r.a"
  if exists (
    select 1 from regexp_matches(n, '(?:^|[^a-z])([a-z](?:[^a-z]+[a-z](?![a-z])){2,})', 'g') as m
    join blocked_words b on squeeze(regexp_replace(m[1], '[^a-z]', '', 'g')) = squeeze(b.word)
  ) then return true; end if;
  -- expressões ("vai se foder", "filho da puta")
  glued := squeeze(regexp_replace(n, '[^a-z]', '', 'g'));
  return exists (
    select 1 from blocked_words b
    where position(' ' in b.word) > 0 and position(squeeze(replace(b.word, ' ', '')) in glued) > 0
  );
end;
$$;
create or replace function public.has_link(t text) returns boolean language sql immutable as $$
  select coalesce(t, '') ~* '(https?://|www\.|\m[a-z0-9-]+\.(com|br|net|org|io|app|me|ly|tv)\M)'
$$;

create or replace function public.moderate_message() returns trigger language plpgsql as $$
begin
  if has_link(new.body) then raise exception 'Links não são permitidos no chat.' using errcode = 'P0001', hint = 'link'; end if;
  if has_blocked_words(new.body) then raise exception 'Mensagem bloqueada: linguagem imprópria.' using errcode = 'P0001', hint = 'palavrao'; end if;
  return new;
end;
$$;
drop trigger if exists messages_moderation on public.messages;
create trigger messages_moderation before insert or update of body on public.messages
  for each row execute procedure public.moderate_message();

create or replace function public.moderate_profile() returns trigger language plpgsql as $$
begin
  if has_blocked_words(new.name) or has_blocked_words(new.handle) then
    raise exception 'Nome não permitido.' using errcode = 'P0001', hint = 'palavrao';
  end if;
  return new;
end;
$$;
drop trigger if exists profiles_moderation on public.profiles;
create trigger profiles_moderation before insert or update on public.profiles
  for each row execute procedure public.moderate_profile();

-- ---------- Segurança: cada um só vê/altera o que pode ----------
alter table public.profiles enable row level security;
alter table public.friendships enable row level security;
alter table public.messages enable row level security;
alter table public.karaoke_scores enable row level security;

drop policy if exists "perfis visiveis para usuarios" on public.profiles;
create policy "perfis visiveis para usuarios" on public.profiles
  for select to authenticated using (true);
drop policy if exists "editar o proprio perfil" on public.profiles;
create policy "editar o proprio perfil" on public.profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists "ver minhas amizades" on public.friendships;
create policy "ver minhas amizades" on public.friendships
  for select to authenticated using (auth.uid() in (requester, addressee));
drop policy if exists "pedir amizade" on public.friendships;
create policy "pedir amizade" on public.friendships
  for insert to authenticated with check (requester = auth.uid() and status = 'pending');
drop policy if exists "aceitar amizade" on public.friendships;
create policy "aceitar amizade" on public.friendships
  for update to authenticated using (addressee = auth.uid()) with check (addressee = auth.uid());
drop policy if exists "desfazer amizade" on public.friendships;
create policy "desfazer amizade" on public.friendships
  for delete to authenticated using (auth.uid() in (requester, addressee));

drop policy if exists "ver minhas mensagens" on public.messages;
create policy "ver minhas mensagens" on public.messages
  for select to authenticated using (auth.uid() in (sender, receiver));
drop policy if exists "mandar mensagem para amigo" on public.messages;
create policy "mandar mensagem para amigo" on public.messages
  for insert to authenticated with check (
    messages.sender = auth.uid()
    and exists (
      select 1 from public.friendships f
      where f.status = 'accepted'
        and ((f.requester = messages.sender and f.addressee = messages.receiver)
          or (f.requester = messages.receiver and f.addressee = messages.sender))
    )
  );
drop policy if exists "marcar como lida" on public.messages;
create policy "marcar como lida" on public.messages
  for update to authenticated using (receiver = auth.uid()) with check (receiver = auth.uid());

drop policy if exists "ver notas" on public.karaoke_scores;
create policy "ver notas" on public.karaoke_scores
  for select to authenticated using (true);
drop policy if exists "salvar minha nota" on public.karaoke_scores;
create policy "salvar minha nota" on public.karaoke_scores
  for insert to authenticated with check (user_id = auth.uid());

-- ---------- Tempo real (chat e pedidos de amizade chegam na hora) ----------
do $$
begin
  begin alter publication supabase_realtime add table public.messages; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.friendships; exception when duplicate_object then null; end;
end $$;

-- ---------- Só os campos certos podem ser alterados ----------
-- mensagem: só "lida em"; amizade: só o status (aceitar); perfil: só o nome
revoke update on public.messages, public.friendships, public.profiles from anon, authenticated;
grant update (read_at) on public.messages to authenticated;
grant update (status) on public.friendships to authenticated;
grant update (name) on public.profiles to authenticated;
