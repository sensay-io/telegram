import cluster from "node:cluster";
import { Bot } from "grammy";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });
if (!process.env.BOT_TOKEN_ONE) {
  throw new Error("BOT_TOKEN_ONE is not defined");
}
if (!process.env.BOT_TOKEN_TWO) {
  throw new Error("BOT_TOKEN_TWO is not defined");
}

interface WorkerMessage {
  type: "INITIALIZE_BOT" | "SHUTDOWN";
  token?: string;
}

// Your bot configurations
const bots: string[] = [process.env.BOT_TOKEN_ONE, process.env.BOT_TOKEN_TWO];

if (cluster.isPrimary) {
  const workerBotTokens = new Map();

  // Map a worker to a bot
  bots.forEach((bot, _) => {
    const worker = cluster.fork();
    workerBotTokens.set(worker.id, bot);
  });

  // When worker initializes, send the bot config to initialize the bot
  cluster.on("message", (worker, message: WorkerMessage) => {
    if (message.type === "INITIALIZE_BOT") {
      const token = workerBotTokens.get(worker.id);
      worker.send({ type: "INITIALIZE_BOT", token });
    }
  });
}

if (cluster.isWorker) {
  process.send?.({ type: "INITIALIZE_BOT" });

  process.on("SIGINT", () => {
    for (const id in cluster.workers) {
      const worker = cluster.workers[id];
      worker?.send({ type: "SHUTDOWN" });
    }
  });

  process.on("message", async (msg: WorkerMessage) => {
    if (msg.type === "INITIALIZE_BOT") {
      const token = msg.token;
      if (!token) {
        throw new Error("No token provided for bot configuration");
      }
      InitializeBot(token);
    }
  });

  process.on("uncaughtException", (err) => {
    console.error(`Exception in worker ${process.pid}:`, err);
    //TODO: add sentry

    process.exit(1);
  });
}

const InitializeBot = async (token: string) => {
  try {
    const bot = new Bot(token);
    bot.on("message", async (ctx) => {
      await ctx.reply(`Hello from ${ctx.me.username}!`);
    });
    await bot.start({
      onStart: (botInfo) => {
        console.log(`@${botInfo.username} is running `);
      },
    });
  } catch (err) {
    throw new Error(`Failed to initialize worker's bot`);
  }
};
