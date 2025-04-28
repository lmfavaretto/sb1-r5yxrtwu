import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.39.7";
import OpenAI from "npm:openai@4.28.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface ChatMessage {
  role: "system" | "assistant" | "user";
  content: string;
}

// Prompt para gerar apenas SQL em dialecto PostgreSQL
const SYSTEM_SQL = `
Você é um gerador de SQL para um SaaS de delivery.
**Use sempre sintaxe PostgreSQL**: para intervalos de data use \`NOW() - INTERVAL '30 days'\`.
Ao calcular gasto de pedidos, use **SUM(o.order_value + COALESCE(o.delivery_fee, 0))**.
Dada uma pergunta em linguagem natural, responda **somente** com SQL que:
• Use tabelas \`customers\` (alias c) e \`orders\` (alias o);
• No WHERE, filtre por \`c.user_id = 'VALOR_DO_USER_ID'\`;
• Faça JOIN de pedidos via \`o.customer_id = c.id\`;
• Limite a 5 linhas e ordene por gasto decrescente;
• Retorne colunas: Cliente, Gasto, # Pedidos, Último Pedido.
Não inclua ponto-e-vírgula, comentários ou texto extra — só SQL puro.
`.trim();

// Prompt para formatar a resposta ao usuário
const SYSTEM_CHAT = `
Você é o **Delivery Guru**, um analista de dados de delivery de alto nível.  
Sempre que eu enviar uma pergunta:

1. **Use estritamente** o array que recebeu no JSON (chamado dataToReport).  
   - “Não use nem cite dados fora desse JSON.”  
2. **Foque no período** solicitado (por ex., últimos 30 dias ou mês de abril).  
   - Se dataToReport veio filtrar 30 dias, não mencione qualquer outro período.  
3. **Singular e plural**  
   - Se houver 1 registro, fale “1 pedido” e destaque esse pedido.  
   - Se houver vários, indique “X pedidos”.  
4. **Parágrafos curtos** e **títulos em negrito** (ex.: **Resultado**, **Insights**, **Ações**).  
5. **Negrito nos números** para facilitar a leitura (ex.: **R$ 120,00**).  
6. **Mantenha o histórico** (history) para conversas multi-turno.
6) **Mantenha contexto** de todo o chat (history) para consultas multi-turno.
7) Responda em Português (BR), formate valores em R$ e datas em dd/mm/yyyy.
8) Use **somente** os dados da consulta SQL ou do fallback de resumo.

Por exemplo:

**Resultado**  
- Cliente: **Giselle**  
- Pedidos no período: **1 pedido**  
- Gasto total no período: **R$ 395**  
- Último pedido em: **31/03/2025**

**Insights**  
- Giselle fez apenas um pedido neste período, mas de alto valor (ticket médio = **R$ 395**).  
- Isso indica um perfil de *alto ticket* mas baixa frequência.

**Ações**  
1. Enviar oferta exclusiva de produto premium via WhatsApp para **Giselle**.  
2. Avaliar criar campanha de reativação para clientes com **1 pedido de alto valor**.

Lembre-se: **não** cite nada além do que estiver em dataToReport. 
`.trim();

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { question, user_id, history } = await req.json();
    if (!question || !user_id) {
      throw new Error("Parâmetros 'question' e 'user_id' são obrigatórios.");
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );
    const openai = new OpenAI({ apiKey: Deno.env.get("OPENAI_API_KEY")! });

    // 1) Gera SQL bruto
    const sqlGen = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: SYSTEM_SQL },
        { role: "user", content: `User ID: ${user_id}\nPergunta: ${question}` }
      ],
      temperature: 0, max_tokens: 200,
    });
    const rawSql = sqlGen.choices[0]?.message?.content.trim() || "";
    let finalSql = rawSql
      .replace(/^```(?:sql)?\s*/, "")
      .replace(/```$/, "")
      .replace(/;\s*$/, "")
      .replace(/VALOR_DO_USER_ID/g, user_id);

    // 2) Injeta filtro de user_id se faltou
    if (!/c\.user_id\s*=/i.test(finalSql)) {
      finalSql = finalSql.replace(
        /WHERE/i,
        `WHERE c.user_id = '${user_id}' AND`
      );
    }

    // 3) Normalizações de JOIN, data e agregação
    finalSql = finalSql
      .replace(
        /JOIN\s+orders\s+o\s+ON\s+[^;\n]+/i,
        "JOIN orders o ON o.customer_id = c.id"
      )
      .replace(
        /DATE_SUB\s*\(\s*CURDATE\(\)\s*,\s*INTERVAL\s*(\d+)\s+DAY\s*\)/gi,
        (_m, d) => `NOW() - INTERVAL '${d} days'`
      )
      .replace(/CURDATE\(\)/gi, "CURRENT_DATE")
      .replace(
        /SUM\(\s*o\.(order_value|amount)\s*\)/gi,
        "SUM(o.order_value + COALESCE(o.delivery_fee, 0))"
      );

    if (!/^select\b/i.test(finalSql)) {
      throw new Error("Falha ao gerar SQL válido. Recebido: " + rawSql);
    }
    console.log("SQL Gerado:", finalSql);

    // 4) Executa no banco via RPC
    let dataToReport: any[] = [];
    const { data: qr, error: qe } = await supabase.rpc(
      "direct_query",
      { sql_text: finalSql }
    );
    if (!qe && Array.isArray(qr) && qr.length > 0) {
      dataToReport = qr;
    } else {
      console.log("Fallback por aggregate orders...");

      // 5) Fallback: agrega somente últimos 30 dias
      const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
        .toISOString();
      const { data: summ, error: se } = await supabase
        .from("orders")
        .select(`
          customer_id,
          SUM(order_value + COALESCE(delivery_fee,0)) as gasto,
          COUNT(id) as pedidos,
          MAX(order_date) as ultimo_pedido
        `, { head: false })
        .eq("user_id", user_id)
        .gte("order_date", cutoff)
        .group("customer_id")
        .order("gasto", { ascending: false })
        .limit(5);

      if (se) {
        console.error("Erro no fallback orders:", se);
        throw new Error("Erro ao buscar pedidos nos últimos 30 dias: " + se.message);
      }
      if (!summ || summ.length === 0) {
        throw new Error("Não há pedidos nos últimos 30 dias para este usuário.");
      }

      // 6) Resolve nomes
      const ids = summ.map((r) => r.customer_id);
      const { data: custs } = await supabase
        .from("customers")
        .select("id, name")
        .in("id", ids);

      dataToReport = summ.map((r: any) => {
        const cust = custs?.find((c) => c.id === r.customer_id);
        return {
          Cliente:       cust?.name || r.customer_id,
          Gasto:         parseFloat(r.gasto),
          Pedidos:       parseInt(r.pedidos, 10),
          "Último Pedido": (r.ultimo_pedido as string).split("T")[0],
        };
      });
    }

    // 7) Formata a resposta via GPT
    const chatGen = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: SYSTEM_CHAT },
        ...(Array.isArray(history) ? history : []),
        {
          role: "assistant",
          content: `Dados para relatório (JSON):\n${JSON.stringify(dataToReport)}`
        },
        { role: "user", content: question }
      ],
      temperature: 0.7, max_tokens: 1000,
    });

    const finalContent = chatGen.choices[0]?.message?.content;
    if (!finalContent) throw new Error("Falha ao gerar a resposta final.");

    return new Response(JSON.stringify({ answer: finalContent }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err) {
    console.error("Delivery Guru Error:", err);
    const message = err instanceof Error ? err.message : "Erro desconhecido";
    const status = message.includes("429") ? 429 : 500;
    return new Response(JSON.stringify({ error: message }), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});