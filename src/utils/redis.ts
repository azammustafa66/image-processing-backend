import { createClient } from 'redis';

import logger from './logger';

const client = createClient({
  url: `redis://:${process.env.REDIS_PASSWORD}@${process.env.REDIS_HOST}:${process.env.REDIS_PORT}`,
});

client.on('error', (err: any) => logger.error('Redis error', { error: err.message }));

export default client;
