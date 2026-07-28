export type TodayWeather = {
  location: string;
  temperature: number;
  minimum: number;
  maximum: number;
  precipitationProbability: number;
  weatherCode: number;
};

type WeatherApiResponse = {
  current?: {
    temperature_2m?: number;
    weather_code?: number;
  };
  daily?: {
    temperature_2m_min?: number[];
    temperature_2m_max?: number[];
    precipitation_probability_max?: number[];
    weather_code?: number[];
  };
};

const CACHE_KEY = "rootine.today-weather.v1";
const inflightRequests = new Map<string, Promise<TodayWeather>>();

export const TODAY_WEATHER_LOCATION = {
  id: "warsaw",
  label: "Warszawa",
  latitude: 52.2297,
  longitude: 21.0122,
  timezone: "Europe/Warsaw",
} as const;

export type LoadTodayWeatherOptions = {
  forceRefresh?: boolean;
};

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function readCachedWeather(dateKey: string): TodayWeather | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { dateKey?: unknown; weather?: Partial<TodayWeather> };
    const weather = parsed.weather;
    if (
      parsed.dateKey !== dateKey
      || !weather
      || weather.location !== TODAY_WEATHER_LOCATION.label
      || !isFiniteNumber(weather.temperature)
      || !isFiniteNumber(weather.minimum)
      || !isFiniteNumber(weather.maximum)
      || !isFiniteNumber(weather.precipitationProbability)
      || !isFiniteNumber(weather.weatherCode)
    ) return null;
    return weather as TodayWeather;
  } catch {
    return null;
  }
}

function cacheWeather(dateKey: string, weather: TodayWeather) {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(CACHE_KEY, JSON.stringify({ dateKey, weather }));
  } catch {
    // Weather remains available for the current render even when session storage is unavailable.
  }
}

function clearCachedWeather() {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(CACHE_KEY);
  } catch {
    // A refresh can still continue when session storage is unavailable.
  }
}

async function requestTodayWeather(dateKey: string): Promise<TodayWeather> {
  const query = new URLSearchParams({
    latitude: String(TODAY_WEATHER_LOCATION.latitude),
    longitude: String(TODAY_WEATHER_LOCATION.longitude),
    current: "temperature_2m,weather_code",
    daily: "weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max",
    timezone: TODAY_WEATHER_LOCATION.timezone,
    forecast_days: "1",
  });
  const response = await fetch(`https://api.open-meteo.com/v1/forecast?${query.toString()}`);
  if (!response.ok) throw new Error(`Weather request failed with status ${response.status}`);
  const payload = await response.json() as WeatherApiResponse;

  const temperature = payload.current?.temperature_2m;
  const minimum = payload.daily?.temperature_2m_min?.[0];
  const maximum = payload.daily?.temperature_2m_max?.[0];
  const precipitationProbability = payload.daily?.precipitation_probability_max?.[0];
  const weatherCode = payload.current?.weather_code ?? payload.daily?.weather_code?.[0];
  if (
    !isFiniteNumber(temperature)
    || !isFiniteNumber(minimum)
    || !isFiniteNumber(maximum)
    || !isFiniteNumber(precipitationProbability)
    || !isFiniteNumber(weatherCode)
  ) throw new Error("Weather response has an invalid shape");

  const weather: TodayWeather = {
    location: TODAY_WEATHER_LOCATION.label,
    temperature,
    minimum,
    maximum,
    precipitationProbability,
    weatherCode,
  };
  cacheWeather(dateKey, weather);
  return weather;
}

function waitForWeather(request: Promise<TodayWeather>, signal?: AbortSignal) {
  if (!signal) return request;
  if (signal.aborted) return Promise.reject(new DOMException("Weather request aborted", "AbortError"));

  return new Promise<TodayWeather>((resolve, reject) => {
    const abort = () => reject(new DOMException("Weather request aborted", "AbortError"));
    const cleanup = () => signal.removeEventListener("abort", abort);
    signal.addEventListener("abort", abort, { once: true });
    request.then(
      (weather) => {
        cleanup();
        resolve(weather);
      },
      (error: unknown) => {
        cleanup();
        reject(error);
      },
    );
  });
}

export function getTodayWeatherLabel(code = -1) {
  if (code === 0) return "Bezchmurnie";
  if (code === 1 || code === 2) return "Częściowe zachmurzenie";
  if (code === 3) return "Pochmurno";
  if (code === 45 || code === 48) return "Mgła";
  if (code >= 51 && code <= 67) return "Opady deszczu";
  if (code >= 71 && code <= 77) return "Opady śniegu";
  if (code >= 80 && code <= 82) return "Przelotne opady";
  if (code === 85 || code === 86) return "Przelotny śnieg";
  if (code >= 95) return "Burza";
  return "Zmienna pogoda";
}

export function loadTodayWeather(
  dateKey: string,
  signal?: AbortSignal,
  options: LoadTodayWeatherOptions = {},
): Promise<TodayWeather> {
  if (!options.forceRefresh) {
    const cached = readCachedWeather(dateKey);
    if (cached) return waitForWeather(Promise.resolve(cached), signal);
  } else {
    clearCachedWeather();
  }

  const requestKey = `${TODAY_WEATHER_LOCATION.id}:${dateKey}`;
  let request = options.forceRefresh ? undefined : inflightRequests.get(requestKey);
  if (!request) {
    request = requestTodayWeather(dateKey);
    inflightRequests.set(requestKey, request);
    void request.finally(() => {
      if (inflightRequests.get(requestKey) === request) inflightRequests.delete(requestKey);
    }).catch(() => {
      // The caller receives the original rejection; this only settles the cleanup chain.
    });
  }

  return waitForWeather(request, signal);
}
