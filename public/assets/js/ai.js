import { api } from './api.js';
import { el, setText } from './ui.js';

export function initAi({ state }) {
  const form = el('aiForm');
  const answerNode = el('aiAnswer');

  form?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const prompt = form.prompt.value.trim();
    if (!prompt) return;

    setText('aiStatus', 'PadhAI is thinking...');
    if (answerNode) answerNode.textContent = '';
    try {
      const payload = { prompt };
      if (state?.location?.coords) {
        payload.lat = state.location.coords.lat;
        payload.lon = state.location.coords.lon;
        payload.radiusKm = state.location.radiusKm || 200;
      }
      if (state?.marketplace?.city) payload.city = state.marketplace.city;
      if (state?.location?.areaCode) payload.areaCode = state.location.areaCode;

      const result = await api.askAI(payload);
      setText('aiStatus', 'Ready');
      if (answerNode) answerNode.textContent = result.text || 'No response';
    } catch (error) {
      setText('aiStatus', error.message || 'Unable to get AI response');
    }
  });
}
