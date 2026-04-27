type CacheEntry<T> = {
  data: T;
  timestamp: number;
};

const CACHE_TTL = 30000; // 30 seconds

class DataCache {
  private cache: Map<string, CacheEntry<any>> = new Map();

  set(key: string, data: any) {
    this.cache.set(key, {
      data,
      timestamp: Date.now(),
    });
  }

  get<T>(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) return null;

    const isExpired = Date.now() - entry.timestamp > CACHE_TTL;
    if (isExpired) {
      this.cache.delete(key);
      return null;
    }

    return entry.data;
  }

  invalidate(key: string) {
    this.cache.delete(key);
  }

  clear() {
    this.cache.clear();
  }
}

export const dataCache = new DataCache();
