// utils/cache.ts
import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_URL,
  token: process.env.UPSTASH_REDIS_TOKEN,
});

export const getCachedData = async (key: string) => {
    const data: any = await redis.get(key);
    return data ? JSON.parse(data) : null;
};

export const setCachedData = async (key: string, data: any) => {
    await redis.set(key, JSON.stringify(data), { ex: 86400 }); // Cache TTL set to 24 hours
};
