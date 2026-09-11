export function safeLoadStorage(key, fallback) {
  try {
    const item = localStorage.getItem(key);
    return item ? JSON.parse(item) : fallback;
  } catch (e) {
    console.warn(`Error parsing localStorage key "${key}":`, e);
    return fallback;
  }
}