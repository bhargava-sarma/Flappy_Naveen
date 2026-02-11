const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');

export default async function handler(req, res) {
  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { name, score, token, flapLog } = req.body;

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

  // --- SECURITY: TIME + PHYSICS VALIDATION ---
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

  // 2. Verify Time Limits
  const startTime = parseInt(timestampStr, 10);
  const now = Date.now();
  const durationSeconds = (now - startTime) / 1000;
  
  if (score > 5) {
      // Time check
      const maxPossibleScore = Math.ceil(durationSeconds / 1.2) + 2;
      if (score > maxPossibleScore) {
          return res.status(400).json({ error: 'Score impossible for time elapsed' });
      }

      // 3. Physics/Activity Check (The "Waiting" Fix)
      if (!flapLog || !Array.isArray(flapLog)) {
          return res.status(400).json({ error: 'Missing gameplay data' });
      }

      // Check A: Flap Count vs Score
      // You can't pass a pipe without flapping at least once (usually)
      if (flapLog.length < score * 0.5) {
           return res.status(400).json({ error: 'Not enough inputs for this score' });
      }

      // Check B: The "Gravity" Check
      // If a user waits > 3 seconds without flapping, they hit the ground.
      // We check the gap between Start and First Flap, and between all Flaps.
      let lastFlapTime = startTime;
      const MAX_IDLE_SECONDS = 3.5; // Generous buffer (game over typically in <2s)

      for (const time of flapLog) {
          const gap = (time - lastFlapTime) / 1000;
          if (gap > MAX_IDLE_SECONDS) {
              return res.status(400).json({ error: 'Physics violation: Bird would have crashed' });
          }
          lastFlapTime = time;
      }
      
      // Check gap between last flap and now (did they wait at the end?)
      if ((now - lastFlapTime) / 1000 > MAX_IDLE_SECONDS) {
          return res.status(400).json({ error: 'Physics violation: Idle at end' });
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
