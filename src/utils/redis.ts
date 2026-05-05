import { createClient } from 'redis';

const client = createClient({
  url: `redis://:${process.env.REDIS_PASSWORD}@${process.env.REDIS_HOST}:${process.env.REDIS_PORT}`,
});

client.on('error', (err: any) => console.error(`Redis error ${err}`));

export default client;
