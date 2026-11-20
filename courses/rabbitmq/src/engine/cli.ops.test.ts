import { describe, expect, it } from "vitest";
import { typeLines } from "@lets-explain/core/components/TypedSandbox";
import { createBroker, depth, effectiveArgs } from "./broker";
import { applyAll, project, rabbitShell, type Files, type Project } from "./cli";

/** Policies, cluster nodes, stream offsets and RPC servers: what the reliability lessons need. */

const head = `import pika

connection = pika.BlockingConnection(pika.ConnectionParameters("localhost"))
ch = connection.channel()
`;
const script = (body: string) => `${head}\n${body.trim()}\n\nconnection.close()`;

function type(files: Files, typed: string[], nodes = 1): { p: Project; out: string[] } {
  const r = typeLines(rabbitShell, applyAll, project(createBroker({ nodes }), files), typed);
  return { p: r.state, out: r.output };
}

describe("rabbitmq cli: policies", () => {
  const files = {
    "setup.py": script(`
ch.exchange_declare(exchange="dlx", exchange_type="fanout", durable=True)
ch.queue_declare(queue="dead", durable=True)
ch.queue_bind(queue="dead", exchange="dlx")
ch.queue_declare(queue="work", durable=True)
`),
    "send.py": script(`ch.basic_publish(exchange="", routing_key="work", body=b"job")`),
  };

  it("sets a policy with Git-like output and applies it to matching queues", () => {
    const { p, out } = type(files, ["python setup.py", `rabbitmqctl set_policy DLX "^work$" '{"dead-letter-exchange":"dlx","message-ttl":2000}' --apply-to queues`]);
    expect(out).toContain(`Setting policy "DLX" for pattern "^work$" to "{"dead-letter-exchange":"dlx","message-ttl":2000}" with priority "0" for vhost "/" ...`);
    expect(effectiveArgs(p.broker, p.broker.queues.work!)).toMatchObject({ dlx: "dlx", ttl: 2 });
    expect(effectiveArgs(p.broker, p.broker.queues.dead!)).toEqual({});
  });

  it("dead-letters through the policy when the TTL passes", () => {
    const { p } = type(files, ["python setup.py", `rabbitmqctl set_policy DLX "^work$" '{"dead-letter-exchange":"dlx","message-ttl":2000}' --apply-to queues`, "python send.py", "sleep 3"]);
    expect(depth(p.broker, "work").ready).toBe(0);
    expect(depth(p.broker, "dead").ready).toBe(1);
  });

  it("lists and clears policies", () => {
    const { p, out } = type(files, ["python setup.py", `rabbitmqctl set_policy lim "^work" '{"max-length":5}'`, "rabbitmqctl list_policies", "rabbitmqctl clear_policy lim"]);
    expect(out).toContain(`/\tlim\t^work\tall\t{"max-length":5}\t0`);
    expect(out).toContain(`Clearing policy "lim" on vhost "/" ...`);
    expect(p.broker.policies).toEqual([]);
  });

  it("rejects unknown keys and bad JSON like RabbitMQ", () => {
    expect(type(files, [`rabbitmqctl set_policy x ".*" '{"ha-mode":"all"}'`]).out.at(-1)).toBe(`[{<<"ha-mode">>,"all"}] are not recognised policy settings`);
    expect(type(files, [`rabbitmqctl set_policy x ".*" '{bad'`]).out.at(-1)).toBe("JSON decoding error");
  });

  it("queue arguments win over a policy's dead letter exchange; the lower TTL wins", () => {
    const own = {
      "setup.py": script(`
ch.queue_declare(queue="work", durable=True, arguments={"x-dead-letter-exchange": "mine", "x-message-ttl": 5000})
`),
    };
    const { p } = type(own, ["python setup.py", `rabbitmqctl set_policy P "^work$" '{"dead-letter-exchange":"theirs","message-ttl":1000}'`]);
    expect(effectiveArgs(p.broker, p.broker.queues.work!)).toMatchObject({ dlx: "mine", ttl: 1 });
  });

  it("a policy's delivery limit replaces the quorum default", () => {
    const qq = { "setup.py": script(`ch.queue_declare(queue="orders", durable=True, arguments={"x-queue-type": "quorum"})`) };
    const { p } = type(qq, ["python setup.py", `rabbitmqctl set_policy lim "^orders$" '{"delivery-limit":3}' --apply-to queues`]);
    expect(effectiveArgs(p.broker, p.broker.queues.orders!).deliveryLimit).toBe(3);
  });
});

describe("rabbitmq cli: cluster nodes", () => {
  const files = { "setup.py": script(`ch.queue_declare(queue="orders", durable=True, arguments={"x-queue-type": "quorum"})`) };

  it("stops and starts nodes through docker and shows the leader moving", () => {
    const { p, out } = type(files, ["python setup.py", "docker stop rabbit1", "docker exec rabbit2 rabbitmq-queues quorum_status orders"], 3);
    expect(out).toContain("rabbit1");
    expect(out).toContain("rabbit@1\tnoproc\tvoter");
    expect(out).toContain("rabbit@2\tleader\tvoter");
    expect(p.broker.queues.orders!.node).toBe("rabbit@2");
  });

  it("refuses docker exec on a stopped container", () => {
    const { out } = type(files, ["python setup.py", "docker stop rabbit1", "docker exec rabbit1 rabbitmqctl list_queues"], 3);
    expect(out.at(-1)).toMatch(/^Error response from daemon: container \w+ is not running$/);
  });

  it("tells whether a node is quorum-critical", () => {
    const safe = type(files, ["python setup.py", "docker exec rabbit2 rabbitmq-queues check_if_node_is_quorum_critical"], 3);
    expect(safe.out.some((l) => l.startsWith("Error"))).toBe(false);
    const risky = type(files, ["python setup.py", "docker stop rabbit3", "docker exec rabbit2 rabbitmq-queues check_if_node_is_quorum_critical"], 3);
    expect(risky.out).toContain("There are quorum queues that would lose their quorum if the target node is shut down:");
  });

  it("lists leader and members", () => {
    const { out } = type(files, ["python setup.py", "docker exec rabbit1 rabbitmqctl list_queues name type leader members"], 3);
    expect(out).toContain("orders\tquorum\trabbit@1\t[rabbit@1,rabbit@2,rabbit@3]");
  });

  it("a single broker stopped and started comes back like a restart", () => {
    const one = { "setup.py": script(`ch.queue_declare(queue="temp", durable=False)`) };
    const { p } = type(one, ["python setup.py", "docker stop rabbitmq", "docker start rabbitmq"]);
    expect(p.broker.queues.temp).toBeUndefined();
    expect(p.broker.nodes[0]!.alive).toBe(true);
  });
});

describe("rabbitmq cli: streams and rpc", () => {
  it("reads a stream from x-stream-offset and needs a prefetch", () => {
    const files = {
      "setup.py": script(`
ch.queue_declare(queue="events", durable=True, arguments={"x-queue-type": "stream"})
for e in ["e1", "e2", "e3"]:
    ch.basic_publish(exchange="", routing_key="events", body=e)
`),
      "reader.py": `${head}
def handle(ch, method, properties, body):
    print(f"got {body.decode()}")
    ch.basic_ack(delivery_tag=method.delivery_tag)

ch.basic_qos(prefetch_count=100)
ch.basic_consume(queue="events", on_message_callback=handle, arguments={"x-stream-offset": "first"})
ch.start_consuming()`,
      "noqos.py": `${head}
def handle(ch, method, properties, body):
    ch.basic_ack(delivery_tag=method.delivery_tag)

ch.basic_consume(queue="events", on_message_callback=handle)
ch.start_consuming()`,
    };
    const { out } = type(files, ["python setup.py", "python reader.py"]);
    expect(out.filter((l) => l.startsWith("got "))).toEqual(["got e1", "got e2", "got e3"]);
    const bad = type(files, ["python setup.py", "python noqos.py"]);
    expect(bad.out.at(-1)).toContain("consumer prefetch count is not set for stream queue 'events'");
  });

  it("an RPC server answers to reply_to with the correlation id", () => {
    const files = {
      "setup.py": script(`
ch.queue_declare(queue="rpc", durable=True)
ch.queue_declare(queue="replies", durable=True)
`),
      "server.py": `${head}
def on_request(ch, method, props, body):
    ch.basic_publish(exchange="", routing_key=props.reply_to, properties=pika.BasicProperties(correlation_id=props.correlation_id), body=b"42")
    ch.basic_ack(delivery_tag=method.delivery_tag)

ch.basic_qos(prefetch_count=1)
ch.basic_consume(queue="rpc", on_message_callback=on_request)
ch.start_consuming()`,
      "client.py": script(`ch.basic_publish(exchange="", routing_key="rpc", properties=pika.BasicProperties(reply_to="replies", correlation_id="c1"), body=b"what is 6x7?")`),
    };
    const { p } = type(files, ["python setup.py", "python server.py", "python client.py"]);
    const answer = p.broker.queues.replies!.ready[0]!;
    expect(answer.body).toBe("42");
    expect(answer.correlationId).toBe("c1");
    expect(depth(p.broker, "rpc").total).toBe(0);
  });
});
