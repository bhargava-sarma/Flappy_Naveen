const { createClient } = require('@supabase/supabase-js');

export default async function handler(req, res) {
  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { name, score } = req.body;

  // Basic validation
  if (!name || typeof score !== 'number') {
    return res.status(400).json({ error: 'Invalid input' });
  }

  // Initialize Supabase (Server-side)
  // These env vars must be set in Vercel
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_KEY;
  const gameSecret = process.env.GAME_SECRET || 'BlueBirdFlyHigh'; // Fallback or Env Var

  if (!supabaseUrl || !supabaseKey) {
    return res.status(500).json({ error: 'Server misconfiguration' });
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    // Call the same RPC function, but inject the secret securely here
    const { error } = await supabase.rpc('submit_score', {
      p_name: name,
      p_score: score,
      p_secret: gameSecret
    });

    if (error) throw error;

    return res.status(200).json({ success: true });

  } catch (error) {
    console.error('Server Save Error:', error);
    return res.status(500).json({ error: error.message });
  }
}
