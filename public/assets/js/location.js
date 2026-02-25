import { api } from './api.js';
import { el, setText } from './ui.js';

function setActiveAreaChip(areaCode) {
  document.querySelectorAll('.area-chip').forEach((chip) => {
    chip.classList.toggle('active', chip.dataset.area === areaCode);
  });
}

function appendOption(select, value, label) {
  const option = document.createElement('option');
  option.value = value;
  option.textContent = label;
  select.appendChild(option);
}

export function initLocation({ state, onLocationChanged, onAreaChanged }) {
  const topAreaSelect = el('topAreaSelect');
  const locateBtn = el('locateBtn');
  const listingForm = el('listingForm');

  function renderAreaSelect() {
    if (!topAreaSelect) return;
    topAreaSelect.innerHTML = '';

    appendOption(topAreaSelect, 'all', 'All Areas');
    for (const area of state.location.areaOptions || []) {
      if (area.value === 'all') continue;
      appendOption(topAreaSelect, area.value, area.label || area.value);
    }

    const nearbyCities = Array.isArray(state.location.nearbyCities) ? state.location.nearbyCities : [];
    if (nearbyCities.length > 0) {
      const group = document.createElement('optgroup');
      group.label = 'Nearby Cities';
      for (const city of nearbyCities) {
        const value = `city:${encodeURIComponent(city.name)}`;
        const item = document.createElement('option');
        item.value = value;
        const distance = Number(city.distanceKm || 0).toFixed(1);
        item.textContent = `${city.name} (${distance} km)`;
        group.appendChild(item);
      }
      topAreaSelect.appendChild(group);
    }

    topAreaSelect.value = state.location.areaSelectValue || 'all';
  }

  function setAreaCode(selectionValue) {
    const value = String(selectionValue || 'all');
    if (value.startsWith('city:')) {
      const cityName = decodeURIComponent(value.slice(5));
      state.location.areaCode = 'all';
      state.location.selectedCity = cityName;
      state.location.areaSelectValue = value;
      if (topAreaSelect) topAreaSelect.value = value;
      setActiveAreaChip('all');
      onAreaChanged?.({ areaCode: 'all', city: cityName });
      return;
    }

    state.location.areaCode = value;
    state.location.selectedCity = '';
    state.location.areaSelectValue = value;
    if (topAreaSelect) topAreaSelect.value = value;
    setActiveAreaChip(value);
    onAreaChanged?.({ areaCode: value, city: '' });
  }

  async function loadAreaOptions() {
    try {
      const result = await api.listAreas();
      const rows = Array.isArray(result.data) ? result.data : [];
      state.location.areaOptions = rows.map((row) => ({
        value: row.value,
        label: row.label
      }));
      renderAreaSelect();
    } catch {
      renderAreaSelect();
    }
  }

  async function resolveLocation(latitude, longitude) {
    const result = await api.locationNearby(latitude, longitude);
    state.location.coords = { lat: latitude, lon: longitude };
    state.location.address = result.current.address;
    state.location.nearbyCities = Array.isArray(result.nearbyCities)
      ? result.nearbyCities
          .map((row) => ({
            name: String(row.city || '').trim(),
            distanceKm: Number(row.distanceKm || 0),
            listingCount: Number(row.listingCount || 0)
          }))
          .filter((row) => row.name.length > 0)
      : [];
    if (Array.isArray(result.areaOptions) && result.areaOptions.length > 0) {
      state.location.areaOptions = result.areaOptions.map((row) => ({
        value: row.value,
        label: row.label
      }));
    }
    renderAreaSelect();

    setText('locationStatus', result.current.address);

    if (listingForm?.latitude) listingForm.latitude.value = String(latitude);
    if (listingForm?.longitude) listingForm.longitude.value = String(longitude);
    if (listingForm?.city && !listingForm.city.value) {
      listingForm.city.value = result.current.address.split(',')[0] || 'Detected City';
    }
    onLocationChanged?.(state.location.coords);
  }

  topAreaSelect?.addEventListener('change', (event) => {
    setAreaCode(event.target.value || 'all');
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

  loadAreaOptions();
  setAreaCode(state.location.areaCode);

  return { setAreaCode, resolveLocation };
}
