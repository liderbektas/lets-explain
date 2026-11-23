import { describe, expect, it } from "vitest";
import { typeLines } from "@lets-explain/core/components/TypedSandbox";
import { createBroker, depth } from "./broker";
import { applyAll, project, rabbitShell, type Files, type Project } from "./cli";

const SETUP = `import amqp from "amqplib";

const conn = await amqp.connect("amqp://localhost");
const ch = await conn.createChannel();

await ch.assertExchange("logs", "direct");
await ch.assertQueue("errors");
await ch.assertQueue("all-logs");

await ch.bindQueue("errors", "logs", "error");
for (const sev of ["info", "warning", "error"]) {
  await ch.bindQueue("all-logs", "logs", sev);
}

await conn.close();`;

const PUBLISH = `import amqp from "amqplib";

const conn = await amqp.connect("amqp://localhost");
const ch = await conn.createChannel();
ch.publish("logs", "error", Buffer.from("disk full"));
await conn.close();`;

const WORKER = `import amqp from "amqplib";

const conn = await amqp.connect("amqp://localhost");
const ch = await conn.createChannel();

await ch.prefetch(1);
await ch.consume("errors", (msg) => {
  console.log(\` [x] \${msg.content}\`);
  ch.ack(msg);
});
console.log(" [*] Waiting for messages. To exit press CTRL+C");`;

const start = (files: Files): Project => project(createBroker(), files);
const type = (p: Project, typed: string[], edits: ((t: string) => string)[] = []) => typeLines(rabbitShell, applyAll, p, typed, edits);

describe("rabbitmq cli", () => {
  it("runs a setup script: exchange, queues, bindings in a loop", () => {
    const r = type(start({ "setup.js": SETUP }), ["node setup.js"]);
    expect(r.output).toEqual([]);
    expect(r.state.broker.exchanges.logs?.type).toBe("direct");
    expect(r.state.broker.bindings.filter((b) => b.queue === "all-logs").map((b) => b.key)).toEqual(["info", "warning", "error"]);
    expect(r.moves).toBe(1);
  });

  it("lists queues and bindings like rabbitmqctl, with or without docker exec", () => {
    const r = type(start({ "setup.js": SETUP, "publish.js": PUBLISH }), ["node setup.js", "node publish.js", "docker exec rabbitmq rabbitmqctl list_queues name messages"]);
    expect(r.output.slice(-3)).toEqual(["name\tmessages", "all-logs\t1", "errors\t1"]);
    const b = type(r.state, ["rabbitmqctl list_bindings source_name destination_name routing_key"]);
    expect(b.output).toContain("logs\terrors\terror");
    expect(b.output).toContain("\terrors\terrors");
  });

  it("crashes with amqplib's channel error for a missing exchange, at the line that published", () => {
    const r = type(start({ "publish.js": PUBLISH }), ["node publish.js"]);
    expect(r.output).toContain(`Error: Channel closed by server: 404 (NOT-FOUND) with message "NOT_FOUND - no exchange 'logs' in vhost '/'"`);
    expect(r.output).toContain("/home/you/shop/publish.js:5");
    expect(r.output).toContain('ch.publish("logs", "error", Buffer.from("disk full"));');
    expect(r.output.at(-1)).toBe("Node.js v22.12.0");
  });

  it("keeps a worker in the background that acks each message as it comes", () => {
    const r = type(start({ "setup.js": SETUP, "publish.js": PUBLISH, "worker.js": WORKER }), ["node setup.js", "node worker.js", "node publish.js", "node publish.js"]);
    expect(r.output).toContain(" [*] Waiting for messages. To exit press CTRL+C");
    expect(r.output.filter((l) => l === " [x] disk full")).toHaveLength(2);
    expect(depth(r.state.broker, "errors").total).toBe(0);
    expect(depth(r.state.broker, "all-logs").total).toBe(2);
    const jobs = type(r.state, ["jobs"]);
    expect(jobs.output[0]).toMatch(/node worker\.js/);
  });

  it("holds messages when the callback forgets to ack, and returns them when the worker stops", () => {
    const lazy = WORKER.replace("  ch.ack(msg);\n", "");
    expect(lazy).not.toBe(WORKER);
    const r = type(start({ "setup.js": SETUP, "publish.js": PUBLISH, "worker.js": lazy }), ["node setup.js", "node worker.js", "node publish.js"]);
    expect(depth(r.state.broker, "errors")).toMatchObject({ ready: 0, unacked: 1 });
    const stopped = type(r.state, ["pkill -f worker.js"]);
    expect(depth(stopped.state.broker, "errors")).toMatchObject({ ready: 1, unacked: 0 });
    expect(stopped.state.workers).toEqual({});
  });

  it("edits a file in nano and runs the new version", () => {
    const r = type(start({ "setup.js": SETUP }), ["nano setup.js", "node setup.js"], [(t) => t.replace('"logs", "error");\nfor', '"logs", "critical");\nfor')]);
    expect(r.state.broker.bindings.some((b) => b.queue === "errors" && b.key === "critical")).toBe(true);
    expect(r.moves).toBe(2);
  });

  it("refuses a redeclare with other settings, as RabbitMQ does", () => {
    const again = SETUP.replace('await ch.assertQueue("errors");', 'await ch.assertQueue("errors", { durable: false });');
    expect(again).not.toBe(SETUP);
    const r = type(start({ "setup.js": SETUP, "again.js": again }), ["node setup.js", "node again.js"]);
    expect(r.output).toContain(
      `Error: Operation failed: QueueDeclare; 406 (PRECONDITION-FAILED) with message "PRECONDITION_FAILED - inequivalent arg 'durable' for queue 'errors' in vhost '/': received 'false' but current is 'true'"`,
    );
  });

  it("says plainly what it cannot run", () => {
    const r = type(start({ "x.js": 'import amqp from "amqplib";\nwhile (true) {}' }), ["node x.js"]);
    expect(r.output.at(-1)).toMatch(/this sandbox runs the amqplib calls.*it cannot run: while loops\)$/);
    expect(type(start({}), ["rabbitmqctl frob"]).output[0]).toBe("Command 'frob' not found.");
  });

  it("restarts the broker: non-durable queues and their workers are gone", () => {
    const transient = SETUP.replace(/\("(logs|errors|all-logs)"(, "direct")?\);/g, '("$1"$2, { durable: false });');
    expect(transient.match(/durable: false/g)).toHaveLength(3);
    const r = type(start({ "setup.js": transient, "worker.js": WORKER }), ["node setup.js", "node worker.js", "docker restart rabbitmq"]);
    expect(r.state.broker.queues).toEqual({});
    expect(r.state.workers).toEqual({});
  });
});
