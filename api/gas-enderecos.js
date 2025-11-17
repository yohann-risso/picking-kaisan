export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Método não permitido" });
  }

  try {
    const GAS_URL = process.env.GAS_ENDERECOS_URL;

    const resp = await fetch(GAS_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req.body)
    });

    const data = await resp.json();
    res.setHeader("Access-Control-Allow-Origin", "*");
    return res.status(200).json(data);

  } catch (err) {
    console.error("Erro no proxy GAS:", err);
    res.status(500).json({ error: err.message });
  }
}
