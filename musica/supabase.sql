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

-- ---------- Acesso do app às tabelas (funciona mesmo com "Grant API access" desmarcado) ----------
grant usage on schema public to authenticated;
grant select on public.profiles to authenticated;
grant select, insert, delete on public.friendships to authenticated;
grant select, insert on public.messages to authenticated;
grant select, insert on public.karaoke_scores to authenticated;
grant usage, select on all sequences in schema public to authenticated;
grant execute on function public.has_blocked_words(text), public.has_link(text), public.squeeze(text), public.norm_text(text) to authenticated;
-- visitantes sem login não acessam nada; a lista de palavras bloqueadas fica invisível para todos
revoke all on public.profiles, public.friendships, public.messages, public.karaoke_scores, public.blocked_words from anon;
revoke all on public.blocked_words from authenticated;

-- ---------- E-mail opcional (recuperar senha) mantendo o login pelo @usuario ----------
-- Quem vincula um e-mail real passa a ter ele como e-mail da conta. Para continuar entrando
-- pelo @usuario, esta função devolve o e-mail SÓ para quem acerta a senha (com limite de tentativas).
create table if not exists public.login_attempts (
  id bigint generated always as identity primary key,
  handle text not null,
  at timestamptz not null default now()
);
create index if not exists login_attempts_idx on public.login_attempts (handle, at);
alter table public.login_attempts enable row level security;
revoke all on public.login_attempts from anon, authenticated;

create or replace function public.login_email(p_handle text, p_password text)
returns text language plpgsql security definer set search_path = public, extensions as $$
declare v_email text; v_hash text; v_fails int; h text := lower(coalesce(p_handle, ''));
begin
  select count(*) into v_fails from login_attempts where handle = h and at > now() - interval '15 minutes';
  if v_fails >= 10 then
    raise exception 'Muitas tentativas. Espere 15 minutos e tente de novo.' using errcode = 'P0001';
  end if;
  select a.email, a.encrypted_password into v_email, v_hash
    from profiles p join auth.users a on a.id = p.id where p.handle = h;
  if v_hash is null or extensions.crypt(coalesce(p_password, ''), v_hash) <> v_hash then
    insert into login_attempts (handle) values (h);
    return null;
  end if;
  delete from login_attempts where handle = h;
  return v_email;
end;
$$;
revoke all on function public.login_email(text, text) from public;
grant execute on function public.login_email(text, text) to anon, authenticated;

-- ---------- Notificações (push) de mensagem nova ----------
-- Cada aparelho que ativa as notificações fica registrado aqui (só o dono vê os seus).
create table if not exists public.push_subscriptions (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);
alter table public.push_subscriptions enable row level security;
revoke all on public.push_subscriptions from anon, authenticated;
grant select on public.push_subscriptions to authenticated;
drop policy if exists "ver meus aparelhos" on public.push_subscriptions;
create policy "ver meus aparelhos" on public.push_subscriptions
  for select to authenticated using (user_id = auth.uid());

-- registrar / remover o aparelho (o mesmo aparelho pode trocar de conta)
create or replace function public.save_push_subscription(p_endpoint text, p_p256dh text, p_auth text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'precisa estar logado'; end if;
  delete from push_subscriptions where endpoint = p_endpoint;
  insert into push_subscriptions (user_id, endpoint, p256dh, auth) values (auth.uid(), p_endpoint, p_p256dh, p_auth);
end;
$$;
create or replace function public.delete_push_subscription(p_endpoint text)
returns void language sql security definer set search_path = public as $$
  delete from push_subscriptions where endpoint = p_endpoint and user_id = auth.uid();
$$;
revoke all on function public.save_push_subscription(text, text, text), public.delete_push_subscription(text) from public;
grant execute on function public.save_push_subscription(text, text, text), public.delete_push_subscription(text) to authenticated;

-- segredos do servidor (ninguém do app acessa): senha interna do gatilho e chaves das notificações
create table if not exists public.app_secrets (key text primary key, value text not null);
alter table public.app_secrets enable row level security;
revoke all on public.app_secrets from anon, authenticated;
insert into public.app_secrets (key, value)
  values ('push_secret', replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''))
  on conflict (key) do nothing;

-- a cada mensagem nova, avisa a função "notify" (que manda a notificação para o celular)
create extension if not exists pg_net with schema extensions;
create or replace function public.notify_new_message() returns trigger
language plpgsql security definer set search_path = public, extensions as $$
declare s text;
begin
  select value into s from app_secrets where key = 'push_secret';
  perform net.http_post(
    url := 'https://khpterapkxaispzorsav.supabase.co/functions/v1/notify',
    body := jsonb_build_object('sender', new.sender, 'receiver', new.receiver, 'body', left(new.body, 160)),
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-refrao-secret', s)
  );
  return new;
exception when others then
  return new; -- nunca impede a mensagem de ser enviada
end;
$$;
drop trigger if exists messages_push on public.messages;
create trigger messages_push after insert on public.messages
  for each row execute procedure public.notify_new_message();

-- ---------- Acesso do servidor (função "notify") às tabelas ----------
-- Necessário quando o projeto foi criado sem "Grant API access to new tables".
-- O service_role só existe no servidor (nunca no app) e ignora as regras de linha.
grant usage on schema public to service_role;
grant select, insert, update, delete on public.app_secrets, public.push_subscriptions, public.profiles,
  public.messages, public.friendships, public.karaoke_scores, public.login_attempts, public.blocked_words to service_role;
grant usage, select on all sequences in schema public to service_role;
