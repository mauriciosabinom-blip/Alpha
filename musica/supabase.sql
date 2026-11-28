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

-- ---------- Progresso de estudo salvo na conta (igual em todos os aparelhos) ----------
create table if not exists public.user_state (
  user_id uuid primary key default auth.uid() references public.profiles (id) on delete cascade,
  data jsonb not null check (pg_column_size(data) < 3000000),
  updated_at timestamptz not null default now()
);
alter table public.user_state enable row level security;
drop policy if exists "ver meu progresso" on public.user_state;
create policy "ver meu progresso" on public.user_state for select to authenticated using (user_id = auth.uid());
drop policy if exists "criar meu progresso" on public.user_state;
create policy "criar meu progresso" on public.user_state for insert to authenticated with check (user_id = auth.uid());
drop policy if exists "salvar meu progresso" on public.user_state;
create policy "salvar meu progresso" on public.user_state for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
revoke all on public.user_state from anon;
grant select, insert, update on public.user_state to authenticated;
grant select, insert, update, delete on public.user_state to service_role;

-- ---------- Chat: áudio, figurinhas e GIFs ----------
-- kind: 'text' (padrão) | 'audio' | 'sticker' | 'gif'; media: arquivo do áudio ou endereço da figurinha/GIF
alter table public.messages add column if not exists kind text not null default 'text';
alter table public.messages add column if not exists media text;
alter table public.messages add column if not exists duration real;
do $$ begin
  alter table public.messages add constraint messages_kind_chk check (kind in ('text', 'audio', 'sticker', 'gif'));
exception when duplicate_object then null; end $$;

-- validação no servidor: só aceita mídia de origens conhecidas (sem links soltos, sem arquivos de fora)
create or replace function public.moderate_message() returns trigger language plpgsql as $$
begin
  if has_link(new.body) then raise exception 'Links não são permitidos no chat.' using errcode = 'P0001', hint = 'link'; end if;
  if has_blocked_words(new.body) then raise exception 'Mensagem bloqueada: linguagem imprópria.' using errcode = 'P0001', hint = 'palavrao'; end if;
  if coalesce(new.kind, 'text') = 'text' then
    if new.media is not null then raise exception 'Mensagem inválida.' using errcode = 'P0001'; end if;
  elsif new.kind = 'audio' then
    if new.media is null or new.media !~ ('^' || new.sender::text || '/[a-z0-9-]{8,64}\.(m4a|mp4|aac|webm|ogg|mp3)$')
       or coalesce(new.duration, 0) <= 0 or new.duration > 125 then
      raise exception 'Áudio inválido.' using errcode = 'P0001';
    end if;
  elsif new.kind = 'sticker' then
    if new.media is null or new.media !~ '^https://fonts\.gstatic\.com/s/e/notoemoji/latest/[0-9a-f_]{2,60}/512\.(webp|gif)$' then
      raise exception 'Figurinha inválida.' using errcode = 'P0001';
    end if;
  elsif new.kind = 'gif' then
    if new.media is null or new.media !~ '^https://media[0-9]?\.giphy\.com/media/[A-Za-z0-9]{5,40}/[a-z0-9_]{1,40}\.(gif|webp|mp4)$' then
      raise exception 'GIF inválido.' using errcode = 'P0001';
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists messages_moderation on public.messages;
create trigger messages_moderation before insert or update of body, kind, media on public.messages
  for each row execute procedure public.moderate_message();

-- arquivos de áudio: privados; só quem mandou e quem recebeu podem ouvir
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('audios', 'audios', false, 5242880, array['audio/mp4', 'audio/aac', 'audio/x-m4a', 'audio/webm', 'audio/ogg', 'audio/mpeg'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;
drop policy if exists "refrao enviar meu audio" on storage.objects;
create policy "refrao enviar meu audio" on storage.objects for insert to authenticated
  with check (bucket_id = 'audios' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "refrao ouvir audios da conversa" on storage.objects;
create policy "refrao ouvir audios da conversa" on storage.objects for select to authenticated
  using (bucket_id = 'audios' and (
    (storage.foldername(name))[1] = auth.uid()::text
    or exists (select 1 from public.messages m where m.kind = 'audio' and m.media = storage.objects.name and auth.uid() in (m.sender, m.receiver))
  ));

-- ---------- Perfil: recado, avatar e "estudando agora" ----------
alter table public.profiles add column if not exists bio text;
alter table public.profiles add column if not exists avatar jsonb;
alter table public.profiles add column if not exists now_playing text;
do $$ begin
  alter table public.profiles add constraint profiles_bio_len check (char_length(bio) <= 80);
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.profiles add constraint profiles_np_len check (char_length(now_playing) <= 120);
exception when duplicate_object then null; end $$;

create or replace function public.moderate_profile() returns trigger language plpgsql as $$
begin
  if has_blocked_words(new.name) or has_blocked_words(new.handle) or has_blocked_words(new.bio) or has_blocked_words(new.now_playing) then
    raise exception 'Nome ou recado com palavras não permitidas.' using errcode = 'P0001', hint = 'palavrao';
  end if;
  if has_link(new.bio) then raise exception 'Links não são permitidos no perfil.' using errcode = 'P0001', hint = 'link'; end if;
  -- avatar: só os campos conhecidos; a foto precisa ser a da própria pessoa
  if new.avatar is not null then
    if jsonb_typeof(new.avatar) <> 'object' or pg_column_size(new.avatar) > 600
       or (new.avatar ? 'photo' and new.avatar->>'photo' is not null and new.avatar->>'photo' <> new.id::text || '/avatar.jpg') then
      raise exception 'Avatar inválido.' using errcode = 'P0001';
    end if;
  end if;
  return new;
end;
$$;
grant update (name, bio, avatar, now_playing) on public.profiles to authenticated;

-- fotos de perfil: privadas — só a própria pessoa e os amigos dela veem
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', false, 1048576, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;
drop policy if exists "refrao enviar minha foto" on storage.objects;
create policy "refrao enviar minha foto" on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and name = auth.uid()::text || '/avatar.jpg');
drop policy if exists "refrao trocar minha foto" on storage.objects;
create policy "refrao trocar minha foto" on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and name = auth.uid()::text || '/avatar.jpg')
  with check (bucket_id = 'avatars' and name = auth.uid()::text || '/avatar.jpg');
drop policy if exists "refrao apagar minha foto" on storage.objects;
create policy "refrao apagar minha foto" on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and name = auth.uid()::text || '/avatar.jpg');
drop policy if exists "refrao ver foto de amigos" on storage.objects;
create policy "refrao ver foto de amigos" on storage.objects for select to authenticated
  using (bucket_id = 'avatars' and (
    name = auth.uid()::text || '/avatar.jpg'
    or exists (select 1 from public.friendships f where f.status = 'accepted'
      and ((f.requester = auth.uid() and f.addressee::text = (storage.foldername(name))[1])
        or (f.addressee = auth.uid() and f.requester::text = (storage.foldername(name))[1])))
  ));

-- ---------- Assinaturas: teste grátis de 15 minutos + liberação manual ----------
create table if not exists public.subscriptions (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  plan text not null check (plan in ('mensal', 'anual', 'cortesia')),
  paid_until timestamptz not null,
  updated_at timestamptz not null default now()
);
alter table public.subscriptions enable row level security;
revoke all on public.subscriptions from anon, authenticated;
grant select on public.subscriptions to authenticated;
grant select, insert, update, delete on public.subscriptions to service_role;
drop policy if exists "ver minha assinatura" on public.subscriptions;
create policy "ver minha assinatura" on public.subscriptions for select to authenticated using (user_id = auth.uid());

-- situação de acesso de quem está logado (o servidor decide; o relógio do celular não conta)
create or replace function public.my_access() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'now', now(),
    'trial_ends', p.created_at + interval '15 minutes',
    'paid_until', s.paid_until,
    'plan', s.plan,
    'status', case when s.paid_until > now() then 'active'
                   when p.created_at + interval '15 minutes' > now() then 'trial'
                   else 'expired' end)
  from public.profiles p left join public.subscriptions s on s.user_id = p.id
  where p.id = auth.uid()
$$;
revoke all on function public.my_access() from public, anon;
grant execute on function public.my_access() to authenticated;

-- para você liberar quem pagou (só funciona no SQL Editor do Supabase):
--   select liberar_assinatura('usuario', 'mensal');   -- +1 mês
--   select liberar_assinatura('usuario', 'anual');    -- +1 ano
--   select liberar_assinatura('usuario', 'cortesia'); -- sem prazo
-- Se a pessoa ainda tiver dias pagos, o tempo novo é somado.
create or replace function public.liberar_assinatura(p_handle text, p_plano text) returns text
language plpgsql security definer set search_path = public as $$
declare uid uuid; ate timestamptz; h text := lower(replace(trim(p_handle), '@', ''));
begin
  if p_plano not in ('mensal', 'anual', 'cortesia') then return 'Plano inválido: use mensal, anual ou cortesia'; end if;
  select id into uid from public.profiles where handle = h;
  if uid is null then return 'Usuário @' || h || ' não encontrado'; end if;
  insert into public.subscriptions (user_id, plan, paid_until) values (uid, p_plano, now()) on conflict (user_id) do nothing;
  update public.subscriptions set plan = p_plano, updated_at = now(),
    paid_until = greatest(paid_until, now()) + case p_plano when 'mensal' then interval '1 month' when 'anual' then interval '1 year' else interval '100 years' end
  where user_id = uid returning paid_until into ate;
  return '@' || h || ' liberado (' || p_plano || ') até ' || to_char(ate at time zone 'America/Sao_Paulo', 'DD/MM/YYYY');
end;
$$;
revoke all on function public.liberar_assinatura(text, text) from public, anon, authenticated;

-- ---------- Painel do administrador: pedidos de pagamento e liberação ----------
-- quem pode usar o painel (só a conta @mauricio)
create table if not exists public.app_admins (user_id uuid primary key references public.profiles (id) on delete cascade);
alter table public.app_admins enable row level security;
revoke all on public.app_admins from anon, authenticated;
insert into public.app_admins (user_id) select id from public.profiles where handle = 'mauricio' on conflict do nothing;
create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.app_admins where user_id = auth.uid())
$$;
grant execute on function public.is_admin() to authenticated;

-- pedidos: "paguei o plano X" (registrado ao tocar em Enviar comprovante)
create table if not exists public.payment_claims (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  plan text not null check (plan in ('mensal', 'anual')),
  amount numeric(8, 2) not null,
  status text not null default 'pendente' check (status in ('pendente', 'liberado', 'recusado')),
  created_at timestamptz not null default now(),
  decided_at timestamptz
);
alter table public.payment_claims enable row level security;
revoke all on public.payment_claims from anon, authenticated;
grant select, insert, update, delete on public.payment_claims, public.app_admins to service_role;

create or replace function public.registrar_pagamento(p_handle text, p_plano text) returns text
language plpgsql security definer set search_path = public as $$
declare uid uuid; h text := lower(regexp_replace(coalesce(p_handle, ''), '[^a-zA-Z0-9]', '', 'g')); n int;
begin
  if p_plano not in ('mensal', 'anual') then return 'plano inválido'; end if;
  select id into uid from public.profiles where handle = h;
  if uid is null then return 'usuario_nao_encontrado'; end if;
  select count(*) into n from public.payment_claims where user_id = uid and created_at > now() - interval '1 day';
  if n >= 5 then return 'ok'; end if; -- evita pedidos repetidos sem fim
  insert into public.payment_claims (user_id, plan, amount) values (uid, p_plano, case p_plano when 'mensal' then 9.99 else 79.90 end);
  return 'ok';
end;
$$;
grant execute on function public.registrar_pagamento(text, text) to anon, authenticated;

-- funções do painel: todas conferem se quem chama é administrador
create or replace function public.admin_pedidos() returns table (id bigint, handle text, name text, plan text, amount numeric, status text, created_at timestamptz, decided_at timestamptz, paid_until timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Acesso restrito ao administrador.'; end if;
  return query select c.id, p.handle, p.name, c.plan, c.amount, c.status, c.created_at, c.decided_at, s.paid_until
    from public.payment_claims c join public.profiles p on p.id = c.user_id left join public.subscriptions s on s.user_id = c.user_id
    order by (c.status = 'pendente') desc, c.created_at desc limit 500;
end;
$$;
create or replace function public.admin_usuarios(p_busca text default '') returns table (handle text, name text, created_at timestamptz, status text, plan text, paid_until timestamptz, pedidos_pendentes bigint)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Acesso restrito ao administrador.'; end if;
  return query select p.handle, p.name, p.created_at,
      case when s.paid_until > now() then 'ativo' when p.created_at + interval '15 minutes' > now() then 'teste' else 'expirado' end,
      s.plan, s.paid_until,
      (select count(*) from public.payment_claims c where c.user_id = p.id and c.status = 'pendente')
    from public.profiles p left join public.subscriptions s on s.user_id = p.id
    where coalesce(p_busca, '') = '' or p.handle ilike '%' || p_busca || '%' or p.name ilike '%' || p_busca || '%'
    order by p.created_at desc limit 500;
end;
$$;
create or replace function public.admin_liberar(p_handle text, p_plano text, p_pedido bigint default null) returns text
language plpgsql security definer set search_path = public as $$
declare r text;
begin
  if not public.is_admin() then raise exception 'Acesso restrito ao administrador.'; end if;
  r := public.liberar_assinatura(p_handle, p_plano);
  if p_pedido is not null then update public.payment_claims set status = 'liberado', decided_at = now() where id = p_pedido; end if;
  return r;
end;
$$;
create or replace function public.admin_recusar(p_pedido bigint) returns text
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Acesso restrito ao administrador.'; end if;
  update public.payment_claims set status = 'recusado', decided_at = now() where id = p_pedido;
  return 'Pedido recusado';
end;
$$;
create or replace function public.admin_remover_acesso(p_handle text) returns text
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Acesso restrito ao administrador.'; end if;
  delete from public.subscriptions where user_id = (select id from public.profiles where handle = lower(p_handle));
  return 'Acesso de @' || lower(p_handle) || ' removido';
end;
$$;
revoke all on function public.admin_pedidos(), public.admin_usuarios(text), public.admin_liberar(text, text, bigint), public.admin_recusar(bigint), public.admin_remover_acesso(text) from public, anon;
grant execute on function public.admin_pedidos(), public.admin_usuarios(text), public.admin_liberar(text, text, bigint), public.admin_recusar(bigint), public.admin_remover_acesso(text) to authenticated;

-- ---------- Chat: confirmação de envio, entrega e leitura (claves de sol 𝄞) ----------
-- delivered_at = chegou no app do amigo · read_at = ele abriu a conversa.
alter table public.messages add column if not exists delivered_at timestamptz;
grant update (read_at, delivered_at) on public.messages to authenticated;
create or replace function public.messages_receipts() returns trigger language plpgsql as $$
begin
  -- o horário vem do servidor, e nunca volta atrás
  new.delivered_at := case when old.delivered_at is not null then old.delivered_at when new.delivered_at is not null then now() end;
  new.read_at := case when old.read_at is not null then old.read_at when new.read_at is not null then now() end;
  if new.read_at is not null and new.delivered_at is null then new.delivered_at := new.read_at; end if;
  return new;
end $$;
drop trigger if exists messages_receipts on public.messages;
create trigger messages_receipts before update of read_at, delivered_at on public.messages
  for each row execute function public.messages_receipts();
update public.messages set delivered_at = read_at where delivered_at is null and read_at is not null;

-- ---------- Notificação (push) de pedido de amizade e de amizade aceita ----------
-- Usa a mesma função "notify" das mensagens (precisa da versão nova do notify.ts).
create or replace function public.notify_friendship() returns trigger
language plpgsql security definer set search_path = public, extensions as $$
declare s text;
begin
  select value into s from app_secrets where key = 'push_secret';
  if tg_op = 'INSERT' and new.status = 'pending' then
    perform net.http_post(
      url := 'https://khpterapkxaispzorsav.supabase.co/functions/v1/notify',
      body := jsonb_build_object('type', 'friend', 'sender', new.requester, 'receiver', new.addressee),
      headers := jsonb_build_object('Content-Type', 'application/json', 'x-refrao-secret', s));
  elsif tg_op = 'UPDATE' and new.status = 'accepted' and old.status = 'pending' then
    perform net.http_post(
      url := 'https://khpterapkxaispzorsav.supabase.co/functions/v1/notify',
      body := jsonb_build_object('type', 'friend_ok', 'sender', new.addressee, 'receiver', new.requester),
      headers := jsonb_build_object('Content-Type', 'application/json', 'x-refrao-secret', s));
  end if;
  return new;
exception when others then
  return new; -- nunca impede o pedido de amizade
end;
$$;
drop trigger if exists friendships_push on public.friendships;
create trigger friendships_push after insert or update of status on public.friendships
  for each row execute procedure public.notify_friendship();
select 'avisos de amizade ativados' as resultado;
