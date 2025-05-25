export default function handler(req, res) {
  res.status(200).json({
    SUPABASE_URL: process.env.SUPABASE_URL,
    GAS_ZERAR_URL: process.env.GAS_ZERAR_URL
  });
}