const crypto = require('crypto');

// Token blacklist — add compromised emails or tokens here to revoke access
// Format: ['email@example.com', 'another@email.com']
const BLACKLIST = [];

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', 'https://www.thepioneercache.com');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  const secret = process.env.PIONEER_SECRET;
  if (!secret) return res.status(500).json({ ok: false, reason: 'not_configured' });

  const { e: email, t: token } = req.body || {};
  if (!email || !token) return res.status(400).json({ ok: false, reason: 'missing_params' });

  const normalizedEmail = email.toLowerCase().trim();

  // Check blacklist
  if (BLACKLIST.includes(normalizedEmail)) {
    return res.status(403).json({ ok: false, reason: 'revoked' });
  }

  // Validate HMAC
  const expected = crypto
    .createHmac('sha256', secret)
    .update(normalizedEmail)
    .digest('hex')
    .slice(0, 48);

  // Pad/truncate to same length before constant-time compare (prevent length oracle)
  const tokenBuf = Buffer.alloc(48, 0);
  const expectedBuf = Buffer.from(expected);
  Buffer.from(token.slice(0, 48)).copy(tokenBuf);
  if (token.length !== expected.length || !crypto.timingSafeEqual(tokenBuf, expectedBuf)) {
    return res.status(403).json({ ok: false, reason: 'invalid_token' });
  }

  return res.status(200).json({ ok: true });
};
