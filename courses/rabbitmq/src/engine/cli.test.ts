import { describe, expect, it } from "vitest";
import { typeLines } from "@lets-explain/core/components/TypedSandbox";
import { createBroker, depth } from "./broker";
import { applyAll, project, rabbitShell, type Files, type Project } from "./cli";

const SETUP = `import pika

connection = pika.BlockingConnection(pika.ConnectionParameters("localhost"))
ch = connection.channel()

ch.exchange_declare(exchange="logs", exchange_type="direct", durable=True)
ch.queue_declare(queue="errors", durable=True)
ch.queue_declare(queue="all-logs", durable=True)

ch.queue_bind(queue="errors", exchange="logs", routing_key="error")
for sev in ["info", "warning", "error"]:
    ch.queue_bind(queue="all-logs", exchange="logs", routing_key=sev)

connection.close()`;

const PUBLISH = `import pika

connection = pika.BlockingConnection(pika.ConnectionParameters("localhost"))
ch = connection.channel()
ch.basic_publish(exchange="logs", routing_key="error", body=b"disk full")
connection.close()`;

const WORKER = `import pika

connection = pika.BlockingConnection(pika.ConnectionParameters("localhost"))
ch = connection.channel()

def callback(ch, method, properties, body):
    print(f" [x] {body.decode()}")
    ch.basic_ack(delivery_tag=method.delivery_tag)

ch.basic_qos(prefetch_count=1)
ch.basic_consume(queue="errors", on_message_callback=callback)
ch.start_consuming()`;

const start = (files: Files): Project => project(createBroker(), files);
const type = (p: Project, typed: string[], edits: ((t: string) => string)[] = []) => typeLines(rabbitShell, applyAll, p, typed, edits);

describe("rabbitmq cli", () => {
  it("runs a setup script: exchange, queues, bindings in a loop", () => {
    const r = type(start({ "setup.py": SETUP }), ["python setup.py"]);
    expect(r.output).toEqual([]);
    expect(r.state.broker.exchanges.logs?.type).toBe("direct");
    expect(r.state.broker.bindings.filter((b) => b.queue === "all-logs").map((b) => b.key)).toEqual(["info", "warning", "error"]);
    expect(r.moves).toBe(1);
  });

  it("lists queues and bindings like rabbitmqctl, with or without docker exec", () => {
    const r = type(start({ "setup.py": SETUP, "publish.py": PUBLISH }), ["python setup.py", "python publish.py", "docker exec rabbitmq rabbitmqctl list_queues name messages"]);
    expect(r.output.slice(-3)).toEqual(["name\tmessages", "all-logs\t1", "errors\t1"]);
    const b = type(r.state, ["rabbitmqctl list_bindings source_name destination_name routing_key"]);
    expect(b.output).toContain("logs\terrors\terror");
    expect(b.output).toContain("\terrors\terrors");
  });

  it("raises pika's channel error for a missing exchange, with a traceback", () => {
    const r = type(start({ "publish.py": PUBLISH }), ["python publish.py"]);
    expect(r.output.at(-1)).toBe(`pika.exceptions.ChannelClosedByBroker: (404, "NOT_FOUND - no exchange 'logs' in vhost '/'")`);
    expect(r.output).toContain('  File "/home/you/shop/publish.py", line 5, in <module>');
  });

  it("keeps a worker in the background that acks each message as it comes", () => {
    const r = type(start({ "setup.py": SETUP, "publish.py": PUBLISH, "worker.py": WORKER }), ["python setup.py", "python worker.py", "python publish.py", "python publish.py"]);
    expect(r.output).toContain(" [*] Waiting for messages. To exit press CTRL+C");
    expect(r.output.filter((l) => l === " [x] disk full")).toHaveLength(2);
    expect(depth(r.state.broker, "errors").total).toBe(0);
    expect(depth(r.state.broker, "all-logs").total).toBe(2);
    const jobs = type(r.state, ["jobs"]);
    expect(jobs.output[0]).toMatch(/python worker\.py/);
  });

  it("holds messages when the callback forgets to ack, and returns them when the worker stops", () => {
    const lazy = WORKER.replace("    ch.basic_ack(delivery_tag=method.delivery_tag)\n", "");
    const r = type(start({ "setup.py": SETUP, "publish.py": PUBLISH, "worker.py": lazy }), ["python setup.py", "python worker.py", "python publish.py"]);
    expect(depth(r.state.broker, "errors")).toMatchObject({ ready: 0, unacked: 1 });
    const stopped = type(r.state, ["pkill -f worker.py"]);
    expect(depth(stopped.state.broker, "errors")).toMatchObject({ ready: 1, unacked: 0 });
    expect(stopped.state.workers).toEqual({});
  });

  it("edits a file in nano and runs the new version", () => {
    const r = type(start({ "setup.py": SETUP }), ["nano setup.py", "python setup.py"], [(t) => t.replace('routing_key="error")\nfor', 'routing_key="critical")\nfor')]);
    expect(r.state.broker.bindings.some((b) => b.queue === "errors" && b.key === "critical")).toBe(true);
    expect(r.moves).toBe(2);
  });

  it("refuses a redeclare with other settings, as RabbitMQ does", () => {
    const again = SETUP.replace('ch.queue_declare(queue="errors", durable=True)', 'ch.queue_declare(queue="errors")');
    const r = type(start({ "setup.py": SETUP, "again.py": again }), ["python setup.py", "python again.py"]);
    expect(r.output.at(-1)).toContain("PRECONDITION_FAILED - inequivalent arg 'durable' for queue 'errors'");
  });

  it("says plainly what it cannot run", () => {
    const r = type(start({ "x.py": "import pika\nwhile True:\n    pass" }), ["python x.py"]);
    expect(r.output.at(-1)).toMatch(/this sandbox runs the pika calls/);
    expect(type(start({}), ["rabbitmqctl frob"]).output[0]).toBe("Command 'frob' not found.");
  });

  it("restarts the broker: non-durable queues and their workers are gone", () => {
    const transient = SETUP.replace(/, durable=True\)/g, ")");
    const r = type(start({ "setup.py": transient, "worker.py": WORKER }), ["python setup.py", "python worker.py", "docker restart rabbitmq"]);
    expect(r.state.broker.queues).toEqual({});
    expect(r.state.workers).toEqual({});
  });
});
