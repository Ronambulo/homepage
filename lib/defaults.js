// Compartido entre servidor y cliente.

export const THEMES = {
  Grafito: { rgb: [0, 0, 0], alpha: 0, accent: "#a7dcb8" },
  Bosque: { rgb: [63, 107, 90], alpha: 0.55, accent: "#b6e0c6" },
  Ámbar: { rgb: [168, 116, 58], alpha: 0.55, accent: "#f0c992" },
  Índigo: { rgb: [74, 90, 154], alpha: 0.6, accent: "#b9c4f2" },
  Malva: { rgb: [122, 74, 112], alpha: 0.55, accent: "#e3b8d9" },
};

// intensidad 0-100 (100 = la del tema)
export function themeStyle(name, intensity = 100) {
  const t = THEMES[name] || THEMES.Grafito;
  const a = +(t.alpha * Math.max(0, Math.min(100, intensity)) / 100).toFixed(3);
  return { tint: `rgba(${t.rgb.join(",")},${a})`, accent: t.accent };
}

export const MODULES = {
  fm: { label: "Patrimonio", desc: "Patrimonio neto y ahorro del mes desde FinanceMaster." },
  svc: { label: "Servicios", desc: "Cuántas de tus apps responden ahora mismo." },
  wx: { label: "Clima", desc: "Temperatura actual de tu ciudad (Open-Meteo)." },
  todo: { label: "Tareas", desc: "Lista rápida guardada en este navegador." },
  srv: { label: "Servidor", desc: "CPU, memoria, disco y temperatura de la máquina donde corre esta página.", off: true },
  cal: { label: "Calendario", desc: "Próximos eventos desde un calendario iCal.", off: true },
  gh: { label: "GitHub", desc: "Contribuciones, PRs, issues y CI.", off: true },
  dp: { label: "DiscoPanel", desc: "Servidores de Minecraft y jugadores conectados.", off: true },
  im: { label: "Immich", desc: "Fotos y vídeos subidos hoy y total de tu biblioteca.", off: true },
  ha: { label: "Casa", desc: "Home Assistant: temperatura, caldera y Roomba.", off: true },
};

export const DEFAULT_INTEGRATIONS = {
  srv: { disk: "/", zima: "" },
  dp: { url: "" },
  ha: { url: "", temp: "", roomba: "", boiler: "" },
  im: { url: "" },
};

export const DEFAULT_ALERTS = { downMin: 10, temp: 75, driveTemp: 55, disk: 90 };

export const ICON_NAMES = ["openwebui", "discopanel", "finance", "immich", "globe", "server", "cloud", "folder", "terminal", "play", "home", "shield", "mail"];

export function guessIcon(l) {
  const s = `${l?.name || ""} ${l?.url || ""}`.toLowerCase();
  if (/webui|chat|ollama/.test(s)) return "openwebui";
  if (/disco|minecraft/.test(s)) return "discopanel";
  if (/financ/.test(s)) return "finance";
  if (/immich|photo|foto/.test(s)) return "immich";
  return "globe";
}

export const SEARCH_ENGINES = {
  Google: "https://www.google.com/search?q=",
  DuckDuckGo: "https://duckduckgo.com/?q=",
  Bing: "https://www.bing.com/search?q=",
  Brave: "https://search.brave.com/search?q=",
};

export const DEFAULT_CONFIG = {
  version: 1,
  name: "",
  links: [
    { id: "l1", name: "OpenWebUI", url: "http://192.168.0.24:3050/" },
    { id: "l2", name: "DiscoPanel", url: "http://192.168.0.24:8080/login" },
    { id: "l3", name: "FinanceMaster", url: "http://192.168.0.24:8000/" },
    { id: "l4", name: "Immich", url: "http://192.168.0.24:2283/photos" },
  ],
  hosts: { local: "192.168.0.24", alt: "10.147.13.1", probe: "http://192.168.0.24:8000/" },
  modules: [
    { id: "fm", enabled: true },
    { id: "svc", enabled: true },
    { id: "wx", enabled: true },
    { id: "todo", enabled: true },
    { id: "srv", enabled: false },
    { id: "cal", enabled: false },
    { id: "gh", enabled: false },
    { id: "dp", enabled: false },
    { id: "ha", enabled: false },
    { id: "im", enabled: false },
  ],
  appearance: { theme: "Grafito", intensity: 100, showSearch: true, searchEngine: "Google", bgVersion: 0 },
  fm: { url: "https://financemaster.rodriguezdelreal.com" },
  integrations: DEFAULT_INTEGRATIONS,
  alerts: DEFAULT_ALERTS,
  weather: null, // { name, lat, lon }
};
