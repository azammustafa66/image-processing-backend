import { Worker, Queue, type ConnectionOptions } from 'bullmq';

import { logger, sendMail } from '../utils';

const connection: ConnectionOptions = {
  host: process.env.REDIS_HOST || '127.0.0.1',
  port: Number(process.env.REDIS_PORT) || 6379,
  password: process.env.REDIS_PASSWORD!,
};

export const emailQueue = new Queue('EmailQueue', {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 5000 },
  },
});

export const emailWorker = new Worker(
  'EmailQueue',
  async (job) => {
    const { to, subject, name, intro, instructions, buttonText, buttonColor, redirectLink } =
      job.data;
    await sendMail(to, subject, name, intro, instructions, buttonText, buttonColor, redirectLink)();
  },
  { connection },
);

emailWorker.on('completed', (job) => {
  logger.info('Email sent successfully', { jobId: job.id });
});

emailWorker.on('failed', (job, err) => {
  logger.error('Email job failed after all retries', { jobId: job?.id, error: err.message });
});

emailWorker.on('error', (err) => {
  logger.error('Email worker error', { error: err.message });
});
