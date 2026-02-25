const config = require('./config');

function withTimeout(fetchPromiseFactory, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return fetchPromiseFactory(controller.signal).finally(() => clearTimeout(timer));
}

function providerOrder() {
  const mode = String(config.ai.primaryProvider || 'auto').toLowerCase();

  if (mode === 'groq') return ['groq', 'gemini'];
  if (mode === 'gemini') return ['gemini', 'groq'];
  if (mode === 'groq-only') return ['groq'];
  if (mode === 'gemini-only') return ['gemini'];

  const useGeminiFirst = Math.random() <= config.ai.geminiWeight;
  return useGeminiFirst ? ['gemini', 'groq'] : ['groq', 'gemini'];
}

async function requestGemini(prompt) {
  if (!config.ai.geminiApiKey) throw new Error('Gemini API key missing');
  const res = await withTimeout(
    (signal) =>
      fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${config.ai.modelGemini}:generateContent?key=${config.ai.geminiApiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
          signal
        }
      ),
    config.ai.timeoutMs
  );
  if (!res.ok) throw new Error(`Gemini failed (${res.status})`);
  const json = await res.json();
  return json?.candidates?.[0]?.content?.parts?.[0]?.text || 'No response from Gemini.';
}

async function requestGroq(prompt) {
  if (!config.ai.groqApiKey) throw new Error('Groq API key missing');
  const base = String(config.ai.groqBaseUrl || 'https://api.groq.com/openai/v1').replace(/\/$/, '');
  const res = await withTimeout(
    (signal) =>
      fetch(`${base}/chat/completions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${config.ai.groqApiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: config.ai.modelGroq,
          messages: [
            { role: 'system', content: 'You are PadhAI, a practical learning assistant for students in India.' },
            { role: 'user', content: prompt }
          ]
        }),
        signal
      }),
    config.ai.timeoutMs
  );
  if (!res.ok) throw new Error(`Groq failed (${res.status})`);
  const json = await res.json();
  return json?.choices?.[0]?.message?.content || 'No response from Groq.';
}

async function askPadhAI(prompt) {
  const order = providerOrder();
  const errors = [];

  for (const provider of order) {
    try {
      const text = provider === 'gemini' ? await requestGemini(prompt) : await requestGroq(prompt);
      return { provider, text };
    } catch (err) {
      errors.push(`${provider}: ${err.message}`);
    }
  }

  return {
    provider: 'fallback',
    text: 'PadhAI is temporarily unavailable. Please retry in a moment.',
    errors
  };
}

module.exports = { askPadhAI };
