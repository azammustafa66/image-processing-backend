import app from './src/app';
import { connectToDB } from './src/db';
import { client, transporter } from './src/utils';

connectToDB()
  .then(async () => {
    await client.connect();
    await transporter.verify();
    app.listen(Number(process.env.PORT) || 3000);
  })
  .catch((err: any) => {
    console.error(`Error ${err}`);
    process.exit(1);
  });
