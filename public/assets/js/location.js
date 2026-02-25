import { api } from './api.js';
import { el, setText } from './ui.js';

function setActiveAreaChip(areaCode) {
  document.querySelectorAll('.area-chip').forEach((chip) => {
    chip.classList.toggle('active', chip.dataset.area === areaCode);
  });
}

export function initLocation({ state, onLocationChanged, onAreaChanged }) {
  const topAreaSelect = el('topAreaSelect');
  const locateBtn = el('locateBtn');
  const listingForm = el('listingForm');

  function setAreaCode(areaCode) {
    state.location.areaCode = areaCode;
    if (topAreaSelect) topAreaSelect.value = areaCode;
    setActiveAreaChip(areaCode);
    onAreaChanged?.(areaCode);
  }

  async function resolveLocation(latitude, longitude) {
    const result = await api.locationNearby(latitude, longitude);
    state.location.coords = { lat: latitude, lon: longitude };
    state.location.address = result.current.address;
    setText('locationStatus', result.current.address);

    if (listingForm?.latitude) listingForm.latitude.value = String(latitude);
    if (listingForm?.longitude) listingForm.longitude.value = String(longitude);
    if (listingForm?.city && !listingForm.city.value) {
      listingForm.city.value = result.current.address.split(',')[0] || 'Detected City';
    }
    onLocationChanged?.(state.location.coords);
  }

  topAreaSelect?.addEventListener('change', (event) => {
    setAreaCode(event.target.value);
  });

  locateBtn?.addEventListener('click', async () => {
    if (!navigator.geolocation) {
      setText('locationStatus', 'Geolocation is not supported in this browser.');
      return;
    }
    setText('locationStatus', 'Detecting your current location...');
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        try {
          await resolveLocation(position.coords.latitude, position.coords.longitude);
        } catch (error) {
          setText('locationStatus', error.message || 'Unable to fetch nearby location');
        }
      },
      () => setText('locationStatus', 'Location permission denied. You can still use static area filters.')
    );
  });

  document.querySelectorAll('.area-chip').forEach((chip) => {
    chip.addEventListener('click', () => {
      setAreaCode(chip.dataset.area || 'all');
    });
  });

  setAreaCode(state.location.areaCode);

  return { setAreaCode, resolveLocation };
}
