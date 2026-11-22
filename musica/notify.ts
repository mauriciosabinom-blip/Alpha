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
// chave de servidor: formato antigo (SUPABASE_SERVICE_ROLE_KEY) ou novo (SUPABASE_SECRET_KEYS = {"default":"sb_secret_..."})
function serverKey(): string {
  const legacy = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (legacy) return legacy;
  const raw = Deno.env.get("SUPABASE_SECRET_KEYS") ?? Deno.env.get("SUPABASE_SECRET_KEY") ?? "";
  try { const o = JSON.parse(raw); return (o.default ?? Object.values(o)[0]) as string; } catch { return raw; }
}
const sb = createClient(Deno.env.get("SUPABASE_URL")!, serverKey(), {
  auth: { persistSession: false, autoRefreshToken: false },
});
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-refrao-secret",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};
const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { ...cors, "Content-Type": "application/json" } });

async function getSecret(key: string): Promise<string | null> {
  const { data } = await sb.from("app_secrets").select("value").eq("key", key).maybeSingle();
  return data?.value ?? null;
}
async function vapidKeys() {
  let pub = await getSecret("vapid_public"), priv = await getSecret("vapid_private");
  if (!pub || !priv) {
    const k = webpush.generateVAPIDKeys();
    // "ignoreDuplicates": se duas chamadas criarem ao mesmo tempo, fica a primeira
    await sb.from("app_secrets").upsert(
      [{ key: "vapid_public", value: k.publicKey }, { key: "vapid_private", value: k.privateKey }],
      { onConflict: "key", ignoreDuplicates: true },
    );
    pub = await getSecret("vapid_public"); priv = await getSecret("vapid_private");
  }
  return { pub: pub!, priv: priv! };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const { pub, priv } = await vapidKeys();
    // o app pede a chave pública para registrar o aparelho
    if (req.method === "GET") return json({ publicKey: pub });

    // só o gatilho do banco (que conhece a senha interna) pode mandar notificações
    if (req.headers.get("x-refrao-secret") !== await getSecret("push_secret")) return json({ error: "forbidden" }, 403);
    const m = await req.json() as { sender: string; receiver: string; body: string };
    const [{ data: subs }, { data: prof }] = await Promise.all([
      sb.from("push_subscriptions").select("id, endpoint, p256dh, auth").eq("user_id", m.receiver),
      sb.from("profiles").select("handle").eq("id", m.sender).maybeSingle(),
    ]);
    if (!subs?.length) return json({ sent: 0 });

    webpush.setVapidDetails(APP_URL, pub, priv);
    const invite = m.body.startsWith("🎤 Convite para cantar");
    const payload = JSON.stringify({
      title: `💬 @${prof?.handle ?? "amigo"}`,
      body: invite ? "🎤 te convidou para cantar junto!" : m.body,
      url: `${APP_URL}?chat=${m.sender}`,
      tag: `chat-${m.sender}`,
    });
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
