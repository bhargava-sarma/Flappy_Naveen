const crypto = require('crypto');

export default function handler(req, res) {
  // 1. Get Secret (Fallback matches submit-score.js)
  const secret = process.env.GAME_SECRET || 'BlueBirdFlyHigh';
  
  // 2. Generate Timestamp
  const timestamp = Date.now();
  
  // 3. Sign it (HMAC) to prevent tampering
  // This creates a string like: "170000000.a1b2c3d4..."
  // If the user changes the timestamp, the signature won't match
  const signature = crypto.createHmac('sha256', secret)
                          .update(timestamp.toString())
                          .digest('hex');

  const token = `${timestamp}.${signature}`;

  res.status(200).json({ token });
}
