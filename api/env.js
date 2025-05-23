// /api/env.js (Node no Vercel)
export default function handler(req, res) {
  res.setHeader('Content-Type', 'application/javascript');
  res.send(`window.env = {
    SUPABASE_URL: "${process.env.VITE_SUPABASE_URL}",
    SUPABASE_KEY: "${process.env.VITE_SUPABASE_KEY}"
  };`);
}