import { out, type TermLine } from "@lets-explain/core/lib/terminal";
import { fail, flags, makeAppShell, model, readProps, say, type AppBox, type AppLesson, type Program } from "../shared/appShell";
import { connections, MAX_SOURCES, MAX_TARGETS, step, type WorldAction, type WorldEvent, type WorldState } from "./model";

/**
 * The shop's services in docker compose. `order-service.env` says how the order service tells
 * the others about an order: `NOTIFY_MODE=http` calls each service in `NOTIFY_URLS`,
 * `NOTIFY_MODE=kafka` writes one event to the `orders` topic. `docker compose up -d
 * order-service` applies it; `docker stop|start email-service` takes the email service down
 * and back; `docker compose up -d analytics-service` adds a service that wants orders.
 */

export type WBox = AppBox<WorldState>;
export const ENV = "order-service.env";

/** Services that read orders, in the order the scene adds them after the first three. */
const TARGETS = ["payment-service", "stock-service", "email-service", "analytics-service", "fraud-service", "shipping-service"];
/** Services that create events, in the order the scene adds them. */
const SOURCES = ["order-service", "cart-service", "accounts-service"];

export const HTTP_ENV = `# How the order service tells the other services about a new order
NOTIFY_MODE=http
NOTIFY_URLS=http://payment-service:8080/orders,http://stock-service:8080/orders,http://email-service:8080/orders
`;

export const KAFKA_ENV = `# How the order service tells the other services about a new order
NOTIFY_MODE=kafka
NOTIFY_TOPIC=orders
`;

function readMode(text: string | undefined): "direct" | "kafka" | string {
  const mode = (readProps(text)["NOTIFY_MODE"] ?? "").toLowerCase();
  if (mode === "http") return "direct";
  if (mode === "kafka") return "kafka";
  return `order-service | ERROR NOTIFY_MODE must be http or kafka, got "${mode}"`;
}

function composeUp(box: WBox, names: string[]): Program<WorldAction> {
  const s = box.model;
  const actions: WorldAction[] = [];
  const output: TermLine[] = [];
  let cur = s;
  const push = (a: WorldAction) => {
    actions.push(a);
    cur = step(cur, a).state;
  };
  for (const n of names) {
    if (n === "order-service") {
      const mode = readMode(box.files[ENV]);
      if (mode !== "direct" && mode !== "kafka") return { actions: actions.map(model), output: [...output, out(mode, "err")], failed: true };
      if (mode !== cur.mode) {
        push({ type: "setMode", mode });
        output.push(out(" ✔ Container order-service  Recreated"), out(mode === "kafka" ? "order-service | publishing new orders to topic orders" : "order-service | calling each URL in NOTIFY_URLS for every order", "dim"));
      } else output.push(out(" ✔ Container order-service  Running"));
      continue;
    }
    const target = TARGETS.indexOf(n);
    const source = SOURCES.indexOf(n);
    if (target === -1 && source === -1) return fail(`no such service: ${n}`);
    if (n === "email-service") {
      if (!cur.emailUp) push({ type: "startEmail" });
      output.push(out(` ✔ Container email-service  ${cur.emailUp ? "Started" : "Running"}`));
      continue;
    }
    if (target !== -1) {
      if (target < cur.targets) {
        output.push(out(` ✔ Container ${n}  Running`));
        continue;
      }
      if (target !== cur.targets) return say(`(services join in this order here: ${TARGETS.slice(cur.targets).join(", ")})`, "dim");
      if (cur.targets >= MAX_TARGETS) return say("(no more services fit in this sandbox)", "dim");
      push({ type: "addTarget" });
      output.push(out(` ✔ Container ${n}  Started`));
      output.push(
        out(
          cur.mode === "kafka"
            ? `${n} | subscribed to topic orders (group ${n})`
            : `(in http mode ${n} only gets orders if the order service calls it: one more URL in NOTIFY_URLS, one more connection)`,
          "dim",
        ),
      );
    } else {
      if (source < cur.sources) {
        output.push(out(` ✔ Container ${n}  Running`));
        continue;
      }
      if (source !== cur.sources) return say(`(services join in this order here: ${SOURCES.slice(cur.sources).join(", ")})`, "dim");
      if (cur.sources >= MAX_SOURCES) return say("(no more services fit in this sandbox)", "dim");
      push({ type: "addSource" });
      output.push(out(` ✔ Container ${n}  Started`));
    }
  }
  output.push(out(`(connections between services now: ${connections(cur)})`, "dim"));
  return { actions: actions.map(model), output };
}

function docker(box: WBox, args: string[]): Program<WorldAction> {
  const [sub, ...rest] = args;
  const s = box.model;
  if (sub === "compose") {
    const [verb, ...more] = rest;
    if (verb === "ps") return dockerPs(s);
    if (verb !== "up") return say("(docker compose up -d <service> | docker compose ps)", "dim");
    const names = more.filter((a) => !a.startsWith("-"));
    if (!names.length) return say("(name the service: docker compose up -d order-service)", "dim");
    return composeUp(box, names);
  }
  if (sub === "ps") return dockerPs(s);
  if (sub === "stop" || sub === "kill" || sub === "start" || sub === "restart") {
    const names = rest.filter((a) => !a.startsWith("-"));
    if (!names.length) return fail(`"docker ${sub}" requires at least 1 argument.`);
    if (names.some((n) => n !== "email-service")) return say("(this sandbox lets you stop and start email-service)", "dim");
    if (sub === "start") return s.emailUp ? say("email-service") : { actions: [model({ type: "startEmail" })], output: [out("email-service")] };
    if (sub === "restart") return s.emailUp ? { actions: [model({ type: "crashEmail" }), model({ type: "startEmail" })], output: [out("email-service")] } : { actions: [model({ type: "startEmail" })], output: [out("email-service")] };
    if (!s.emailUp) return sub === "kill" ? fail("Error response from daemon: cannot kill container: email-service: container is not running") : say("email-service");
    return { actions: [model({ type: "crashEmail" })], output: [out("email-service")] };
  }
  return say("(docker compose up -d | docker compose ps | docker stop | start email-service)", "dim");
}

function dockerPs(s: WorldState): Program<WorldAction> {
  const running = [...SOURCES.slice(0, s.sources), ...TARGETS.slice(0, s.targets)];
  const rows = running.map((n) => `${n.padEnd(18)} ${n === "email-service" && !s.emailUp ? "Exited (137)" : "Up 3 hours"}`);
  return say(`NAME               STATUS\n${["kafka".padEnd(18) + " Up 3 hours", ...rows].join("\n")}`);
}

function consumerGroups(s: WorldState, args: string[]): Program<WorldAction> {
  const f = flags(args, ["--bootstrap-server", "--group"]);
  if (!f.values["--bootstrap-server"]) return fail("Missing required argument \"[bootstrap-server]\"");
  if (s.mode !== "kafka") return say("(the order service calls the others over HTTP: there is no consumer group to describe)", "dim");
  if (!f.bare.has("--describe")) return say(TARGETS.slice(0, s.targets).join("\n"));
  const g = f.values["--group"]?.[0];
  if (g !== "email-service") return fail(`Error: Consumer group '${g ?? ""}' does not exist.`);
  const end = s.sent + s.waiting;
  return say(
    `${s.emailUp ? "" : "Consumer group 'email-service' has no active members.\n\n"}GROUP          TOPIC   PARTITION  CURRENT-OFFSET  LOG-END-OFFSET  LAG\nemail-service  orders  0          ${String(s.sent).padEnd(16)}${String(end).padEnd(16)}${s.waiting}`,
  );
}

export const lesson: AppLesson<WorldState, WorldAction, WorldEvent> = {
  dir: "shop",
  step,
  names: ["./place-order.sh", "docker", "kafka-consumer-groups.sh"],
  help: `The shop's services, in docker compose:
  nano order-service.env                 how the order service tells the others (NOTIFY_MODE=http|kafka)
  docker compose up -d order-service     apply that setting
  ./place-order.sh                       a customer places an order
  docker stop email-service / docker start email-service
  docker compose up -d analytics-service   start a new service that wants orders
  docker compose ps
  kafka-consumer-groups.sh --bootstrap-server localhost:9092 --describe --group email-service`,
  command(box, words) {
    const [cmd, ...args] = words;
    const s = box.model;
    if (cmd === "./place-order.sh") {
      const r = step(s, { type: "order" });
      const e = r.events[0]!;
      const line =
        e.type === "sent"
          ? out("order placed; email-service sent the confirmation")
          : e.type === "queued"
            ? out(`order placed; the event waits in topic orders (email-service is down, lag ${r.state.waiting})`, "dim")
            : out("order placed; POST http://email-service:8080/orders failed: Connection refused. The email is gone.", "err");
      return { actions: [model({ type: "order" })], output: [line] };
    }
    if (cmd === "docker" || cmd === "docker-compose") return docker(box, cmd === "docker-compose" ? ["compose", ...args] : args);
    if (cmd === "kafka-consumer-groups.sh" || cmd === "kafka-consumer-groups") return consumerGroups(s, args);
    return null;
  },
};

export const shell = makeAppShell(lesson);

export const boxOf = (s: WorldState): WBox => ({
  model: s,
  files: {
    [ENV]: s.mode === "kafka" ? KAFKA_ENV : HTTP_ENV,
    "docker-compose.yml": `services:\n  kafka: …\n${[...SOURCES, ...TARGETS].map((n) => `  ${n}: …`).join("\n")}`,
    "place-order.sh": "#!/bin/sh\ncurl -s -X POST http://localhost:8080/orders -d '{\"item\": \"mug\"}'",
  },
});
