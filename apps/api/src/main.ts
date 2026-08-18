import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { createApp } from "./app";

const port = Number(process.env.PORT || 4000);
const prisma = new PrismaClient();
const app = createApp(prisma);

app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`API listening on http://localhost:${port}`);
});
