export default async function handler(req, res) {
  const { endpoint } = req.query;
  const url = `${process.env.VITE_SUPABASE_URL}/${endpoint}`;
  const headers = {
    apikey: process.env.VITE_SUPABASE_KEY,
    Authorization: `Bearer ${process.env.VITE_SUPABASE_KEY}`,
    "Content-Type": "application/json",
  };

  try {
    const supabaseRes = await fetch(url, {
      method: req.method,
      headers,
      body: req.method === "GET" ? undefined : req.body,
    });

    const text = await supabaseRes.text();
    res.status(supabaseRes.status).send(text);
  } catch (err) {
    console.error("Erro na proxy Supabase:", err);
    res.status(500).json({ error: "Erro interno na proxy Supabase." });
  }
}
