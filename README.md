This repo serves as benchmark codebase for the package [Prisma Smart Cache](https://github.com/uanela/prisma-smart-cache).

## How To Setup The Benchmark Environment:

1 - You have to fork and clone your repo.

2 - Then set `DATABASE_URL` under your .env

2.2 - You can run first a local test by setting `DATABASE_URL` to a local string and add a small delay between 50ms to 200ms or more, under [Prisma Proxy at src/index.js](https://github.com/Uanela/smart-cache-benchmark/blob/main/src/index.js#L30), so that you can simulate a real database in production.

2.3 - If you want to run it against an deployed db on different server you can set the string also under `DATABASE_URL` and do not add the delay on prisma calls because it is unneed and unrealistc in those situations.

3 - Run `npx prisma db push` to sync your schemas into the database.

4 - Run `pnpm seed` in order to fill the database with testing data.

5 - Then put your app listening on one terminal using `pnpm dev`, you can setup the PORT at https://github.com/Uanela/smart-cache-benchmark/blob/main/src/index.js#L93.

6 - After all of this you can then run `pnpm bench` which will start `autoconn` with the tests and show the results comparison when finished

6.1 - You can define some benchmark inputs such as number of connections and also the time for the benchmark to run at https://github.com/Uanela/smart-cache-benchmark/blob/main/src/run.js#L7.

After the tests has finished you will see something like: 

| Scenario | Req/s RAW | Req/s CACHE | p99 RAW | p99 CACHE | Errors | Gain |
|----------|-----------|------------|---------|-----------|--------|------|
| Point lookup (user by ID) | 9,433.2 | 24,369.8 | 60ms | 27ms | 0 | -55.0% |
| List with filter (posts by user) | 8,888.3 | 21,143.2 | 68ms | 34ms | 0 | -50.0% |
| Relation join (feed with author + tags) | 1,013.9 | 18,048.2 | 546ms | 33ms | 0 | -94.0% |
| Aggregates (counts + avg) | 841.6 | 19,961.1 | 644ms | 28ms | 0 | -95.7% |
| Mixed load (80% reads, 20% writes) | 8,393.9 | 18,405.1 | 115ms | 129ms | 0 | +12.2% |

---

## Understand The Results

| Metric | What it means |
|--------|---------------|
| **Req/s** | **Requests per second** — how many operations the system can handle each second. Higher = more throughput, more users served. |
| **p99** | **99th percentile latency** — 99% of requests were faster than this number. Lower = more consistent, fewer slow requests. (Example: p99 60ms means only 1 in 100 requests took longer than 60ms) |
| **Gain** | **p99 latency change** — negative means cache was faster, positive means cache was slower. Shows how much the slowest requests improved. |

## RAW vs CACHE

- **RAW** = Direct database queries (no caching layer)
- **CACHE** = Same queries but with a caching layer (like Redis) storing results


## How to read the benchmark

1. **Higher Req/s** = can handle more traffic
2. **Lower p99** = more reliable, fewer users waiting
3. **Negative Gain** = cache made the slow requests faster
4. **Positive Gain** = cache made the slow requests slower

**Example:**
> "p99 went from 60ms to 27ms, gain -55%"

Translation:
> The slowest 1% of requests dropped from 60 milliseconds to 27 milliseconds — cache made it 55% faster.
