// Refrão — função "notify" (Supabase Edge Function).
// Envia a notificação de "mensagem nova" para o celular de quem recebeu.
// Como instalar: Supabase → Edge Functions → Deploy a new function → Via Editor →
//   nome: notify → cole este arquivo inteiro → Deploy. Depois, nas configurações da função,
//   DESLIGUE "Enforce JWT verification" (quem chama é o próprio banco, com uma senha interna).
// As chaves das notificações (VAPID) são criadas na primeira vez e guardadas no banco
// (tabela app_secrets, invisível para o app). Nada para copiar ou configurar à mão.
import webpush from "npm:web-push@3.6.7";
import { createClient } from "npm:@supabase/supabase-js@2.118.0";

const APP_URL = "https://mauriciosabinom-blip.github.io/Alpha/musica/";
// Chave de servidor: projetos novos têm a nova (SUPABASE_SECRET_KEYS = {"default":"sb_secret_..."})
// e/ou a antiga (SUPABASE_SERVICE_ROLE_KEY). Testa cada uma e usa a primeira que consegue ler o banco.
function candidateKeys(): { kind: string; key: string }[] {
  const out: { kind: string; key: string }[] = [];
  const raw = Deno.env.get("SUPABASE_SECRET_KEYS") ?? "";
  try { const o = JSON.parse(raw); for (const [n, v] of Object.entries(o)) if (typeof v === "string" && v) out.push({ kind: "secret:" + n, key: v }); }
  catch { if (raw) out.push({ kind: "secret", key: raw }); }
  const one = Deno.env.get("SUPABASE_SECRET_KEY"); if (one) out.push({ kind: "secret_key", key: one });
  const legacy = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"); if (legacy) out.push({ kind: "service_role", key: legacy });
  return out;
}
const URL_ = Deno.env.get("SUPABASE_URL")!;
const mk = (key: string) => createClient(URL_, key, { auth: { persistSession: false, autoRefreshToken: false } });
// deno-lint-ignore no-explicit-any
let sb: any = null;
const diag: { kind: string; ok: boolean; error?: string }[] = [];
async function db() {
  if (sb) return sb;
  diag.length = 0;
  for (const c of candidateKeys()) {
    const client = mk(c.key);
    const { error } = await client.from("app_secrets").select("key").limit(1);
    diag.push({ kind: c.kind, ok: !error, error: error?.message });
    if (!error) { sb = client; return sb; }
  }
  throw new Error("banco: nenhuma chave de servidor conseguiu ler — " + diag.map((d) => `${d.kind}: ${d.error}`).join(" | "));
}
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-refrao-secret",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};
const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { ...cors, "Content-Type": "application/json" } });

async function getSecret(key: string): Promise<string | null> {
  const { data, error } = await (await db()).from("app_secrets").select("value").eq("key", key).maybeSingle();
  if (error) throw new Error("banco: " + error.message);
  return data?.value ?? null;
}
async function vapidKeys() {
  let pub = await getSecret("vapid_public"), priv = await getSecret("vapid_private");
  if (!pub || !priv) {
    const k = webpush.generateVAPIDKeys();
    // "ignoreDuplicates": se duas chamadas criarem ao mesmo tempo, fica a primeira
    const { error } = await (await db()).from("app_secrets").upsert(
      [{ key: "vapid_public", value: k.publicKey }, { key: "vapid_private", value: k.privateKey }],
      { onConflict: "key", ignoreDuplicates: true },
    );
    if (error) throw new Error("banco (salvar chaves): " + error.message);
    pub = await getSecret("vapid_public"); priv = await getSecret("vapid_private");
  }
  return { pub: pub!, priv: priv! };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  // diagnóstico: só mostra o TIPO de cada chave e se funcionou (nunca o valor)
  if (req.method === "GET" && new URL(req.url).searchParams.has("diag")) {
    try { await db(); } catch { /* o resultado fica em diag */ }
    return json({ keys: diag, env: candidateKeys().map((c) => c.kind) });
  }
  try {
    const { pub, priv } = await vapidKeys();
    // o app pede a chave pública para registrar o aparelho
    if (req.method === "GET") return json({ publicKey: pub });

    // só o gatilho do banco (que conhece a senha interna) pode mandar notificações — sem senha válida, recusa sempre
    const secret = await getSecret("push_secret");
    if (!secret || req.headers.get("x-refrao-secret") !== secret) return json({ error: "forbidden" }, 403);
    // type: 'message' (padrão) | 'friend' (pedido de amizade) | 'friend_ok' (pedido aceito)
    const m = await req.json() as { sender: string; receiver: string; body?: string; type?: string };
    const sb = await db();
    const [{ data: subs }, { data: prof }] = await Promise.all([
      sb.from("push_subscriptions").select("id, endpoint, p256dh, auth").eq("user_id", m.receiver).then((r: { error: { message: string } | null }) => { if (r.error) throw new Error("banco: " + r.error.message); return r; }),
      sb.from("profiles").select("handle").eq("id", m.sender).maybeSingle(),
    ]);
    if (!subs?.length) return json({ sent: 0 });

    webpush.setVapidDetails(APP_URL, pub, priv);
    const h = prof?.handle ?? "alguém";
    const body = m.body ?? "";
    const invite = body.startsWith("🎤 Convite para cantar");
    const payload = JSON.stringify(
      m.type === "friend" ? { title: "👋 Pedido de amizade", body: `@${h} quer ser seu amigo no Refrão`, url: `${APP_URL}?social=1`, tag: `friend-${m.sender}` }
      : m.type === "friend_ok" ? { title: "🤝 Amizade aceita", body: `@${h} aceitou seu pedido — mande um oi!`, url: `${APP_URL}?chat=${m.sender}`, tag: `friend-${m.sender}` }
      : { title: `💬 @${h}`, body: invite ? "🎤 te convidou para cantar junto!" : body, url: `${APP_URL}?chat=${m.sender}`, tag: `chat-${m.sender}` },
    );
    let sent = 0;
    for (const s of subs) {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 3600, urgency: "high" });
        sent++;
      } catch (e) {
        // aparelho desinstalou o app ou desativou: remove o registro
        const code = (e as { statusCode?: number }).statusCode;
        if (code === 404 || code === 410) await sb.from("push_subscriptions").delete().eq("id", s.id);
      }
    }
    return json({ sent });
  } catch (e) {
    return json({ error: String((e as Error)?.message ?? e) }, 500);
  }
});
