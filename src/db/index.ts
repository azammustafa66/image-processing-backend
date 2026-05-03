import mongoose from 'mongoose';

export async function connectToDB() {
  try {
    await mongoose.connect(process.env.MONGO_URI!, { dbName: '' });
  } catch (error) {
    console.error('Failed to connect to database');
  }
}
