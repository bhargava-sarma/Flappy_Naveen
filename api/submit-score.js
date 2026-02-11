const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');

export default async function handler(req, res) {
  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { name, score, token } = req.body;

  // Basic validation
  if (!name || typeof score !== 'number') {
    return res.status(400).json({ error: 'Invalid input' });
  }
  
  // Initialize Supabase (Server-side)
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_KEY;
  const gameSecret = process.env.GAME_SECRET || 'BlueBirdFlyHigh'; 

  if (!supabaseUrl || !supabaseKey) {
    return res.status(500).json({ error: 'Server misconfiguration' });
  }

  // --- SECURITY: TIME VALIDATION ---
  if (!token) {
      return res.status(403).json({ error: 'Missing security token' });
  }

  const [timestampStr, signature] = token.split('.');
  if (!timestampStr || !signature) {
      return res.status(403).json({ error: 'Invalid token format' });
  }

  // 1. Verify Signature
  const expectedSig = crypto.createHmac('sha256', gameSecret)
                            .update(timestampStr)
                            .digest('hex');

  if (signature !== expectedSig) {
      return res.status(403).json({ error: 'Token forgery detected' });
  }

  // 2. Verify Impossible Scores
  // Calculate how long the game session lasted
  const startTime = parseInt(timestampStr, 10);
  const now = Date.now();
  const durationSeconds = (now - startTime) / 1000;
  
  // Flappy Bird speed logic:
  // Roughly 1 pipe every ~1.5 to 2 seconds at max speed.
  // We allow a generous buffer (e.g., 1 point every 1.2 seconds) to account for lag.
  // If someone scores 100 in 5 seconds, they are hacking.
  // Exception: Score <= 5 is trivial, skip check to avoid false positives on quick deaths
  if (score > 5) {
      const minSecondsPerPoint = 1.2; 
      const maxPossibleScore = Math.ceil(durationSeconds / minSecondsPerPoint) + 2; // +2 buffer
      
      if (score > maxPossibleScore) {
          console.warn(`Cheat Attempt: Score ${score} in ${durationSeconds}s`);
          return res.status(400).json({ error: 'Score impossible for time elapsed' });
      }
  }
  // ---------------------------------

  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    // Call the RPC function with the secret
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
