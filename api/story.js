module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  const { action, round, scenario, state, groupSize, vulnerables, history, score, userResponse, finalScore, usedScenes } = req.body || {};
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'Not configured' });

  let systemPrompt, userMessage;

  if (action === 'scene') {
    const usedList = Array.isArray(usedScenes) && usedScenes.length > 0
      ? `NEVER repeat or resemble these previously used opening situations: ${usedScenes.slice(-10).map((s,i) => `${i+1}) "${s}..."`).join(' ')} — Use a completely different location, time of day, and situation opener each game.`
      : 'This is the first game — make it memorable.';
    systemPrompt = `You are a survival thriller narrator. Write vivid, dark, cinematic scenes like a published thriller novel. Personalize every detail to the group (${groupSize} people, ${vulnerables}, in ${state}). Make it feel real and desperate. CRITICAL: The "scene" field MUST be 85-95 words. Write slowly, dramatically, with sensory detail. Always end on a complete sentence — never cut off mid-thought. Aim for 90 words. Do NOT exceed 100 words. End the scene with ONE urgent question offering exactly 3 labeled options: A) option one, B) option two, or C) option three. Escalate danger each round. If userResponse is provided, evaluate it and set scoreChange (great: +15 to +20, good: +5 to +15, neutral: -5 to +5, bad: -15 to -5, dangerous: -20 to -10). ${usedList} Return ONLY valid JSON no markdown: {"scene":"...","question":"...","scoreChange":0,"scoreReason":"..."}`;
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

    if (action === 'scene') {
      // Enforce 115 word max on scene
      if (parsed.scene) {
        const words = parsed.scene.split(' ');
        if (words.length > 105) {
          // Cut at last sentence boundary within 105 words, never mid-sentence
          const truncated = words.slice(0, 105).join(' ');
          const lastSentence = truncated.search(/[.!?][^.!?]*$/);
          parsed.scene = lastSentence > 0 ? truncated.slice(0, lastSentence + 1) : truncated;
        }
      }
      // Enforce A/B/C options — inject if missing
      if (parsed.question && !/\b[A-C]\)/.test(parsed.question)) {
        parsed.question = parsed.question.replace(/[?.]*$/, '') +
          ' — A) Shelter in place and conserve resources, B) Move immediately to find help or supplies, or C) Wait and assess the full situation before acting?';
      }
    }

    return res.status(200).json(parsed);
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
};
