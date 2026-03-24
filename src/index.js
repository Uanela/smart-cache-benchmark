import express from "express";
import { PrismaClient } from "@prisma/client";
import { BentoCache, bentostore } from "bentocache";
import { memoryDriver } from "bentocache/drivers/memory";
import { smartCache } from "prisma-smart-cache";

export const PORT = 8003;
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
            await delay(50);
            return fn.apply(modelTarget, args);
          };
        },
      });
    },
  });

const prismaRaw = createPrismaProxy(new PrismaClient());

const bento = new BentoCache({
  default: "memory",
  stores: {
    memory: bentostore().useL1Layer(
      memoryDriver({ maxSize: 100 * 1024 * 1024 })
    ),
  },
});

const prismaCached = smartCache(createPrismaProxy(new PrismaClient()), bento, {
  ttl: 60,
});

// ─── RAW ───────────────────────────────────────────────────────────────────

// Simple lookup by PK
app.get("/raw/user/:id", async (req, res) => {
  try {
    const user = await prismaRaw.user.findUnique({
      where: { id: parseInt(req.params.id) },
      select: { id: true, name: true, email: true },
    });
    res.json(user);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// List with filter
app.get("/raw/posts", async (req, res) => {
  try {
    const posts = await prismaRaw.post.findMany({
      where: { authorId: parseInt(req.query.userId) || 1, published: true },
      select: { id: true, title: true },
      take: 20,
    });
    res.json(posts);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Relation join (post + author + tags)
app.get("/raw/feed", async (req, res) => {
  try {
    const posts = await prismaRaw.post.findMany({
      where: { published: true },
      select: {
        id: true,
        title: true,
        viewCount: true,
        author: { select: { name: true } },
        tags: { select: { name: true } },
      },
      orderBy: { viewCount: "desc" },
      take: 10,
    });
    res.json(posts);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Aggregate
app.get("/raw/stats", async (req, res) => {
  try {
    const [userCount, postCount, avg] = await Promise.all([
      prismaRaw.user.count(),
      prismaRaw.post.count({ where: { published: true } }),
      prismaRaw.post.aggregate({ _avg: { viewCount: true } }),
    ]);
    res.json({ userCount, postCount, avgViews: avg._avg.viewCount });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Write (for mixed load tests)
app.put("/raw/users/:id", async (req, res) => {
  try {
    const user = await prismaRaw.user.update({
      where: { id: parseInt(req.params.id) },
      data: req.body,
    });
    res.json(user);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── CACHED ────────────────────────────────────────────────────────────────

app.get("/cached/user/:id", async (req, res) => {
  try {
    const user = await prismaCached.user.findUnique({
      where: { id: parseInt(req.params.id) },
      select: { id: true, name: true, email: true },
      cache: { ttl: 60 },
    });
    res.json(user);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get("/cached/posts", async (req, res) => {
  try {
    const posts = await prismaCached.post.findMany({
      where: { authorId: parseInt(req.query.userId) || 1, published: true },
      select: { id: true, title: true },
      take: 20,
      cache: { ttl: 60 },
    });
    res.json(posts);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get("/cached/feed", async (req, res) => {
  try {
    const posts = await prismaCached.post.findMany({
      where: { published: true },
      select: {
        id: true,
        title: true,
        viewCount: true,
        author: { select: { name: true } },
        tags: { select: { name: true } },
      },
      orderBy: { viewCount: "desc" },
      take: 10,
      cache: { ttl: 120 },
    });
    res.json(posts);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get("/cached/stats", async (req, res) => {
  try {
    const [userCount, postCount, avg] = await Promise.all([
      prismaCached.user.count({ cache: { ttl: 300 } }),
      prismaCached.post.count({
        where: { published: true },
        cache: { ttl: 300 },
      }),
      prismaCached.post.aggregate({
        _avg: { viewCount: true },
        cache: { ttl: 300 },
      }),
    ]);
    res.json({ userCount, postCount, avgViews: avg._avg.viewCount });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.put("/cached/users/:id", async (req, res) => {
  try {
    const user = await prismaCached.user.update({
      where: { id: parseInt(req.params.id) },
      data: req.body,
    });
    res.json(user);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.listen(PORT, () => console.log(`Server on :${PORT}`));
