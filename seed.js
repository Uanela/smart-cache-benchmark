import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

const TAG_NAMES = [
  "tech",
  "news",
  "tutorial",
  "opinion",
  "review",
  "guide",
  "update",
  "tips",
];

async function main() {
  console.log("Seeding...");

  // Tags
  const tags = await Promise.all(
    TAG_NAMES.map((name) =>
      prisma.tag.upsert({ where: { name }, update: {}, create: { name } })
    )
  );

  // 50 users
  const users = await Promise.all(
    Array.from({ length: 50 }, (_, i) =>
      prisma.user.upsert({
        where: { email: `user${i}@test.com` },
        update: {},
        create: {
          name: `User ${i}`,
          email: `user${i}@test.com`,
          bio: `Bio for user ${i}`,
        },
      })
    )
  );

  // 100k posts in batches
  const BATCH = 500;
  for (let i = 0; i < 200; i++) {
    await Promise.all(
      Array.from({ length: BATCH }, (_, j) => {
        const idx = i * BATCH + j;
        const postTags = tags
          .sort(() => Math.random() - 0.5)
          .slice(0, Math.floor(Math.random() * 3) + 1);
        return prisma.post.create({
          data: {
            title: `Post ${idx}: ${postTags.map((t) => t.name).join(", ")}`,
            published: Math.random() > 0.3,
            viewCount: Math.floor(Math.random() * 10000),
            authorId: users[idx % users.length].id,
            tags: { connect: postTags.map((t) => ({ id: t.id })) },
          },
        });
      })
    );
    process.stdout.write(`\r${(i + 1) * BATCH} posts`);
  }

  console.log("\nDone.");
  await prisma.$disconnect();
}

main().catch(console.error);
