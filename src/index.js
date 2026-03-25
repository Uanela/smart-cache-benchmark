import express from "express";
import { PrismaClient } from "@prisma/client";
import { BentoCache, bentostore } from "bentocache";
import { memoryDriver } from "bentocache/drivers/memory";
import { smartCache } from "prisma-smart-cache";

const app = express();
app.use(express.json());

const delay = (ms) => new Promise((r) => setTimeout(r, ms));

export const createPrismaProxy = (instance) =>
  new Proxy(instance, {
    get(target, prop, receiver) {
      const original = Reflect.get(target, prop, receiver);

      if (typeof original !== "object" || original === null) {
        return original;
      }

      return new Proxy(original, {
        get(modelTarget, method, modelReceiver) {
          const fn = Reflect.get(modelTarget, method, modelReceiver);

          if (typeof fn !== "function") {
            return fn;
          }

          return async (...args) => {
            // await delay(75);
            return fn.apply(modelTarget, args);
          };
        },
      });
    },
  });

// Raw Prisma
const prismaRaw = createPrismaProxy(new PrismaClient());

// Cached Prisma
const bento = new BentoCache({
  default: "memory",
  stores: {
    memory: bentostore().useL1Layer(
      memoryDriver({ maxSize: 50 * 1024 * 1024 })
    ), // 50mb
  },
});
const prismaCached = smartCache(createPrismaProxy(new PrismaClient()), bento, {
  ttl: 60,
});

// --- READ endpoints ---
app.get("/raw/posts", async (req, res) => {
  const userId = parseInt(req.query.userId) || 1;
  const posts = await prismaRaw.post.findMany({
    where: { authorId: userId, published: true },
    select: { id: true, title: true },
    take: 20,
  });
  res.json(posts);
});

app.get("/cached/posts", async (req, res) => {
  const userId = parseInt(req.query.userId) || 1;
  const posts = await prismaCached.post.findMany({
    where: { authorId: userId, published: true },
    select: { id: true, title: true },
    take: 20,
    cache: { ttl: 30 },
  });
  res.json(posts);
});

// --- WRITE endpoints (for mixed load testing) ---
app.put("/raw/users/:id", async (req, res) => {
  const user = await prismaRaw.user.update({
    where: { id: parseInt(req.params.id) },
    data: req.body,
  });
  res.json(user);
});

app.put("/cached/users/:id", async (req, res) => {
  const user = await prismaCached.user.update({
    where: { id: parseInt(req.params.id) },
    data: req.body,
  });
  res.json(user);
});

const PORT = 8003;

app.listen(PORT, () => console.log(`Server on :${PORT}`));
