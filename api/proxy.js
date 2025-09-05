export default async function handler(req, res) {
  const { endpoint } = req.query;

  if (!endpoint) {
    return res
      .status(400)
      .json({ error: "Parâmetro 'endpoint' é obrigatório." });
  }

  const url = `${process.env.SUPABASE_URL}${endpoint}`;
  const headers = {
    apikey: process.env.SUPABASE_KEY,
    Authorization: `Bearer ${process.env.SUPABASE_KEY}`,
    "Content-Type": "application/json",
  };

  try {
    const supabaseRes = await fetch(url, {
      method: req.method,
      headers,
      cache: "no-store", // 🔒 desativa cache da Vercel
      body: req.method !== "GET" ? JSON.stringify(req.body) : undefined,
    });

    const text = await supabaseRes.text();

    res.setHeader("Cache-Control", "no-store"); // 🔒 desativa cache no response

    try {
      const data = JSON.parse(text);
      res.status(supabaseRes.status).json(data);
    } catch (err) {
      res.status(supabaseRes.status).send(text || "");
    }
  } catch (error) {
    console.error("❌ Erro na proxy Supabase:", error);
    res.setHeader("Cache-Control", "no-store");
    res.status(500).json({ error: "Erro interno na proxy Supabase." });
  }
}
