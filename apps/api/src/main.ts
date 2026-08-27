import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { createApp, tickFeeds } from "./app";
import { configuredFeedProvider } from "./xfeed";
import { startCron } from "./cron";

const port = Number(process.env.PORT || 4000);
const prisma = new PrismaClient();
const app = createApp(prisma);

app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`API listening on http://localhost:${port}`);
});

startCron(prisma);

if (configuredFeedProvider() !== "none") {
  const ms = Number(process.env.FEED_POLL_MS || 60_000);
  const poll = () => {
    void tickFeeds(prisma).catch((error) => {
      // eslint-disable-next-line no-console
      console.error("feed poll failed", error);
    });
  };
  poll();
  setInterval(poll, Number.isFinite(ms) && ms >= 15_000 ? ms : 60_000);
}
