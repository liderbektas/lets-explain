import { describe, expect, it } from "vitest";
import { typeLines } from "@lets-explain/core/components/TypedSandbox";
import { createBroker, depth } from "./broker";
import { applyAll, project, rabbitShell, type Files, type Project } from "./cli";
import { Interp, JsSyntaxError, parse } from "./js";

/** Runs plain JavaScript and returns what it logged. */
function logs(source: string): string[] {
  const out: string[] = [];
  new Interp({ module: () => undefined, log: (t) => out.push(t) }, "x.js", source).run(parse(source));
  return out;
}

const run = (files: Files, typed: string[]): { p: Project; out: string[] } => {
  const r = typeLines(rabbitShell, applyAll, project(createBroker(), files), typed);
  return { p: r.state, out: r.output };
};

const SETUP = `import amqp from "amqplib";
const conn = await amqp.connect("amqp://localhost");
const ch = await conn.createChannel();
await ch.assertQueue("orders");
await conn.close();`;

/** A worker file: connection lines, then `body`. */
const workerFile = (body: string) => `import amqp from "amqplib";
const conn = await amqp.connect("amqp://localhost");
const ch = await conn.createChannel();
${body}`;

const SEND3 = `import amqp from "amqplib";
const conn = await amqp.connect("amqp://localhost");
const ch = await conn.createChannel();
for (const o of ["o1", "BROKEN", "o2"]) ch.sendToQueue("orders", Buffer.from(o));
await conn.close();`;

describe("the JavaScript reader", () => {
  it("runs the everyday language: template literals, loops, objects, functions", () => {
    expect(
      logs(`
const names = ["a", "b"];
let n = 0;
for (let i = 0; i < 3; i++) n += i;
const o = { names, n, nested: { "x-match": "all" } };
function twice(x) { return x * 2; }
const add = (a, b = 1) => a + b;
console.log(\`\${names.join("-")} \${n} \${twice(n)} \${add(1)}\`);
console.log("%s has %d", "queue", 3);
console.log(o);
console.log(Buffer.from("hi"), JSON.stringify({ a: [1, "x"] }));
`),
    ).toEqual(["a-b 3 6 2", "queue has 3", "{ names: [ 'a', 'b' ], n: 3, nested: { 'x-match': 'all' } }", '<Buffer 68 69> {"a":[1,"x"]}']);
  });

  it("parses the variations people write: quotes, no semicolons, trailing commas, comments, let/var", () => {
    expect(
      logs(`
// a comment
var a = 'single' /* inline */
let b = "double",
  c = \`tpl\`
const opts = {
  durable: true,
  arguments: { "x-queue-type": "quorum", },
}
if (opts.durable) console.log(a, b, c, opts.arguments["x-queue-type"],)
else console.log("no")
`),
    ).toEqual(["single double tpl quorum"]);
  });

  it("async functions, await, promises and timers run in order", () => {
    expect(
      logs(`
async function main() {
  const v = await Promise.resolve(2);
  console.log("in main", v);
  return v + 1;
}
main().then((v) => console.log("then", v));
setTimeout(() => console.log("timer"), 500);
(async () => { console.log("iife"); })();
await new Promise((resolve) => setTimeout(resolve, 100));
console.log("after wait");
`),
    ).toEqual(["in main 2", "then 3", "iife", "after wait", "timer"]);
  });

  it("try/catch catches what is thrown; destructuring works", () => {
    expect(
      logs(`
try {
  throw new Error("boom");
} catch (err) {
  console.log("caught", err.message);
}
const { queue, messageCount = 0 } = { queue: "q1" };
const [first, ...others] = [1, 2, 3];
console.log(queue, messageCount, first, others.length);
`),
    ).toEqual(["caught boom", "q1 0 1 2"]);
  });

  it("reports syntax errors with their line", () => {
    expect(() => parse('const a = 1;\nconst b = (;\n')).toThrow(JsSyntaxError);
    try {
      parse('const a = 1;\nch.publish("x", "y"\n');
    } catch (e) {
      expect((e as JsSyntaxError).line).toBe(3);
    }
  });

  it("assigning to a const is a TypeError, an unknown name a ReferenceError", () => {
    expect(() => logs("const a = 1;\na = 2;")).toThrow(/Assignment to constant variable/);
    expect(() => logs("console.log(nope);")).toThrow(/nope is not defined/);
  });
});

describe("amqplib in the sandbox: the ways people write it", () => {
  it("CommonJS with an async main(), no semicolons, single quotes", () => {
    const file = `const amqp = require('amqplib')

async function main() {
  const conn = await amqp.connect('amqp://localhost')
  const ch = await conn.createChannel()
  await ch.assertQueue('orders', { durable: true, })
  ch.sendToQueue('orders', Buffer.from('o1'), { persistent: true })
  await conn.close()
}

main().catch(console.error)`;
    const { p, out } = run({ "send.js": file }, ["node send.js"]);
    expect(out).toEqual([]);
    expect(p.broker.queues.orders!.ready.map((m) => [m.body, m.persistent])).toEqual([["o1", true]]);
  });

  it("named and namespace imports, .then chains, and an un-awaited declare", () => {
    const named = `import { connect } from "amqplib";
const conn = await connect();
const ch = await conn.createChannel();
ch.assertQueue("a");
ch.sendToQueue("a", Buffer.from("x"));`;
    const chain = `import * as amqp from "amqplib";
amqp.connect("amqp://localhost")
  .then((conn) => conn.createChannel())
  .then((ch) => ch.assertQueue("b").then(() => ch.sendToQueue("b", Buffer.from("y"))));`;
    const { p } = run({ "named.js": named, "chain.js": chain }, ["node named.js", "node chain.js"]);
    expect(depth(p.broker, "a").ready).toBe(1);
    expect(depth(p.broker, "b").ready).toBe(1);
  });

  it("deliveryMode: 2 is persistent too; expiration and headers are read", () => {
    const file = workerFile(`await ch.assertQueue("q");
ch.sendToQueue("q", Buffer.from("m"), { deliveryMode: 2, expiration: "3000", headers: { kind: "x" } });`);
    const { p } = run({ "s.js": file }, ["node s.js"]);
    expect(p.broker.queues.q!.ready[0]).toMatchObject({ persistent: true, ttl: 3, headers: { kind: "x" } });
  });

  it("amqplib's defaults: queues and exchanges are durable unless told otherwise", () => {
    const file = workerFile(`await ch.assertExchange("e", "fanout");
await ch.assertQueue("q");
await ch.assertQueue("t", { durable: false });
await ch.bindQueue("q", "e");`);
    const { p } = run({ "s.js": file }, ["node s.js"]);
    expect(p.broker.exchanges.e!.durable).toBe(true);
    expect(p.broker.queues.q!.durable).toBe(true);
    expect(p.broker.queues.t!.durable).toBe(false);
    // With no pattern, amqplib binds with an empty routing key.
    expect(p.broker.bindings).toEqual([expect.objectContaining({ exchange: "e", queue: "q", key: "" })]);
  });

  it("names the usual mistakes the way Node and amqplib do", () => {
    const noAwait = workerFile("").replace("await amqp.connect", "amqp.connect");
    const r1 = run({ "a.js": `${noAwait}` }, ["node a.js"]);
    expect(r1.out).toContain("TypeError: conn.createChannel is not a function");
    const oldApi = workerFile(`ch.basic_publish("", "orders", Buffer.from("x"));`);
    expect(run({ "b.js": oldApi }, ["node b.js"]).out).toContain("TypeError: ch.basic_publish is not a function");
    const str = workerFile(`await ch.assertQueue("q");\nch.sendToQueue("q", "hello");`);
    expect(run({ "c.js": str }, ["node c.js"]).out).toContain("TypeError: content is not a buffer");
    const syntax = run({ "d.js": workerFile(`ch.sendToQueue("q", Buffer.from("x")`) }, ["node d.js"]);
    expect(syntax.out[0]).toBe("/home/you/shop/d.js:4");
    expect(syntax.out).toContain("SyntaxError: Unexpected end of input");
    expect(run({}, ["node nope.js"]).out).toContain("Error: Cannot find module '/home/you/shop/nope.js'");
    expect(run({}, ["python send.py"]).out).toEqual(["bash: python: command not found"]);
  });

  it("a channel error can be caught; the channel is closed afterwards", () => {
    const file = workerFile(`try {
  await ch.checkQueue("missing");
} catch (err) {
  console.log("no queue:", err.code);
}
await ch.assertQueue("q");`);
    const { out } = run({ "s.js": file }, ["node s.js"]);
    expect(out).toContain("no queue: 404");
    expect(out).toContain("IllegalOperationError: Channel closed");
  });

  it("process.exit ends the file there", () => {
    const file = workerFile(`console.log("one");\nprocess.exit(0);\nconsole.log("two");`);
    expect(run({ "s.js": file }, ["node s.js"]).out).toEqual(["one"]);
  });
});

describe("amqplib in the sandbox: reading consume callbacks", () => {
  const consumers = (worker: string) => {
    const r = run({ "setup.js": SETUP, "send.js": SEND3, "worker.js": workerFile(worker) }, ["node setup.js", "node worker.js", "node send.js"]);
    return { ...r, w: r.p.workers.worker, c: r.p.broker.consumers.worker };
  };

  it("an inline arrow with ch.ack acks everything", () => {
    const { p, out } = consumers(`await ch.consume("orders", (msg) => {
  console.log(" [x] %s", msg.content.toString());
  ch.ack(msg);
}, { noAck: false });`);
    expect(out.filter((l) => l.startsWith(" [x]"))).toEqual([" [x] o1", " [x] BROKEN", " [x] o2"]);
    expect(depth(p.broker, "orders").total).toBe(0);
  });

  it("a named async function declared after consume (hoisted), with a const for the text", () => {
    const { w, out } = consumers(`await ch.consume("orders", handle);

async function handle(msg) {
  const text = msg.content.toString();
  console.log("got " + text, msg.content);
  if (text === "BROKEN") {
    ch.nack(msg, false, false);
    return;
  }
  ch.ack(msg);
}`);
    expect(w).toMatchObject({ verdict: "ack", rules: [{ match: "BROKEN", exact: true, verdict: "drop" }] });
    expect(out).toContain("got o1 <Buffer 6f 31>");
  });

  it("forgetting the ack holds messages; noAck: true makes an auto-ack consumer", () => {
    const lazy = consumers(`await ch.consume("orders", (msg) => {\n  console.log(msg.content.toString());\n});`);
    expect(depth(lazy.p.broker, "orders")).toMatchObject({ ready: 0, unacked: 3 });
    const auto = consumers(`await ch.consume("orders", (msg) => console.log(msg.content.toString()), { noAck: true });`);
    expect(auto.c!.autoAck).toBe(true);
  });

  it("nack and reject: requeue unless the requeue argument is false", () => {
    expect(consumers(`await ch.consume("orders", (m) => ch.reject(m));`).w!.verdict).toBe("requeue");
    expect(consumers(`await ch.consume("orders", (m) => ch.reject(m, false));`).w!.verdict).toBe("drop");
    expect(consumers(`await ch.consume("orders", (m) => { ch.nack(m) });`).w!.verdict).toBe("requeue");
    expect(consumers(`await ch.consume("orders", (m) => { ch.nack(m, false, false) });`).w!.verdict).toBe("drop");
    expect(consumers(`const REQUEUE = false;\nawait ch.consume("orders", (m) => { ch.nack(m, false, REQUEUE) });`).w!.verdict).toBe("drop");
  });

  it("amqplib's README style: the work inside an `if (msg !== null)` guard counts", () => {
    const { w, p } = consumers(`ch.consume("orders", function (msg) {
  if (msg !== null) {
    console.log("Received:", msg.content.toString());
    ch.ack(msg);
  } else {
    console.log("Consumer cancelled by server");
  }
});`);
    expect(w).toMatchObject({ verdict: "ack", rules: [], prints: ["Received: {text}"] });
    expect(depth(p.broker, "orders").total).toBe(0);
  });

  it("if / else if / else and .includes() become rules", () => {
    const { w } = consumers(`await ch.consume("orders", (msg) => {
  const body = msg.content.toString();
  if (body.includes("BROK")) ch.reject(msg, false);
  else if ("o2" === body) ch.nack(msg);
  else ch.ack(msg);
});`);
    expect(w).toMatchObject({
      verdict: "ack",
      rules: [
        { match: "BROK", exact: false, verdict: "drop" },
        { match: "o2", exact: true, verdict: "requeue" },
      ],
    });
  });

  it("slow work: await sleep(ms), a Promise around setTimeout, or the tutorial's setTimeout(ack)", () => {
    const sleep = consumers(`import { setTimeout as sleep } from "node:timers/promises";
await ch.consume("orders", async (msg) => {
  await sleep(2000);
  ch.ack(msg);
});`);
    expect(sleep.w).toMatchObject({ slow: 2, verdict: "ack" });
    const promise = consumers(`await ch.consume("orders", async (msg) => {
  await new Promise((r) => setTimeout(r, 3000));
  ch.ack(msg);
});`);
    expect(promise.w).toMatchObject({ slow: 3, verdict: "ack" });
    const tutorial = consumers(`await ch.consume("orders", function (msg) {
  const secs = 1;
  setTimeout(function () {
    console.log(" [x] Done");
    ch.ack(msg);
  }, secs * 1000);
});`);
    expect(tutorial.w).toMatchObject({ slow: 1, verdict: "ack", prints: [" [x] Done"] });
  });

  it("a try block's ack counts; the catch does not decide the verdict", () => {
    const { w } = consumers(`await ch.consume("orders", async (msg) => {
  try {
    console.log(\`working on \${msg.content}\`);
    ch.ack(msg);
  } catch (err) {
    ch.nack(msg, false, false);
  }
});`);
    expect(w).toMatchObject({ verdict: "ack", prints: ["working on {text}"] });
  });

  it("an RPC server with destructured properties answers to replyTo with the correlation id", () => {
    const { w } = consumers(`await ch.consume("orders", (msg) => {
  const { replyTo, correlationId } = msg.properties;
  ch.sendToQueue(replyTo, Buffer.from("42"), { correlationId });
  ch.ack(msg);
});`);
    expect(w!.reply).toEqual({ body: "42", to: null, corr: true });
    const echo = consumers(`await ch.consume("orders", (msg) => {
  ch.publish("", msg.properties.replyTo, Buffer.from(msg.content.toString().toUpperCase()));
  ch.ack(msg);
});`);
    expect(echo.w!.reply).toEqual({ body: null, to: null, corr: false });
  });

  it("the file keeps running in the background until the connection closes", () => {
    const kept = consumers(`await ch.consume("orders", (m) => ch.ack(m));`);
    expect(kept.out.some((l) => l.includes("node keeps running"))).toBe(true);
    const closed = consumers(`await ch.consume("orders", (m) => ch.ack(m));\nawait conn.close();`);
    expect(closed.p.workers).toEqual({});
    expect(depth(closed.p.broker, "orders").ready).toBe(3);
  });
});
