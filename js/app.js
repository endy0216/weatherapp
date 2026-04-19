/**
 * WeatherApp – app.js
 * Projekt Zespołowy | Wprowadzenie do Technologii Internetowych
 *
 * API: Open-Meteo (https://open-meteo.com/) – bezpłatne, bez klucza API
 */

'use strict';

/* ============================================================
   STAŁE I KONFIGURACJA
   ============================================================ */

const GEO_API     = 'https://geocoding-api.open-meteo.com/v1/search';
const WEATHER_API = 'https://api.open-meteo.com/v1/forecast';
const STORAGE_KEY = 'weatherApp_v2';
const MAX_RECENT  = 5;

// Kody WMO → opis, emoji, klucz tła karty
const WEATHER_CODES = {
  0:  { desc: 'Bezchmurne niebo',            emoji: '☀️',  bg: 'clear'   },
  1:  { desc: 'Przeważnie słonecznie',        emoji: '🌤️', bg: 'clear'   },
  2:  { desc: 'Częściowe zachmurzenie',       emoji: '⛅',  bg: 'cloudy'  },
  3:  { desc: 'Zachmurzenie całkowite',       emoji: '☁️',  bg: 'cloudy'  },
  45: { desc: 'Mgła',                         emoji: '🌫️', bg: 'fog'     },
  48: { desc: 'Mgła z szadzią',              emoji: '🌫️', bg: 'fog'     },
  51: { desc: 'Słaba mżawka',                emoji: '🌦️', bg: 'rain'    },
  53: { desc: 'Mżawka',                       emoji: '🌦️', bg: 'rain'    },
  55: { desc: 'Intensywna mżawka',            emoji: '🌧️', bg: 'rain'    },
  56: { desc: 'Marznąca mżawka',             emoji: '🌨️', bg: 'snow'    },
  57: { desc: 'Silna marznąca mżawka',       emoji: '🌨️', bg: 'snow'    },
  61: { desc: 'Słaby deszcz',                emoji: '🌧️', bg: 'rain'    },
  63: { desc: 'Deszcz',                       emoji: '🌧️', bg: 'rain'    },
  65: { desc: 'Intensywny deszcz',            emoji: '🌧️', bg: 'rain'    },
  66: { desc: 'Marznący deszcz',             emoji: '🌨️', bg: 'snow'    },
  67: { desc: 'Silny marznący deszcz',       emoji: '🌨️', bg: 'snow'    },
  71: { desc: 'Słabe opady śniegu',          emoji: '🌨️', bg: 'snow'    },
  73: { desc: 'Opady śniegu',                emoji: '❄️',  bg: 'snow'    },
  75: { desc: 'Intensywne opady śniegu',     emoji: '❄️',  bg: 'snow'    },
  77: { desc: 'Ziarna śniegu',               emoji: '🌨️', bg: 'snow'    },
  80: { desc: 'Przelotny deszcz',            emoji: '🌦️', bg: 'rain'    },
  81: { desc: 'Opady przelotne',             emoji: '🌧️', bg: 'rain'    },
  82: { desc: 'Gwałtowne opady',             emoji: '⛈️',  bg: 'thunder' },
  85: { desc: 'Opady śniegu z deszczem',     emoji: '🌨️', bg: 'snow'    },
  86: { desc: 'Intensywne opady śniegu',     emoji: '❄️',  bg: 'snow'    },
  95: { desc: 'Burza',                        emoji: '⛈️',  bg: 'thunder' },
  96: { desc: 'Burza z gradem',              emoji: '⛈️',  bg: 'thunder' },
  99: { desc: 'Burza z intensywnym gradem',  emoji: '⛈️',  bg: 'thunder' },
};

const DAYS_PL   = ['Niedziela','Poniedziałek','Wtorek','Środa','Czwartek','Piątek','Sobota'];
const MONTHS_PL = ['stycznia','lutego','marca','kwietnia','maja','czerwca',
                   'lipca','sierpnia','września','października','listopada','grudnia'];

/* ============================================================
   STAN APLIKACJI
   ============================================================ */

const state = {
  unit:           'C',
  theme:          'light',
  activeTab:      'search',
  currentData:    null,
  currentCoords:  null,
  recentSearches: [],
  favorites:      [],  // { lat, lon, name, tempC, weatherCode }
  settings: {
    name:           '',    // imię/nick użytkownika
    defaultCity:    '',    // wyświetlana nazwa domyślnego miasta
    defaultLat:     null,  // współrzędne domyślnego miasta
    defaultLon:     null,
    note:           '',    // notatka użytkownika
  },
};

/* ============================================================
   LOCALSTORAGE
   ============================================================ */

function saveToStorage(data) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (err) {
    console.error('Błąd zapisu localStorage:', err);
  }
}

function loadFromStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (err) {
    console.error('Błąd odczytu localStorage:', err);
    return null;
  }
}

function initState() {
  const saved = loadFromStorage();
  if (!saved) return;
  if (saved.unit)           state.unit           = saved.unit;
  if (saved.theme)          state.theme          = saved.theme;
  if (saved.recentSearches) state.recentSearches = saved.recentSearches;
  if (saved.favorites)      state.favorites      = saved.favorites;
  if (saved.settings)       state.settings       = { ...state.settings, ...saved.settings };
}

function persistState() {
  saveToStorage({
    unit:           state.unit,
    theme:          state.theme,
    recentSearches: state.recentSearches,
    favorites:      state.favorites,
    settings:       state.settings,
  });
}

/* ============================================================
   WALIDACJA (RegExp)
   ============================================================ */

// Litery (w tym polskie), spacje, myślniki
const CITY_REGEXP = /^[a-zA-ZąćęłńóśźżĄĆĘŁŃÓŚŹŻ\s\-]{2,60}$/;

function validateCity(value) {
  const v = value.trim();
  if (!v) return 'Wpisz nazwę miasta.';
  if (!CITY_REGEXP.test(v)) return 'Nazwa może zawierać tylko litery, spacje i myślniki.';
  return '';
}

/* ============================================================
   SYSTEM ZAKŁADEK
   ============================================================ */

/**
 * Przełącza aktywną zakładkę.
 * @param {'search'|'weather'|'forecast'} tabId
 */
function switchTab(tabId) {
  // Ukryj wszystkie panele
  document.querySelectorAll('.tab-panel').forEach((panel) => {
    panel.setAttribute('hidden', '');
  });

  // Odznacz wszystkie przyciski zakładek
  document.querySelectorAll('.tab-btn').forEach((btn) => {
    btn.classList.remove('active');
    btn.setAttribute('aria-selected', 'false');
  });

  // Pokaż wybrany panel
  const panel = document.getElementById(`tab-${tabId}`);
  if (panel) panel.removeAttribute('hidden');

  // Zaznacz właściwy przycisk
  const btn = document.getElementById(`tab-btn-${tabId}`);
  if (btn) {
    btn.classList.add('active');
    btn.setAttribute('aria-selected', 'true');
  }

  state.activeTab = tabId;
}

/**
 * Odblokowuje zakładki Pogoda i Prognoza (po pierwszym załadowaniu danych).
 */
function enableWeatherTabs() {
  document.getElementById('tab-btn-weather').disabled  = false;
  document.getElementById('tab-btn-forecast').disabled = false;
}

/* ============================================================
   FETCH – GEOKODOWANIE I POGODA
   ============================================================ */

async function searchCities(query) {
  const url = `${GEO_API}?name=${encodeURIComponent(query)}&count=5&language=pl&format=json`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  return data.results || [];
}

async function fetchWeather(lat, lon) {
  const params = new URLSearchParams({
    latitude:  lat,
    longitude: lon,
    current: [
      'temperature_2m','relative_humidity_2m','apparent_temperature',
      'is_day','precipitation','weather_code','wind_speed_10m',
    ].join(','),
    daily: [
      'weather_code','temperature_2m_max','temperature_2m_min','precipitation_sum',
    ].join(','),
    timezone:        'auto',
    forecast_days:   5,
    wind_speed_unit: 'kmh',
  });

  const res = await fetch(`${WEATHER_API}?${params}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

/* ============================================================
   KONWERSJA TEMPERATURY
   ============================================================ */

function toF(c) { return (c * 9/5 + 32).toFixed(1); }

function fmtTemp(celsius) {
  return state.unit === 'F' ? `${toF(celsius)}` : `${Math.round(celsius)}`;
}

/* ============================================================
   RENDEROWANIE
   ============================================================ */

function getWeatherInfo(code) {
  return WEATHER_CODES[code] ?? { desc: 'Nieznana pogoda', emoji: '🌡️', bg: 'default' };
}

function formatDate(dateStr) {
  const d = new Date(dateStr);
  return `${DAYS_PL[d.getDay()]}, ${d.getDate()} ${MONTHS_PL[d.getMonth()]} ${d.getFullYear()}`;
}

function shortDay(dateStr) {
  return DAYS_PL[new Date(dateStr).getDay()].slice(0, 3).toUpperCase();
}

/** Renderuje aktualną pogodę (zakładka 2). */
function renderCurrentWeather(cityName, data) {
  const c    = data.current;
  const info = getWeatherInfo(c.weather_code);

  // Karta – tło wg pogody
  document.getElementById('current-weather-card').setAttribute('data-weather', info.bg);

  // Dane
  document.getElementById('city-name').textContent           = cityName;
  document.getElementById('weather-date').textContent        = formatDate(data.daily.time[0]);
  document.getElementById('temp-value').textContent          = fmtTemp(c.temperature_2m);
  document.getElementById('display-unit').textContent        = `°${state.unit}`;
  document.getElementById('weather-emoji').textContent       = info.emoji;
  document.getElementById('weather-emoji').setAttribute('aria-label', info.desc);
  document.getElementById('weather-description').textContent = info.desc;
  document.getElementById('humidity').textContent            = `${c.relative_humidity_2m}%`;
  document.getElementById('wind-speed').textContent          = `${c.wind_speed_10m} km/h`;
  document.getElementById('feels-like').textContent          = `${fmtTemp(c.apparent_temperature)}°${state.unit}`;
  document.getElementById('precipitation').textContent       = `${c.precipitation} mm`;

  document.getElementById('weather').removeAttribute('hidden');
}

/** Renderuje siatkę 5-dniowej prognozy (zakładka 3). */
function renderForecast(cityName, data) {
  const grid = document.getElementById('forecast-grid');
  const { time, weather_code, temperature_2m_max, temperature_2m_min, precipitation_sum } = data.daily;

  document.getElementById('forecast-city-label').textContent = cityName;

  grid.innerHTML = '';

  time.forEach((dateStr, i) => {
    const info = getWeatherInfo(weather_code[i]);
    const isToday = i === 0;

    const card = document.createElement('div');
    card.className = `forecast-card${isToday ? ' today' : ''}`;
    card.setAttribute('role', 'listitem');
    card.setAttribute('tabindex', '0');
    card.setAttribute('aria-label',
      `${isToday ? 'Dziś' : shortDay(dateStr)}: max ${fmtTemp(temperature_2m_max[i])}°${state.unit}, min ${fmtTemp(temperature_2m_min[i])}°${state.unit}, ${info.desc}`
    );

    card.innerHTML = `
      <div class="forecast-day">${isToday ? 'Dziś' : shortDay(dateStr)}</div>
      <div class="forecast-emoji" aria-hidden="true">${info.emoji}</div>
      <div class="forecast-temp-max">${fmtTemp(temperature_2m_max[i])}°${state.unit}</div>
      <div class="forecast-temp-min">${fmtTemp(temperature_2m_min[i])}°${state.unit}</div>
      ${precipitation_sum[i] > 0
        ? `<div class="forecast-rain"><i class="fas fa-droplet" aria-hidden="true"></i> ${precipitation_sum[i]} mm</div>`
        : ''}
    `;

    // Event listener: click – otwiera modal ze szczegółami dnia
    card.addEventListener('click', () => openDayModal(dateStr, i, data));

    // Event listener: keyboard dla dostępności
    card.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        openDayModal(dateStr, i, data);
      }
    });

    grid.appendChild(card);
  });
}

/** Otwiera modal ze szczegółami wybranego dnia. */
function openDayModal(dateStr, idx, data) {
  const { weather_code, temperature_2m_max, temperature_2m_min, precipitation_sum } = data.daily;
  const info = getWeatherInfo(weather_code[idx]);

  document.getElementById('modal-title').textContent =
    `${DAYS_PL[new Date(dateStr).getDay()]} — ${info.emoji} ${info.desc}`;

  document.getElementById('modal-body').innerHTML = `
    <div class="modal-stat">
      <div class="modal-stat-label">Max temp.</div>
      <div class="modal-stat-value">${fmtTemp(temperature_2m_max[idx])}°${state.unit}</div>
    </div>
    <div class="modal-stat">
      <div class="modal-stat-label">Min temp.</div>
      <div class="modal-stat-value">${fmtTemp(temperature_2m_min[idx])}°${state.unit}</div>
    </div>
    <div class="modal-stat">
      <div class="modal-stat-label">Opady</div>
      <div class="modal-stat-value">${precipitation_sum[idx]} mm</div>
    </div>
    <div class="modal-stat">
      <div class="modal-stat-label">Data</div>
      <div class="modal-stat-value" style="font-size:.9rem">${formatDate(dateStr)}</div>
    </div>
  `;

  document.getElementById('day-modal').removeAttribute('hidden');
  document.getElementById('modal-close').focus();
}

function closeModal() {
  document.getElementById('day-modal').setAttribute('hidden', '');
}

/** Renderuje listę ostatnich wyszukiwań. */
function renderRecentSearches() {
  const list      = document.getElementById('recent-list');
  const container = document.getElementById('recent-searches');

  if (!state.recentSearches.length) {
    container.setAttribute('hidden', '');
    return;
  }

  container.removeAttribute('hidden');
  list.innerHTML = '';

  state.recentSearches.forEach((item) => {
    const li = document.createElement('li');
    li.setAttribute('tabindex', '0');
    li.setAttribute('aria-label', `Wyszukaj ponownie: ${item.name}`);
    li.innerHTML = `
      <span class="recent-city">
        <i class="fas fa-location-dot" aria-hidden="true"></i> ${item.name}
      </span>
      <span class="recent-temp">${fmtTemp(item.tempC)}°${state.unit}</span>
    `;

    // Event listener: click – ponowne wyszukiwanie
    li.addEventListener('click', () => loadWeatherForCoords(item.lat, item.lon, item.name));
    li.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') loadWeatherForCoords(item.lat, item.lon, item.name);
    });

    list.appendChild(li);
  });
}

/** Renderuje podpowiedzi autocomplete. */
function renderAutocomplete(results) {
  const list = document.getElementById('autocomplete-list');

  if (!results.length) { list.setAttribute('hidden', ''); return; }

  list.innerHTML = '';
  list.removeAttribute('hidden');

  results.forEach((city, i) => {
    const li = document.createElement('li');
    li.setAttribute('role', 'option');
    li.setAttribute('aria-selected', 'false');
    li.textContent = `${city.name}${city.admin1 ? ', ' + city.admin1 : ''}, ${city.country}`;
    li.dataset.index = i;

    // Event listener: click – wybór z autocomplete
    li.addEventListener('click', () => selectCity(city));
    li.addEventListener('mousedown', (e) => e.preventDefault()); // zapobiega utracie focusa

    list.appendChild(li);
  });
}

function hideAutocomplete() {
  const list = document.getElementById('autocomplete-list');
  list.setAttribute('hidden', '');
  list.innerHTML = '';
}

function setError(msg) {
  document.getElementById('search-error').textContent = msg;
}

function setLoading(show) {
  const loader = document.getElementById('loading');
  if (show) loader.removeAttribute('hidden');
  else      loader.setAttribute('hidden', '');
}

/* ============================================================
   LOGIKA APLIKACJI
   ============================================================ */

function selectCity(city) {
  const name = `${city.name}${city.admin1 ? ', ' + city.admin1 : ''}, ${city.country}`;
  document.getElementById('city-input').value = name;
  hideAutocomplete();
  setError('');
  loadWeatherForCoords(city.latitude, city.longitude, name);
}

/** Główna funkcja – pobiera pogodę i aktualizuje UI. */
async function loadWeatherForCoords(lat, lon, cityName) {
  // Przełącz na zakładkę Pogoda i pokaż loader
  switchTab('weather');
  setLoading(true);
  document.getElementById('weather').setAttribute('hidden', '');

  try {
    const data = await fetchWeather(lat, lon);
    state.currentData   = data;
    state.currentCoords = { lat, lon, cityName };

    renderCurrentWeather(cityName, data);
    renderForecast(cityName, data);
    enableWeatherTabs();
    addToRecentSearches(lat, lon, cityName, data.current.temperature_2m);
    updateFavoriteBtn();
  } catch (err) {
    console.error('Błąd pobierania pogody:', err);
    // Wróć na zakładkę Szukaj z komunikatem błędu
    switchTab('search');
    setError('Nie udało się pobrać danych. Sprawdź połączenie z internetem.');
  } finally {
    setLoading(false);
  }
}

/** Obsługuje wyszukiwanie po nazwie miasta. */
async function handleSearch(query) {
  hideAutocomplete();
  setLoading(true);
  setError('');
  switchTab('weather');

  try {
    const results = await searchCities(query);

    if (!results.length) {
      setLoading(false);
      switchTab('search');
      setError(`Nie znaleziono miasta: „${query}". Sprawdź pisownię.`);
      return;
    }

    const city = results[0];
    const name = `${city.name}${city.admin1 ? ', ' + city.admin1 : ''}, ${city.country}`;
    await loadWeatherForCoords(city.latitude, city.longitude, name);
  } catch (err) {
    console.error('Błąd geokodowania:', err);
    switchTab('search');
    setError('Błąd wyszukiwania. Spróbuj ponownie.');
    setLoading(false);
  }
}

/** Dodaje wpis do historii wyszukiwań. */
function addToRecentSearches(lat, lon, name, tempC) {
  state.recentSearches = state.recentSearches.filter(
    (item) => !(Math.abs(item.lat - lat) < 0.01 && Math.abs(item.lon - lon) < 0.01)
  );
  state.recentSearches.unshift({ lat, lon, name, tempC });
  state.recentSearches = state.recentSearches.slice(0, MAX_RECENT);
  persistState();
  renderRecentSearches();
}

/* ============================================================
   ULUBIONE MIASTA
   ============================================================ */

/** Sprawdza czy miasto jest w ulubionych (po przybliżonych współrzędnych). */
function isFavorite(lat, lon) {
  return state.favorites.some(
    (f) => Math.abs(f.lat - lat) < 0.01 && Math.abs(f.lon - lon) < 0.01
  );
}

/** Aktualizuje wygląd przycisku serca wg stanu ulubionych. */
function updateFavoriteBtn() {
  const btn   = document.getElementById('fav-toggle-btn');
  const label = document.getElementById('fav-toggle-label');
  if (!btn || !state.currentCoords) return;

  const fav = isFavorite(state.currentCoords.lat, state.currentCoords.lon);
  btn.classList.toggle('is-favorite', fav);
  label.textContent = fav ? 'Usuń z ulubionych' : 'Dodaj do ulubionych';
  btn.setAttribute('aria-label', label.textContent);
}

/** Przełącza miasto między ulubionymii a nie-ulubionymi. */
function toggleFavorite() {
  if (!state.currentCoords || !state.currentData) return;

  const { lat, lon, cityName } = state.currentCoords;
  const tempC       = state.currentData.current.temperature_2m;
  const weatherCode = state.currentData.current.weather_code;

  if (isFavorite(lat, lon)) {
    // Usuń
    state.favorites = state.favorites.filter(
      (f) => !(Math.abs(f.lat - lat) < 0.01 && Math.abs(f.lon - lon) < 0.01)
    );
  } else {
    // Dodaj
    state.favorites.unshift({ lat, lon, name: cityName, tempC, weatherCode });
  }

  persistState();
  updateFavoriteBtn();
  renderFavorites();
}

/** Renderuje siatkę ulubionych miast. */
function renderFavorites() {
  const grid  = document.getElementById('favorites-grid');
  const empty = document.getElementById('favorites-empty');
  const count = document.getElementById('favorites-count');

  // Licznik
  const n = state.favorites.length;
  count.textContent = n === 0 ? '' : `${n} ${n === 1 ? 'miasto' : n < 5 ? 'miasta' : 'miast'}`;

  if (!n) {
    empty.removeAttribute('hidden');
    grid.innerHTML = '';
    return;
  }

  empty.setAttribute('hidden', '');
  grid.innerHTML = '';

  state.favorites.forEach((fav, idx) => {
    const info = getWeatherInfo(fav.weatherCode);
    const card = document.createElement('article');
    card.className = 'fav-card';
    card.setAttribute('role', 'listitem');
    card.setAttribute('data-weather', info.bg);
    card.style.animationDelay = `${idx * 0.06}s`;

    card.innerHTML = `
      <div class="fav-card-top">
        <span class="fav-emoji" aria-hidden="true">${info.emoji}</span>
        <span class="fav-temp">${fmtTemp(fav.tempC)}°${state.unit}</span>
      </div>
      <div class="fav-card-bottom">
        <h3 class="fav-name">${fav.name}</h3>
        <p class="fav-desc">${info.desc}</p>
        <div class="fav-card-actions">
          <button class="fav-load-btn" aria-label="Pokaż pogodę dla ${fav.name}">
            <i class="fas fa-arrow-right" aria-hidden="true"></i> Pogoda
          </button>
          <button class="fav-remove-btn" aria-label="Usuń ${fav.name} z ulubionych">
            <i class="fas fa-trash" aria-hidden="true"></i>
          </button>
        </div>
      </div>
    `;

    // Event listener: przejdź do pogody dla tego miasta
    card.querySelector('.fav-load-btn').addEventListener('click', () => {
      loadWeatherForCoords(fav.lat, fav.lon, fav.name);
    });

    // Event listener: usuń z ulubionych
    card.querySelector('.fav-remove-btn').addEventListener('click', () => {
      state.favorites = state.favorites.filter(
        (f) => !(Math.abs(f.lat - fav.lat) < 0.01 && Math.abs(f.lon - fav.lon) < 0.01)
      );
      persistState();
      renderFavorites();
      updateFavoriteBtn();
      // Animacja znikania
      card.style.transition = 'opacity .2s, transform .2s';
      card.style.opacity    = '0';
      card.style.transform  = 'scale(.9)';
      setTimeout(() => renderFavorites(), 220);
    });

    grid.appendChild(card);
  });
}

/* ============================================================
   GEOLOKALIZACJA
   ============================================================ */

function handleGeolocation() {
  if (!navigator.geolocation) {
    setError('Twoja przeglądarka nie obsługuje geolokalizacji.');
    return;
  }

  setLoading(true);
  setError('');
  switchTab('weather');

  navigator.geolocation.getCurrentPosition(
    async ({ coords }) => {
      const { latitude, longitude } = coords;
      try {
        // Nominatim z własnym limitem czasu (5 s)
        const controller = new AbortController();
        const nominatimTimeout = setTimeout(() => controller.abort(), 5000);
        const res = await fetch(
          `https://nominatim.openstreetmap.org/reverse?lat=${latitude}&lon=${longitude}&format=json&accept-language=pl`,
          { signal: controller.signal }
        );
        clearTimeout(nominatimTimeout);
        const geo     = await res.json();
        const city    = geo.address?.city || geo.address?.town || geo.address?.village || 'Moja lokalizacja';
        const country = geo.address?.country || '';
        await loadWeatherForCoords(latitude, longitude, `${city}, ${country}`);
      } catch {
        // Jeśli reverse-geocoding się nie udał – pokaż pogodę bez nazwy miasta
        await loadWeatherForCoords(latitude, longitude, 'Moja lokalizacja');
      }
    },
    (err) => {
      setLoading(false);
      switchTab('search');
      const msgs = {
        1: 'Odmówiono dostępu do lokalizacji. Zezwól na dostęp w ustawieniach przeglądarki.',
        2: 'Nie udało się ustalić lokalizacji. Spróbuj ponownie.',
        3: 'Przekroczono limit czasu. Spróbuj ponownie lub wpisz miasto ręcznie.',
      };
      setError(msgs[err.code] || 'Błąd geolokalizacji.');
    },
    {
      timeout: 20000,          // 20 s – więcej czasu na GPS
      maximumAge: 120000,      // akceptuj pozycję z cache (maks. 2 min)
      enableHighAccuracy: false // szybszy tryb (sieć/IP zamiast GPS)
    }
  );
}

/* ============================================================
   PRZEŁĄCZNIKI
   ============================================================ */

function toggleTheme() {
  state.theme = state.theme === 'light' ? 'dark' : 'light';
  document.body.className = `theme-${state.theme}`;
  const icon  = document.querySelector('#theme-toggle i');
  const label = document.getElementById('theme-label');
  if (state.theme === 'dark') {
    icon.className  = 'fas fa-sun';
    label.textContent = 'Jasny';
  } else {
    icon.className  = 'fas fa-moon';
    label.textContent = 'Ciemny';
  }
  persistState();
}

function toggleUnit() {
  state.unit = state.unit === 'C' ? 'F' : 'C';
  const btn = document.getElementById('unit-toggle');
  btn.classList.toggle('active-f', state.unit === 'F');
  btn.classList.toggle('active-c', state.unit === 'C');
  persistState();

  // Odśwież widoki jeśli są dane
  if (state.currentData && state.currentCoords) {
    renderCurrentWeather(state.currentCoords.cityName, state.currentData);
    renderForecast(state.currentCoords.cityName, state.currentData);
  }
  renderRecentSearches();
  renderFavorites();
}

/* ============================================================
   USTAWIENIA – formularz
   ============================================================ */

// RegExp do walidacji imienia (litery, w tym polskie, spacje, myślniki)
const NAME_REGEXP = /^[a-zA-ZąćęłńóśźżĄĆĘŁŃÓŚŹŻ\s\-]{2,40}$/;

/** Wypełnia formularz ustawień zapisanymi wartościami. */
function loadSettingsForm() {
  document.getElementById('settings-name').value = state.settings.name;
  document.getElementById('settings-note').value = state.settings.note;
  updateNoteCounter();
  applyGreeting();

  const cityInput = document.getElementById('settings-city');
  cityInput.value = state.settings.defaultCity;
  // Przywróć zapisane współrzędne na element
  if (state.settings.defaultLat !== null) {
    cityInput.dataset.lat = state.settings.defaultLat;
    cityInput.dataset.lon = state.settings.defaultLon;
  } else {
    delete cityInput.dataset.lat;
    delete cityInput.dataset.lon;
  }
}

/** Aktualizuje licznik znaków notatki. */
function updateNoteCounter() {
  const note = document.getElementById('settings-note');
  document.getElementById('settings-note-count').textContent = note.value.length;
}

/** Wyświetla powitanie z imieniem na stronie wyszukiwania (jeśli ustawione). */
function applyGreeting() {
  const name = state.settings.name.trim();
  let subtitle = document.querySelector('.search-subtitle');
  if (!subtitle) return;
  subtitle.textContent = name
    ? `Cześć, ${name}! Wpisz nazwę miasta lub użyj swojej lokalizacji.`
    : 'Wpisz nazwę miasta lub użyj swojej lokalizacji';
}

/** Waliduje i zapisuje ustawienia. */
function handleSettingsSubmit(e) {
  e.preventDefault();

  const nameVal = document.getElementById('settings-name').value.trim();
  const cityVal = document.getElementById('settings-city').value.trim();
  const noteVal = document.getElementById('settings-note').value.trim();

  let valid = true;

  // Walidacja imienia (opcjonalne, ale jeśli podane musi być poprawne)
  const nameErr = document.getElementById('settings-name-error');
  const nameInput = document.getElementById('settings-name');
  if (nameVal && !NAME_REGEXP.test(nameVal)) {
    nameErr.textContent = 'Imię może zawierać tylko litery, spacje i myślniki (min. 2 znaki).';
    nameInput.classList.add('is-invalid');
    valid = false;
  } else {
    nameErr.textContent = '';
    nameInput.classList.remove('is-invalid');
  }

  // Walidacja domyślnego miasta — wymaga wyboru z podpowiedzi
  const cityErr   = document.getElementById('settings-city-error');
  const cityInput = document.getElementById('settings-city');
  const cityLat   = parseFloat(cityInput.dataset.lat);
  const cityLon   = parseFloat(cityInput.dataset.lon);
  const cityHasCoords = cityVal && !isNaN(cityLat) && !isNaN(cityLon);

  if (cityVal && !cityHasCoords) {
    cityErr.textContent = 'Wybierz miasto z listy podpowiedzi.';
    cityInput.classList.add('is-invalid');
    valid = false;
  } else {
    cityErr.textContent = '';
    cityInput.classList.remove('is-invalid');
  }

  // Walidacja notatki
  const noteErr = document.getElementById('settings-note-error');
  const noteInput = document.getElementById('settings-note');
  if (noteVal.length > 300) {
    noteErr.textContent = 'Notatka może mieć maksymalnie 300 znaków.';
    noteInput.classList.add('is-invalid');
    valid = false;
  } else {
    noteErr.textContent = '';
    noteInput.classList.remove('is-invalid');
  }

  if (!valid) return;

  // Zapis
  state.settings.name        = nameVal;
  state.settings.defaultCity = cityHasCoords ? cityVal : '';
  state.settings.defaultLat  = cityHasCoords ? cityLat : null;
  state.settings.defaultLon  = cityHasCoords ? cityLon : null;
  state.settings.note        = noteVal;
  persistState();

  applyGreeting();

  // Pokaż potwierdzenie
  const success = document.getElementById('settings-success');
  success.removeAttribute('hidden');
  setTimeout(() => success.setAttribute('hidden', ''), 3000);
}

/** Resetuje formularz ustawień do wartości domyślnych. */
function resetSettings() {
  state.settings = { name: '', defaultCity: '', defaultLat: null, defaultLon: null, note: '' };
  persistState();
  loadSettingsForm();
  // Wyczyść błędy
  ['settings-name', 'settings-city', 'settings-note'].forEach((id) => {
    document.getElementById(id).classList.remove('is-invalid');
  });
  ['settings-name-error', 'settings-city-error', 'settings-note-error'].forEach((id) => {
    document.getElementById(id).textContent = '';
  });
  document.getElementById('settings-success').setAttribute('hidden', '');
  applyGreeting();
}

/* ============================================================
   AUTOCOMPLETE Z DEBOUNCE
   ============================================================ */

let debounceTimer = null;

const debouncedAutocomplete = (query) => {
  clearTimeout(debounceTimer);
  if (query.length < 2) { hideAutocomplete(); return; }
  debounceTimer = setTimeout(async () => {
    try {
      const results = await searchCities(query);
      renderAutocomplete(results);
    } catch {
      hideAutocomplete();
    }
  }, 320);
};

/* --- Autocomplete dla pola "Domyślne miasto" w ustawieniach --- */

let settingsCityTimer = null;

function hideSettingsCityList() {
  const list = document.getElementById('settings-city-list');
  list.setAttribute('hidden', '');
  list.innerHTML = '';
}

function renderSettingsCityList(results) {
  const list  = document.getElementById('settings-city-list');
  const input = document.getElementById('settings-city');

  if (!results.length) { list.setAttribute('hidden', ''); return; }

  list.innerHTML = '';
  list.removeAttribute('hidden');

  results.forEach((city) => {
    // Pełna etykieta w liście (czytelna dla użytkownika)
    const fullLabel = `${city.name}${city.admin1 ? ', ' + city.admin1 : ''}, ${city.country}`;
    const li = document.createElement('li');
    li.setAttribute('role', 'option');
    li.setAttribute('aria-selected', 'false');
    li.textContent = fullLabel;

    li.addEventListener('mousedown', (e) => e.preventDefault());
    li.addEventListener('click', () => {
      // W polu pokazujemy tylko nazwę miasta — bez regionu i kraju
      input.value = city.name;
      // Współrzędne zapamiętane na elemencie — użyte przy zapisie
      input.dataset.lat = city.latitude;
      input.dataset.lon = city.longitude;
      document.getElementById('settings-city-error').textContent = '';
      input.classList.remove('is-invalid');
      hideSettingsCityList();
    });

    list.appendChild(li);
  });
}

const debouncedSettingsCity = (query) => {
  clearTimeout(settingsCityTimer);
  if (query.length < 2) { hideSettingsCityList(); return; }
  settingsCityTimer = setTimeout(async () => {
    try {
      const results = await searchCities(query);
      renderSettingsCityList(results);
    } catch {
      hideSettingsCityList();
    }
  }, 320);
};

/* ============================================================
   EVENT LISTENERS
   ============================================================ */

document.addEventListener('DOMContentLoaded', () => {

  // --- Inicjalizacja stanu ---
  initState();
  document.body.className = `theme-${state.theme}`;

  const themeIcon  = document.querySelector('#theme-toggle i');
  const themeLabel = document.getElementById('theme-label');
  if (state.theme === 'dark') {
    themeIcon.className   = 'fas fa-sun';
    themeLabel.textContent = 'Jasny';
  } else {
    themeLabel.textContent = 'Ciemny';
  }

  const unitBtn = document.getElementById('unit-toggle');
  unitBtn.classList.toggle('active-f', state.unit === 'F');
  unitBtn.classList.toggle('active-c', state.unit === 'C');

  renderRecentSearches();
  renderFavorites();
  loadSettingsForm();

  // Auto-ładowanie domyślnego miasta (jeśli ustawione)
  if (state.settings.defaultLat !== null && state.settings.defaultLon !== null) {
    loadWeatherForCoords(state.settings.defaultLat, state.settings.defaultLon, state.settings.defaultCity);
  } else {
    switchTab('search');
  }

  // ---- Event Listener #1: submit formularza (szukaj) ----
  document.getElementById('search-form').addEventListener('submit', (e) => {
    e.preventDefault(); // event.preventDefault() – wymóg projektu

    const input = document.getElementById('city-input').value.trim();
    const err   = validateCity(input);

    if (err) {
      setError(err);
      document.getElementById('city-input').focus();
      return;
    }

    setError('');
    hideAutocomplete();
    handleSearch(input);
  });

  // ---- Event Listener #2: input – autocomplete ----
  document.getElementById('city-input').addEventListener('input', (e) => {
    setError('');
    debouncedAutocomplete(e.target.value.trim());
  });

  // ---- Event Listener #3: click – geolokalizacja ----
  document.getElementById('geolocation-btn').addEventListener('click', handleGeolocation);

  // ---- Event Listener #4: click – motyw ----
  document.getElementById('theme-toggle').addEventListener('click', toggleTheme);

  // ---- Event Listener #5: click – jednostka ----
  document.getElementById('unit-toggle').addEventListener('click', toggleUnit);

  // ---- Event Listener #6: click – zakładki ----
  document.querySelectorAll('.tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (!btn.disabled) switchTab(btn.dataset.tab);
    });
  });

  // ---- Event Listener #7: click – odśwież ----
  document.getElementById('refresh-btn').addEventListener('click', () => {
    if (state.currentCoords) {
      const { lat, lon, cityName } = state.currentCoords;
      loadWeatherForCoords(lat, lon, cityName);
    }
  });

  // ---- Event Listener #8: click – przycisk "Prognoza 5 dni" ----
  document.getElementById('goto-forecast').addEventListener('click', () => {
    switchTab('forecast');
  });

  // ---- Event Listener #8b: click – przycisk serca (dodaj/usuń ulubione) ----
  document.getElementById('fav-toggle-btn').addEventListener('click', toggleFavorite);

  // ---- Event Listener #8c: click – "Przejdź do wyszukiwania" (pusty stan ulubionych) ----
  document.getElementById('goto-search').addEventListener('click', () => {
    switchTab('search');
  });

  // ---- Event Listener #9: click – wyczyść historię ----
  document.getElementById('clear-history').addEventListener('click', () => {
    state.recentSearches = [];
    persistState();
    renderRecentSearches();
  });

  // ---- Event Listener #10: click – zamknij modal ----
  document.getElementById('modal-close').addEventListener('click', closeModal);

  // ---- Event Listener #11: click – tło modala ----
  document.getElementById('day-modal').addEventListener('click', (e) => {
    if (e.target === document.getElementById('day-modal')) closeModal();
  });

  // ---- Event Listener #12: keydown – Escape zamyka modal + nawigacja autocomplete ----
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeModal();
      hideAutocomplete();
    }

    // Strzałki w autocomplete
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      const list = document.getElementById('autocomplete-list');
      if (list.hasAttribute('hidden')) return;
      const items = [...list.querySelectorAll('li')];
      if (!items.length) return;
      const current = items.findIndex((el) => el === document.activeElement);
      let next = e.key === 'ArrowDown' ? current + 1 : current - 1;
      next = Math.max(0, Math.min(next, items.length - 1));
      items[next].focus();
      e.preventDefault();
    }
  });

  // ---- Event Listener #13: scroll – cień nagłówka ----
  window.addEventListener('scroll', () => {
    const header = document.querySelector('.site-header');
    header.style.boxShadow = window.scrollY > 40
      ? '0 4px 20px rgba(0,0,0,.15)'
      : '';
  });

  // ---- Event Listener #14: click poza autocomplete – ukryj listę ----
  document.addEventListener('click', (e) => {
    const form = document.getElementById('search-form');
    if (!form.contains(e.target)) hideAutocomplete();
  });

  // ---- Event Listener #15: submit formularza ustawień ----
  document.getElementById('settings-form').addEventListener('submit', handleSettingsSubmit);

  // ---- Event Listener #16: reset ustawień ----
  document.getElementById('settings-reset').addEventListener('click', resetSettings);

  // ---- Event Listener #17: input notatki – licznik znaków (real-time validation) ----
  document.getElementById('settings-note').addEventListener('input', updateNoteCounter);

  // ---- Event Listener #18: input – autocomplete domyślnego miasta w ustawieniach ----
  document.getElementById('settings-city').addEventListener('input', (e) => {
    // Jeśli użytkownik modyfikuje tekst ręcznie, usuń zapisane współrzędne
    delete e.target.dataset.lat;
    delete e.target.dataset.lon;
    debouncedSettingsCity(e.target.value.trim());
  });

  // ---- Event Listener #19: blur – ukryj listę gdy focus opuszcza pole ----
  document.getElementById('settings-city').addEventListener('blur', () => {
    setTimeout(hideSettingsCityList, 150);
  });

  // ---- Event Listener #20: keydown – nawigacja strzałkami w autocomplete ustawień ----
  document.getElementById('settings-city').addEventListener('keydown', (e) => {
    const list = document.getElementById('settings-city-list');
    if (list.hasAttribute('hidden')) return;
    const items = [...list.querySelectorAll('li')];
    if (!items.length) return;
    const current = items.findIndex((el) => el === document.activeElement);
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      let next = e.key === 'ArrowDown' ? current + 1 : current - 1;
      next = Math.max(0, Math.min(next, items.length - 1));
      items[next].focus();
      e.preventDefault();
    }
    if (e.key === 'Escape') hideSettingsCityList();
  });
});
