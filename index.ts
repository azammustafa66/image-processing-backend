import app from './src/app';
import { connectToDB } from './src/db';

connectToDB().then(() => app.listen(Number(process.env.PORT) || 3000));
