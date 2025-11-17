export default function handler(req, res) {
  res.status(200).json({
    SUPABASE_URL: process.env.VITE_SUPABASE_URL,
    GAS_ZERAR_URL: process.env.VITE_GAS_ZERAR_URL,
    GAS_ENDERECOS_URL: process.env.GAS_ENDERECOS_URL,
  });
}
