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
const WARSAW_LATITUDE = 52.2297;
const WARSAW_LONGITUDE = 21.0122;

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
      || weather.location !== "Warszawa"
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

export async function loadTodayWeather(dateKey: string, signal?: AbortSignal): Promise<TodayWeather> {
  const cached = readCachedWeather(dateKey);
  if (cached) return cached;

  const query = new URLSearchParams({
    latitude: String(WARSAW_LATITUDE),
    longitude: String(WARSAW_LONGITUDE),
    current: "temperature_2m,weather_code",
    daily: "weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max",
    timezone: "Europe/Warsaw",
    forecast_days: "1",
  });
  const response = await fetch(`https://api.open-meteo.com/v1/forecast?${query.toString()}`, { signal });
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
    location: "Warszawa",
    temperature,
    minimum,
    maximum,
    precipitationProbability,
    weatherCode,
  };
  cacheWeather(dateKey, weather);
  return weather;
}
