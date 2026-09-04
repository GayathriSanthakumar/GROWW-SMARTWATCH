import { Redis } from "ioredis";
import { config } from "../config.js";

// Redis is used as the hot read-through cache for live price ticks (Tier 15).
// If Redis is unreachable (e.g. demo/dev with no Redis installed), we degrade
// gracefully to an in-memory Map so the app still works fully offline.
class Cache {
  private redis: Redis | null = null;
  private memory = new Map<string, { value: string; expiresAt: number }>();

  constructor() {
    try {
      this.redis = new Redis(config.redisUrl, {
        lazyConnect: true,
        maxRetriesPerRequest: 1,
        retryStrategy: () => null,
      });
      this.redis.on("error", () => {
        this.redis = null;
      });
    } catch {
      this.redis = null;
    }
  }

  async get(key: string): Promise<string | null> {
    if (this.redis) {
      try {
        return await this.redis.get(key);
      } catch {
        this.redis = null;
      }
    }
    const hit = this.memory.get(key);
    if (!hit) return null;
    if (hit.expiresAt < Date.now()) {
      this.memory.delete(key);
      return null;
    }
    return hit.value;
  }

  async getJson<T>(key: string): Promise<T | null> {
    const raw = await this.get(key);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  }

  async set(key: string, value: string, ttlSeconds?: number) {
    if (this.redis) {
      try {
        if (ttlSeconds) await this.redis.set(key, value, "EX", ttlSeconds);
        else await this.redis.set(key, value);
        return;
      } catch {
        this.redis = null;
      }
    }
    this.memory.set(key, { value, expiresAt: ttlSeconds ? Date.now() + ttlSeconds * 1000 : Infinity });
  }

  async setJson(key: string, value: unknown, ttlSeconds?: number) {
    await this.set(key, JSON.stringify(value), ttlSeconds);
  }

  async del(key: string) {
    if (this.redis) {
      try {
        await this.redis.del(key);
      } catch {
        this.redis = null;
      }
    }
    this.memory.delete(key);
  }

  async publish(channel: string, message: string) {
    if (this.redis) {
      try {
        await this.redis.publish(channel, message);
        return;
      } catch {
        this.redis = null;
      }
    }
  }

  isRedisAvailable() {
    return this.redis !== null;
  }
}

export const cache = new Cache();
