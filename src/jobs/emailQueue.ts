import { Worker, Queue, type ConnectionOptions } from 'bullmq';

const connection: ConnectionOptions = {
  host: process.env.REDIS_PORT || '127.0.0.1',
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
    const { to, message } = job.data;
    console.log(`Sent ${message} to ${to}`);
  },
  { connection },
);

emailWorker.on('completed', (job) => {
  console.log(`[Job ${job.id}] Email sent successfully`);
});

emailWorker.on('failed', (job, err) => {
  console.error(`[Job ${job?.id}] Failed after all retries: ${err.message}`);
});

// Connection/transport errors — not tied to a specific job
emailWorker.on('error', (err) => {
  console.error(`Email worker error: ${err.message}`);
});
