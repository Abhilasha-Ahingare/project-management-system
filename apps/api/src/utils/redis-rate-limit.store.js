export class RedisFixedWindowStore {
  constructor(client, prefix) {
    this.client = client;
    this.prefix = prefix;
    this.windowMs = 0;
  }

  init(options) {
    this.windowMs = options.windowMs;
  }

  async increment(key) {
    const [totalHits, remainingTtl] = await this.client.eval(
      "local hits = redis.call('INCR', KEYS[1]); if hits == 1 then redis.call('PEXPIRE', KEYS[1], ARGV[1]); end; return { hits, redis.call('PTTL', KEYS[1]) }",
      1,
      `${this.prefix}:${key}`,
      this.windowMs,
    );
    return {
      totalHits: Number(totalHits),
      resetTime: new Date(Date.now() + Math.max(0, Number(remainingTtl))),
    };
  }

  async decrement(key) {
    await this.client.decr(`${this.prefix}:${key}`);
  }

  async resetKey(key) {
    await this.client.del(`${this.prefix}:${key}`);
  }
}
