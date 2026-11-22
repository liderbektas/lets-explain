/**
 * Turns lesson narration into audio clips with ElevenLabs, then uploads them to Cloudflare R2.
 *
 *   npm run narrate -- docker/why-containers          one lesson
 *   npm run narrate -- docker                         every narrated lesson in a course
 *   npm run narrate -- docker --dry                   only count what would be made and uploaded
 *   npm run narrate -- docker --no-upload             make clips, do not upload
 *   npm run narrate -- docker --upload-only           upload clips already made, make none
 *   npm run narrate -- docker/why-containers --prune  also delete local clips no line uses any more
 *
 * Settings come from .env.local (never committed):
 *   ELEVENLABS_API_KEY                                  to make clips
 *   R2_ACCOUNT_ID, R2_BUCKET, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY   to upload them
 *
 * Clips go to site/public/audio/narration/<course>/<lesson>/<lang>/<clip>.mp3 (git ignores it) and
 * to the same path in the bucket. A clip that already exists is skipped, locally and in the bucket,
 * so only new or changed lines spend credits or upload time. Lessons run in course order, so when
 * credits run out the opening lessons are the ones finished.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { AwsClient } from "aws4fetch";
import { NARRATOR, allLines, clipDir, clipName, spoken } from "../packages/core/src/course/narration.ts";

const ROOT = new URL("..", import.meta.url).pathname;
const PUBLIC = join(ROOT, "site/public");
const FORMAT = "mp3_44100_96";
const PARALLEL = 3;
/** Clip names come from their words, so a clip never changes: browsers may keep it for a year. */
const CACHE = "public, max-age=31536000, immutable";

const args = process.argv.slice(2);
const dry = args.includes("--dry");
const prune = args.includes("--prune");
const uploadOnly = args.includes("--upload-only");
const noUpload = args.includes("--no-upload");
const targets = args.filter((a: string) => !a.startsWith("--"));

if (targets.length === 0) {
  console.error("Which lessons? e.g.  npm run narrate -- docker/why-containers");
  process.exit(1);
}

/** A course's lesson slugs in the order its course.ts lists them. */
function courseOrder(course: string): string[] {
  const file = join(ROOT, "courses", course, "src/course.ts");
  if (!existsSync(file)) return [];
  return [...readFileSync(file, "utf8").matchAll(/entry\("([a-z0-9-]+)"/g)].map((m) => m[1]!);
}

/** Every lesson folder with a narration.ts, as "course/lesson", in course order. */
function narratedLessons(): string[] {
  const out: string[] = [];
  for (const course of readdirSync(join(ROOT, "courses")).sort()) {
    const lessons = join(ROOT, "courses", course, "src/lessons");
    if (!existsSync(lessons)) continue;
    const order = courseOrder(course);
    const rank = (slug: string) => (order.includes(slug) ? order.indexOf(slug) : order.length);
    const found = readdirSync(lessons).filter((lesson) => existsSync(join(lessons, lesson, "narration.ts")));
    for (const lesson of found.sort((a, b) => rank(a) - rank(b) || a.localeCompare(b))) out.push(`${course}/${lesson}`);
  }
  return out;
}

const chosen = narratedLessons().filter((id) => targets.some((t: string) => id === t || id.startsWith(`${t}/`)));
if (chosen.length === 0) {
  console.error(`No narration found for: ${targets.join(", ")}. Narrated lessons: ${narratedLessons().join(", ") || "none"}`);
  process.exit(1);
}

interface Clip {
  text: string;
  lang: string;
  /** Path under site/public, which is also the key in the bucket. */
  key: string;
  file: string;
}

const clips: Clip[] = [];
for (const id of chosen) {
  const [course, lesson] = id.split("/") as [string, string];
  const mod = await import(pathToFileURL(join(ROOT, "courses", course, "src/lessons", lesson, "narration.ts")).href);
  for (const [lang, steps] of Object.entries(mod.narration ?? {})) {
    if (!steps) continue;
    const dirKey = clipDir(course, lesson, lang as "tr");
    const wanted = new Set<string>();
    for (const text of allLines(steps as never)) {
      const key = `${dirKey}/${clipName(text, lang as "tr")}.mp3`;
      wanted.add(key);
      clips.push({ text, lang, key, file: join(PUBLIC, key) });
    }
    const dir = join(PUBLIC, dirKey);
    if (prune && existsSync(dir)) {
      for (const f of readdirSync(dir)) {
        if (f.endsWith(".mp3") && !wanted.has(`${dirKey}/${f}`)) {
          if (!dry) rmSync(join(dir, f));
          console.log(`${dry ? "would delete" : "deleted"} ${dirKey}/${f}`);
        }
      }
    }
  }
}

/* ------------------------------------------------------------------ making clips */

const missing = clips.filter((c) => !existsSync(c.file));
const jobs = uploadOnly ? [] : missing;
const chars = missing.reduce((n, j) => n + spoken(j.text, j.lang as "tr").length, 0);
console.log(
  `${chosen.length} lessons: ${clips.length - missing.length} clips made, ${missing.length} still to make (${chars} characters)${uploadOnly ? ", not making any now" : ""}. Voice ${NARRATOR.voice}, model ${NARRATOR.model}.`,
);

const key = process.env.ELEVENLABS_API_KEY;
if (!dry && jobs.length > 0 && !key) {
  console.error("ELEVENLABS_API_KEY is missing. Put it in .env.local at the project root:\n  ELEVENLABS_API_KEY=...");
  process.exit(1);
}

async function speak(job: Clip): Promise<void> {
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${NARRATOR.voice}?output_format=${FORMAT}`, {
      method: "POST",
      headers: { "xi-api-key": key!, "Content-Type": "application/json", Accept: "audio/mpeg" },
      body: JSON.stringify({ text: spoken(job.text, job.lang as "tr"), model_id: NARRATOR.model }),
    });
    if (res.ok) {
      mkdirSync(join(job.file, ".."), { recursive: true });
      // Write beside the target, then rename, so an interrupted run never leaves half a clip.
      writeFileSync(`${job.file}.part`, Buffer.from(await res.arrayBuffer()));
      renameSync(`${job.file}.part`, job.file);
      return;
    }
    const body = await res.text();
    if ((res.status === 429 || res.status >= 500) && attempt < 5) {
      const wait = Number(res.headers.get("retry-after")) * 1000 || 2000 * attempt;
      await new Promise((r) => setTimeout(r, wait));
      continue;
    }
    throw new Error(`ElevenLabs ${res.status} for "${job.text.slice(0, 60)}…": ${body.slice(0, 300)}`);
  }
}

/** Runs `work` over `items`, a few at a time, printing a counter. Stops at the first error. */
async function inParallel<T>(items: T[], label: string, work: (item: T) => Promise<void>): Promise<void> {
  let done = 0;
  const queue = [...items];
  await Promise.all(
    Array.from({ length: PARALLEL }, async () => {
      for (let item = queue.shift(); item; item = queue.shift()) {
        await work(item);
        done++;
        process.stdout.write(`\r${done}/${items.length} ${label}`);
      }
    }),
  );
  if (items.length) process.stdout.write("\n");
}

let failed = false;
if (!dry && jobs.length > 0) {
  try {
    await inParallel(jobs, "clips made", speak);
  } catch (err) {
    // Keep going to the upload: whatever was made before the error is worth sending.
    failed = true;
    console.error(`\n${err instanceof Error ? err.message : err}`);
    console.error("Clips made so far are kept; run the same command again to continue.");
  }
}

/* ------------------------------------------------------------------ uploading to R2 */

const r2 = {
  account: process.env.R2_ACCOUNT_ID,
  bucket: process.env.R2_BUCKET,
  id: process.env.R2_ACCESS_KEY_ID,
  secret: process.env.R2_SECRET_ACCESS_KEY,
};

if (noUpload) process.exit(failed ? 1 : 0);
if (!r2.account || !r2.bucket || !r2.id || !r2.secret) {
  console.log("R2 settings are not in .env.local, so nothing was uploaded (R2_ACCOUNT_ID, R2_BUCKET, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY).");
  process.exit(failed ? 1 : 0);
}

const aws = new AwsClient({ accessKeyId: r2.id, secretAccessKey: r2.secret, service: "s3", region: "auto" });
const bucketUrl = `https://${r2.account}.r2.cloudflarestorage.com/${r2.bucket}`;

/** Every key already in the bucket under a prefix (ListObjectsV2, page by page). */
async function listKeys(prefix: string): Promise<Set<string>> {
  const keys = new Set<string>();
  let token: string | undefined;
  do {
    const query = new URLSearchParams({ "list-type": "2", prefix, ...(token ? { "continuation-token": token } : {}) });
    const res = await aws.fetch(`${bucketUrl}?${query}`);
    if (!res.ok) throw new Error(`R2 list ${res.status}: ${(await res.text()).slice(0, 300)}`);
    const xml = await res.text();
    for (const m of xml.matchAll(/<Key>([^<]+)<\/Key>/g)) keys.add(m[1]!);
    token = /<IsTruncated>true<\/IsTruncated>/.test(xml) ? /<NextContinuationToken>([^<]+)</.exec(xml)?.[1] : undefined;
  } while (token);
  return keys;
}

async function upload(clip: Clip): Promise<void> {
  for (let attempt = 1; ; attempt++) {
    const res = await aws.fetch(`${bucketUrl}/${clip.key}`, {
      method: "PUT",
      body: readFileSync(clip.file),
      headers: { "Content-Type": "audio/mpeg", "Cache-Control": CACHE },
    });
    if (res.ok) return;
    const body = await res.text();
    if ((res.status === 429 || res.status >= 500) && attempt < 5) {
      await new Promise((r) => setTimeout(r, 1500 * attempt));
      continue;
    }
    throw new Error(`R2 upload ${res.status} for ${clip.key}: ${body.slice(0, 300)}`);
  }
}

try {
  const inBucket = new Set<string>();
  for (const prefix of new Set(clips.map((c) => c.key.split("/").slice(0, 3).join("/") + "/"))) {
    for (const k of await listKeys(prefix)) inBucket.add(k);
  }
  const made = clips.filter((c) => existsSync(c.file));
  const toSend = made.filter((c) => !inBucket.has(c.key));
  console.log(`R2 bucket ${r2.bucket}: ${toSend.length} clips to upload, ${made.length - toSend.length} already there, ${clips.length - made.length} not made yet.`);
  if (!dry) await inParallel(toSend, "clips uploaded", upload);
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
}
process.exit(failed ? 1 : 0);
