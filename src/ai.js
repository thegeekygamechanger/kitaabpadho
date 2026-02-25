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

const DEFAULT_SYSTEM_PROMPT = [
  'You are PadhAI, a practical study and marketplace copilot for Indian students.',
  'Use natural conversation and short follow-up memory.',
  'Give direct, accurate, complete answers.',
  'Do not add meta lines, disclaimers, or self-references like "as an AI".',
  'If recommendations are requested, prioritize the provided listing/context data.',
  'When useful, provide actionable steps in compact bullets.'
].join('\n');

function normalizeMessages(input) {
  if (typeof input === 'string') {
    return {
      systemPrompt: DEFAULT_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: input.trim() }]
    };
  }

  const systemPrompt =
    typeof input?.systemPrompt === 'string' && input.systemPrompt.trim()
      ? input.systemPrompt.trim()
      : DEFAULT_SYSTEM_PROMPT;

  const messages = Array.isArray(input?.messages)
    ? input.messages
        .map((item) => ({
          role: item?.role === 'assistant' ? 'assistant' : 'user',
          content: String(item?.content || '').trim()
        }))
        .filter((item) => item.content.length > 0)
    : [];

  if (typeof input?.prompt === 'string' && input.prompt.trim()) {
    messages.push({ role: 'user', content: input.prompt.trim() });
  }

  return {
    systemPrompt,
    messages: messages.length ? messages : [{ role: 'user', content: '' }]
  };
}

function buildGeminiPrompt({ systemPrompt, messages }) {
  const transcript = messages
    .map((message) => `${message.role === 'assistant' ? 'Assistant' : 'User'}: ${message.content}`)
    .join('\n');
  return `${systemPrompt}\n\nConversation:\n${transcript}\nAssistant:`;
}

async function requestGemini(input) {
  if (!config.ai.geminiApiKey) throw new Error('Gemini API key missing');
  const normalized = normalizeMessages(input);
  const prompt = buildGeminiPrompt(normalized);
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

async function requestGroq(input) {
  if (!config.ai.groqApiKey) throw new Error('Groq API key missing');
  const normalized = normalizeMessages(input);
  const messages = [
    { role: 'system', content: normalized.systemPrompt },
    ...normalized.messages.map((item) => ({
      role: item.role === 'assistant' ? 'assistant' : 'user',
      content: item.content
    }))
  ];
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
          messages
        }),
        signal
      }),
    config.ai.timeoutMs
  );
  if (!res.ok) throw new Error(`Groq failed (${res.status})`);
  const json = await res.json();
  return json?.choices?.[0]?.message?.content || 'No response from Groq.';
}

async function askPadhAI(input) {
  const normalized = normalizeMessages(input);
  const order = providerOrder();
  const errors = [];

  for (const provider of order) {
    try {
      const text = provider === 'gemini' ? await requestGemini(normalized) : await requestGroq(normalized);
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
