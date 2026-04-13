module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  const { action, round, scenario, state, groupSize, vulnerables, history, score, userResponse, finalScore } = req.body || {};
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'Not configured' });

  let systemPrompt, userMessage;

  if (action === 'scene') {
    systemPrompt = `You are a survival thriller narrator. Write vivid, dark, cinematic scenes like a published thriller novel. Personalize every detail to the group (${groupSize} people, ${vulnerables}, in ${state}). Make it feel real and desperate. STRICT WORD LIMIT: the "scene" field must be 105-115 words — no more, no less. Count carefully. End the scene with ONE urgent decision question offering 3 options labeled A) B) C). Escalate danger each round. If userResponse is provided, evaluate it and set scoreChange accordingly (great survival decision: +15 to +20, good: +5 to +15, neutral: -5 to +5, bad: -15 to -5, dangerous: -20 to -10). Return ONLY valid JSON with no markdown: {"scene":"...","question":"...","scoreChange":0,"scoreReason":"..."}`;
    userMessage = `Round ${round} of 5. Scenario: ${scenario}. Previous history: ${JSON.stringify(history)}. Current score: ${score}. User's last action: "${userResponse || 'none - this is round 1'}". Write the next scene.`;
  } else {
    systemPrompt = `You are a survival thriller narrator delivering a dramatic conclusion. Write powerfully based on their journey. Return ONLY valid JSON with no markdown: {"outcome":"survived|barely_survived|didnt_make_it|died","insight":"2-3 sentences on exactly what knowledge saved or killed them referencing The Pioneer Cache guide","decisions":"2-3 sentences summarizing their key choices throughout"}`;
    userMessage = `Scenario: ${scenario}. Group: ${groupSize} people, ${vulnerables}, in ${state}. Final score: ${finalScore}/100. History: ${JSON.stringify(history)}. Deliver the ending.`;
  }

  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 800,
        system: systemPrompt,
        messages: [{ role: 'user', content: userMessage }]
      })
    });
    const data = await r.json();
    const text = data.content?.filter(b => b.type === 'text').map(b => b.text).join('') || '{}';
    const parsed = JSON.parse(text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim());
    return res.status(200).json(parsed);
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
};
