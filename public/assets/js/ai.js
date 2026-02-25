import { api } from './api.js';
import { el, setText } from './ui.js';

export function initAi() {
  const form = el('aiForm');
  const statusNode = el('aiStatus');
  const answerNode = el('aiAnswer');

  form?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const prompt = form.prompt.value.trim();
    if (!prompt) return;

    setText('aiStatus', 'PadhAI is thinking...');
    if (answerNode) answerNode.textContent = '';
    try {
      const result = await api.askAI(prompt);
      setText('aiStatus', `Provider: ${result.provider || 'unknown'}`);
      if (answerNode) answerNode.textContent = result.text || 'No response';
    } catch (error) {
      setText('aiStatus', error.message || 'Unable to get AI response');
    }
  });
}
