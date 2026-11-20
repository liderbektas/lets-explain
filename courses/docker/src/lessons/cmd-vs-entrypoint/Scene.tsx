import { l, type L } from "@lets-explain/core/i18n";
import { findContainer, type DockerAction } from "../../engine/docker";
import { makeDockerScene } from "../shared/DockerScene";
import { newest, runOf, START } from "./model";
import { scenarios } from "./scenarios";
import { ProcessCard, type CardLabels } from "./ProcessCard";

export const SLUG = "cmd-vs-entrypoint";

export { START };

export const steps: DockerAction[][] = [
  [runOf("g1", "acme/greet:cmd")],
  [runOf("g2", "acme/greet:cmd", ["Ada"])],
  [runOf("g3", "acme/greet:cmd", ["echo", "Selam"])],
  [runOf("g4", "acme/greet:ep")],
  [runOf("g5", "acme/greet:ep", ["Ada"])],
  [runOf("g6", "acme/greet:ep", ["/"], "ls")],
  [{ ...runOf("shell", "acme/web:shell"), detach: true } as DockerAction, { ...runOf("exec", "acme/web:exec"), detach: true } as DockerAction, { type: "stop", container: "exec" }, { type: "kill", container: "shell" }],
  [runOf("g7", "acme/greet:cmd", ["ehco", "merhaba"])],
  [],
  [],
];

/** Steps where a Docker error is the point of the step: none; exit codes are not errors. */
export const EXPECTED_ERRORS: Record<number, number> = {};

const cardLabels = (t: (x: L) => string): CardLabels => ({
  dockerfile: "Dockerfile",
  typed: t(l("Yazdığın komut", "What you typed")),
  pid1: t(l("PID 1 olarak çalışan", "What ran as PID 1")),
  output: t(l("Çıktı", "Output")),
  exit: "exit",
  none: t(l("Henüz container yok.", "No container yet.")),
});

export const scene = makeDockerScene({
  slug: SLUG,
  start: START,
  steps,
  label: l("Dockerfile'daki ENTRYPOINT ve CMD, yazılan komut ve gerçekte çalışan süreç", "ENTRYPOINT and CMD in the Dockerfile, the command typed, and the process that really ran"),
  view: (h, info) => {
    const labels = cardLabels(info.t);
    if (!info.sandbox && info.step === 6) {
      return (
        <g>
          <ProcessCard host={h} c={findContainer(h, "shell")} x={20} y={36} w={400} labels={labels} compact />
          <ProcessCard host={h} c={findContainer(h, "exec")} x={440} y={36} w={400} labels={labels} compact />
        </g>
      );
    }
    return <ProcessCard host={h} c={newest(h)} x={150} y={46} w={560} labels={labels} />;
  },
  metrics: (h, t) => {
    const cs = Object.values(h.containers);
    const c = newest(h);
    return [
      { label: t(l("Son exit code", "Last exit code")), value: c ? (c.state === "running" ? "—" : (c.exitCode ?? "—")) : "—", tone: c && c.exitCode ? "danger" : "plain" },
      { label: "exit 0", value: cs.filter((x) => x.exitCode === 0).length, tone: "ok" },
      { label: "exit 127", value: cs.filter((x) => x.exitCode === 127).length, tone: cs.some((x) => x.exitCode === 127) ? "danger" : "plain" },
    ];
  },
  sandbox: { start: () => START, scenarios },
});
