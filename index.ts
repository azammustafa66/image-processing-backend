import app from './src/app';
import { connectToDB } from './src/db';
import { client } from './src/utils';

connectToDB()
  .then(async () => {
    await client.connect();
    app.listen(Number(process.env.PORT) || 3000);
  })
  .catch((err: any) => {
    console.error(`Error ${err}`);
    process.exit(1);
  });
