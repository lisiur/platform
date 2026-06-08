type CacheKey = string;

class NotificationCache {
  private channels = new Map<CacheKey, unknown>();
  private templates = new Map<CacheKey, unknown>();

  getChannel<T>(key: CacheKey): T | null {
    return (this.channels.get(key) as T | undefined) ?? null;
  }

  setChannel(key: CacheKey, value: unknown) {
    this.channels.set(key, value);
  }

  invalidateChannels() {
    this.channels.clear();
  }

  getTemplates<T>(key: CacheKey): T | null {
    return (this.templates.get(key) as T | undefined) ?? null;
  }

  setTemplates(key: CacheKey, value: unknown) {
    this.templates.set(key, value);
  }

  invalidateTemplates() {
    this.templates.clear();
  }

  invalidateAll() {
    this.invalidateChannels();
    this.invalidateTemplates();
  }
}

export const notificationCache = new NotificationCache();
