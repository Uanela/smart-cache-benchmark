import autocannon from "autocannon";

const PORT = 8003;
const BASE = `http://localhost:${PORT}`;
const CONNECTIONS = 200;
const DURATION = 60;

// ─── Scenarios ─────────────────────────────────────────────────────────────

const SCENARIOS = [
  {
    name: "Point lookup (user by ID)",
    description: "Single record fetch by PK — best case for cache",
    raw: {
      url: BASE + "/raw",
      requests: Array.from({ length: 10 }, (_, i) => ({
        method: "GET",
        path: `/user/${(i % 50) + 1}`,
      })),
    },
    cached: {
      url: BASE + "/cached",
      requests: Array.from({ length: 10 }, (_, i) => ({
        method: "GET",
        path: `/user/${(i % 50) + 1}`,
      })),
    },
  },
  {
    name: "List with filter (posts by user)",
    description: "Filtered list — realistic read workload",
    raw: {
      url: BASE + "/raw",
      requests: Array.from({ length: 20 }, (_, i) => ({
        method: "GET",
        path: `/posts?userId=${(i % 50) + 1}`,
      })),
    },
    cached: {
      url: BASE + "/cached",
      requests: Array.from({ length: 20 }, (_, i) => ({
        method: "GET",
        path: `/posts?userId=${(i % 50) + 1}`,
      })),
    },
  },
  {
    name: "Relation join (feed with author + tags)",
    description: "JOIN query — expensive, great cache candidate",
    raw: {
      url: BASE + "/raw",
      requests: [{ method: "GET", path: "/feed" }],
    },
    cached: {
      url: BASE + "/cached",
      requests: [{ method: "GET", path: "/feed" }],
    },
  },
  {
    name: "Aggregates (counts + avg)",
    description: "Multiple aggregates — very expensive without cache",
    raw: {
      url: BASE + "/raw",
      requests: [{ method: "GET", path: "/stats" }],
    },
    cached: {
      url: BASE + "/cached",
      requests: [{ method: "GET", path: "/stats" }],
    },
  },
  {
    name: "Mixed load (80% reads, 20% writes)",
    description: "Write invalidations under real traffic",
    raw: {
      url: BASE + "/raw",
      requests: [
        ...Array.from({ length: 8 }, (_, i) => ({
          method: "GET",
          path: `/posts?userId=${(i % 50) + 1}`,
        })),
        {
          method: "PUT",
          path: "/users/1",
          body: JSON.stringify({ bio: `updated ${Date.now()}` }),
          headers: { "content-type": "application/json" },
        },
        {
          method: "PUT",
          path: "/users/2",
          body: JSON.stringify({ bio: `updated ${Date.now()}` }),
          headers: { "content-type": "application/json" },
        },
      ],
    },
    cached: {
      url: BASE + "/cached",
      requests: [
        ...Array.from({ length: 8 }, (_, i) => ({
          method: "GET",
          path: `/posts?userId=${(i % 50) + 1}`,
        })),
        {
          method: "PUT",
          path: "/users/1",
          body: JSON.stringify({ bio: `updated ${Date.now()}` }),
          headers: { "content-type": "application/json" },
        },
        {
          method: "PUT",
          path: "/users/2",
          body: JSON.stringify({ bio: `updated ${Date.now()}` }),
          headers: { "content-type": "application/json" },
        },
      ],
    },
  },
];

// ─── Runner ────────────────────────────────────────────────────────────────

function run(label, config) {
  return new Promise((resolve) => {
    process.stdout.write(`  ▸ ${label}... `);
    const instance = autocannon(
      {
        ...config,
        connections: CONNECTIONS,
        duration: DURATION,
        pipelining: 1,
      },
      (err, result) => {
        if (err) return resolve(null);
        process.stdout.write("done\n");
        resolve(result);
      }
    );
    // silence progress bar
    instance.on("done", () => {});
  });
}

function fmt(n, unit = "") {
  if (n === undefined || n === null) return "—";
  return n.toLocaleString("en-US", { maximumFractionDigits: 1 }) + unit;
}

function delta(raw, cached) {
  if (!raw || !cached) return "";
  const pct = ((cached - raw) / raw) * 100;
  const sign = pct >= 0 ? "+" : "";
  return `${sign}${pct.toFixed(1)}%`;
}

function printTable(results) {
  const COL = [28, 12, 12, 12, 12, 12, 10];
  const H = [
    "Scenario",
    "Req/s RAW",
    "Req/s CACHE",
    "p99 RAW",
    "p99 CACHE",
    "Errors",
    "Gain",
  ];
  const divider = COL.map((w) => "─".repeat(w)).join("┼");

  const pad = (s, w) => String(s).padEnd(w);

  console.log("\n" + COL.map((w, i) => pad(H[i], w)).join("│"));
  console.log(divider);

  for (const { scenario, raw, cached } of results) {
    const row = [
      pad(scenario.name.slice(0, 27), COL[0]),
      pad(raw ? fmt(raw.requests.average) : "ERR", COL[1]),
      pad(cached ? fmt(cached.requests.average) : "ERR", COL[2]),
      pad(raw ? fmt(raw.latency.p99, "ms") : "ERR", COL[3]),
      pad(cached ? fmt(cached.latency.p99, "ms") : "ERR", COL[4]),
      pad(cached ? fmt(cached.errors) : "ERR", COL[5]),
      pad(
        raw && cached ? delta(raw.latency.p99, cached.latency.p99) : "—",
        COL[6]
      ),
    ];
    console.log(row.join("│"));
  }

  console.log("\n  Gain = p99 latency change (negative = cache is faster)\n");
}

// ─── Main ──────────────────────────────────────────────────────────────────

async function main() {
  console.log(
    `\nBenchmark suite — ${CONNECTIONS} connections, ${DURATION}s per test`
  );
  console.log(`Target: ${BASE}\n`);

  const results = [];

  for (const scenario of SCENARIOS) {
    console.log(`\n[${scenario.name}]`);
    console.log(`  ${scenario.description}`);

    const raw = await run("RAW", scenario.raw);
    const cached = await run("CACHED", scenario.cached);

    results.push({ scenario, raw, cached });
  }

  printTable(results);

  // Raw dump for anything that errored
  for (const { scenario, raw, cached } of results) {
    if (cached?.errors > 0) {
      console.log(
        `⚠️  ${scenario.name}: ${cached.errors} errors on cached endpoint`
      );
    }
  }
}

main().catch(console.error);
