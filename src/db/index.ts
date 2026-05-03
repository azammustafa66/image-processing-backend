import mongoose from 'mongoose';

export async function connectToDB() {
  await mongoose.connect(process.env.MONGO_URI!, { dbName: 'image-processing' });
}
