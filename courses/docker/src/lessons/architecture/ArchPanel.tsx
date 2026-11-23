import { motion } from "motion/react";
import { l, type L } from "@lets-explain/core/i18n";
import type { DockerEvent, Host } from "../../engine/docker";
import { stampOf } from "../../iso/stageKit";
import "./arch.css";

/**
 * Docker's moving parts, as a harbour: the CLI in a terminal sends requests over the Docker
 * socket to the daemon, the harbour office on its quay, which keeps the images (crates) and runs
 * the containers; when it needs an image it does not have, it fetches it from the registry, a
 * cargo ship at sea. The arrows light up for what the last command used.
 */

const text = {
  terminal: l("Terminal", "Terminal"),
  cli: l("docker (CLI): sadece istek gönderir", "docker (CLI): only sends requests"),
  daemon: l("Docker daemon (dockerd)", "Docker daemon (dockerd)"),
  images: l("Image'lar", "Images"),
  containers: l("Container'lar", "Containers"),
  none: l("yok", "none"),
  registry: l("Registry", "Registry"),
  hub: l("Docker Hub (docker.io)", "Docker Hub (docker.io)"),
  api: l("REST API · /var/run/docker.sock", "REST API · /var/run/docker.sock"),
  pull: l("pull / push", "pull / push"),
  runtime: l("containerd → runc: container'ı asıl başlatanlar", "containerd → runc: what actually starts containers"),
  restarted: l("daemon yeniden başladı", "daemon restarted"),
};

interface Props {
  host: Host;
  last: DockerEvent[];
  /** The command just typed, shown in the terminal. */
  command?: string;
  t: (x: L) => string;
}

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/** The command a set of events most likely came from, for the sandbox where no text is given. */
export function guessCommand(last: DockerEvent[]): string | undefined {
  const created = last.find((e) => e.type === "created");
  if (created && created.type === "created") return `docker run ${created.ref.replace(/:latest$/, "")}`;
  const pulled = last.find((e) => e.type === "pulled");
  if (pulled && pulled.type === "pulled") return `docker pull ${pulled.ref}`;
  if (last.some((e) => e.type === "daemonRestarted")) return "sudo systemctl restart docker";
  const started = last.find((e) => e.type === "started");
  if (started && started.type === "started") return `docker start ${started.name}`;
  const removed = last.find((e) => e.type === "removed");
  if (removed && removed.type === "removed") return `docker rm -f ${removed.name}`;
  return undefined;
}

export function ArchPanel({ host, last, command, t }: Props) {
  const cmd = command ?? guessCommand(last);
  const pulled = last.some((e) => e.type === "pulled");
  const failedPull = last.some((e) => e.type === "error" && e.message.includes("pull access denied"));
  const talked = last.length > 0;
  const error = last.find((e) => e.type === "error");
  // The daemon's answer, without the "docker: Error response from daemon:" prefix, in two short lines.
  const output = error && error.type === "error" ? error.message.split("\n").pop()!.replace(/^.*daemon: /, "") : undefined;
  const outLines = output ? [output.slice(0, 27), output.slice(27, 54)].filter(Boolean) : [];
  const restarted = last.some((e) => e.type === "daemonRestarted");
  const images = Object.keys(host.tags);
  const containers = Object.values(host.containers);
  const repos = Object.keys(host.registry.tags).slice(0, 7);
  const createdIds = last.flatMap((e) => (e.type === "created" ? [e.id] : []));
  const pulledRef = last.find((e): e is Extract<DockerEvent, { type: "pulled" }> => e.type === "pulled")?.ref;
  const pulledRow = pulledRef ? images.indexOf(pulledRef) : -1;

  return (
    <g className="arch">
      {/* Terminal */}
      <rect x={24} y={64} width={232} height={200} rx={16} style={{ fill: "var(--ink)" }} />
      <rect x={24} y={60} width={232} height={200} rx={16} className="arch-box" style={{ fill: "#2b2a33" }} />
      <circle cx={44} cy={78} r={5} style={{ fill: "var(--coral)" }} />
      <circle cx={60} cy={78} r={5} style={{ fill: "var(--sun)" }} />
      <circle cx={76} cy={78} r={5} style={{ fill: "var(--mint)" }} />
      <text x={96} y={83} className="arch-mono" style={{ fill: "#cfc8d6" }}>
        {t(text.terminal)}
      </text>
      <text x={40} y={118} className="arch-mono" style={{ fill: "#fffdf8" }}>
        <tspan style={{ fill: "var(--mint)" }}>$ </tspan>
        {clip(cmd ?? "docker …", 22)}
      </text>
      {outLines.map((line, i) => (
        <text key={i} x={40} y={146 + i * 18} className="arch-mono-small" style={{ fill: "#ffb3a8" }}>
          {i === 1 && output!.length > 54 ? `${line.slice(0, 26)}…` : line}
        </text>
      ))}
      <text x={140} y={246} textAnchor="middle" className="arch-small" style={{ fill: "#b9b2c2" }}>
        {t(text.cli)}
      </text>

      {/* CLI → daemon */}
      <motion.path d="M258 160 L 318 160" className={`arch-arrow ${talked ? "is-lit" : ""}`} initial={false} animate={{ opacity: 1 }} />
      <text x={288} y={146} textAnchor="middle" className="arch-tiny">
        API
      </text>

      {/* Daemon: the harbour office on its quay. */}
      <rect x={0} y={414} width={860} height={56} className="arch-water" />
      {[90, 340, 560, 700, 820].map((x, i) => (
        <path key={i} d={`M${x - 14} ${446 + (i % 2) * 10} q7 -6 14 0 t14 0`} className="arch-wave" />
      ))}
      <rect x={322} y={36} width={300} height={404} rx={6} style={{ fill: "var(--ink)" }} />
      <rect x={322} y={32} width={300} height={404} rx={6} className={`arch-box arch-quay ${restarted ? "is-flash" : ""}`} />
      <rect x={322} y={412} width={300} height={24} className="arch-quay-wall" />
      <rect x={336} y={44} width={272} height={360} rx={4} className="arch-safety" />
      {[336, 608].map((x) => (
        <g key={x} transform={`translate(${x} 412)`} className="arch-bollard">
          <path d="M-5 0 v-8 a5 2.5 0 0 0 10 0 v8 a5 2.5 0 0 1 -10 0z" />
          <ellipse cx={0} cy={-8} rx={6.5} ry={3.2} />
        </g>
      ))}
      <g transform="translate(596 40)">
        {/* The office itself: the daemon is the one who does the work. */}
        <path d="M-18 14 l18 -12 l18 12 v18 h-36z" className="arch-office" />
        <rect x={-6} y={20} width={12} height={12} className="arch-office-door" />
        <rect x={-15} y={17} width={7} height={6} className="arch-office-door" />
        <rect x={8} y={17} width={7} height={6} className="arch-office-door" />
      </g>
      <text x={342} y={62} className="arch-title">
        {t(text.daemon)}
      </text>
      {restarted && (
        <text x={342} y={78} className="arch-small is-bad">
          {t(text.restarted)}
        </text>
      )}
      <text x={342} y={92} className="arch-label">
        {t(text.images)}
      </text>
      {images.length === 0 && (
        <text x={342} y={114} className="arch-small">
          {t(text.none)}
        </text>
      )}
      {images.slice(0, 5).map((ref, i) => (
        <g key={ref} transform={`translate(342 ${104 + i * 26})`}>
          <rect width={260} height={22} rx={3} className="arch-box arch-crate" />
          <line x1={196} y1={0} x2={196} y2={22} className="arch-plank" />
          <line x1={2} y1={11} x2={194} y2={11} className="arch-plank" />
          <text x={12} y={15} className="arch-mono-small">
            {clip(ref, 34)}
          </text>
        </g>
      ))}
      <text x={342} y={256} className="arch-label">
        {t(text.containers)}
      </text>
      {containers.length === 0 && (
        <text x={342} y={278} className="arch-small">
          {t(text.none)}
        </text>
      )}
      {containers.slice(0, 5).map((c, i) => {
        // A container the daemon just created comes out of its image's row.
        const from = createdIds.includes(c.id) ? images.indexOf(c.ref) : -1;
        return (
        <motion.g
          key={c.id}
          initial={from >= 0 && from < 5 ? { x: 342, y: 104 + from * 26, opacity: 0 } : false}
          animate={{ x: 342, y: 268 + i * 26, opacity: 1 }}
          transition={{ type: "spring", stiffness: 170, damping: 22, delay: pulled ? 0.75 : 0.35 }}
        >
          <rect width={260} height={22} rx={2} className="arch-box" style={{ fill: c.state === "running" ? "var(--mint)" : c.exitCode ? "var(--red-soft)" : "#e9e5ec" }} />
          {[234, 240, 246, 252].map((x) => (
            <line key={x} x1={x} y1={4} x2={x} y2={18} className="arch-plank" />
          ))}
          <text x={12} y={15} className="arch-mono-small">
            {clip(`${c.name} · ${c.ref.replace(/:latest$/, "")} · ${c.state === "running" ? "Up" : `Exited (${c.exitCode})`}`, 36)}
          </text>
        </motion.g>
        );
      })}
      <text x={472} y={424} textAnchor="middle" className="arch-tiny">
        {t(text.runtime)}
      </text>

      {/* daemon → registry */}
      <path d="M624 160 L 676 160" className={`arch-arrow ${pulled ? "is-lit" : failedPull ? "is-bad" : ""}`} />
      <text x={650} y={146} textAnchor="middle" className="arch-tiny">
        {t(text.pull)}
      </text>

      {/* Registry: a cargo ship at sea, one container per image it holds. */}
      <g className="arch-ship">
        <path d="M670 318 H852 L840 372 H684 Z" className="arch-hull" />
        <path d="M676 344 H848 L845 356 H680 Z" className="arch-waterline" />
        <rect x={826} y={238} width={22} height={80} className={`arch-bridge ${pulled ? "is-flash" : ""}`} />
        <rect x={831} y={246} width={12} height={8} className="arch-window" />
        <rect x={680} y={312} width={142} height={6} className="arch-deck" />
      </g>
      <text x={746} y={88} textAnchor="middle" className="arch-title">
        {t(text.registry)}
      </text>
      <text x={746} y={106} textAnchor="middle" className="arch-small">
        {t(text.hub)}
      </text>
      {repos.map((ref, i) => (
        <g key={ref} transform={`translate(684 ${118 + i * 26})`}>
          <rect width={136} height={22} rx={2} className="arch-box arch-cargo" />
          <text x={8} y={15} className="arch-mono-small">
            {clip(ref.replace(/:latest$/, ""), 17)}
          </text>
        </g>
      ))}
      {/* Everything else the registry holds, below the names shown. */}
      {Array.from({ length: Math.max(0, 7 - repos.length) }, (_, k) =>
        [0, 1].map((j) => <rect key={`${k}-${j}`} x={684 + j * 70} y={118 + (repos.length + k) * 26} width={66} height={22} rx={2} className="arch-box arch-filler" />),
      )}

      {/* The request travels from the CLI to the daemon; a pull goes on to the registry and the image comes back. */}
      {talked && (
        <g key={stampOf(host)}>
          <motion.circle r={6} className="arch-box" style={{ fill: "var(--sun)" }} initial={{ cx: 258, cy: 160, opacity: 0 }} animate={{ cx: [258, 318], cy: 160, opacity: [0, 1, 0] }} transition={{ duration: 0.35 }} />
          {(pulled || failedPull) && (
            <motion.circle
              r={6}
              className="arch-box"
              initial={{ cx: 624, cy: 160, opacity: 0, fill: "#ffd66b" }}
              animate={{ cx: [624, 676, 624], cy: 160, opacity: [0, 1, 0], fill: failedPull ? ["#ffd66b", "#f2615a", "#f2615a"] : "#ffd66b" }}
              transition={{ duration: 0.5, delay: 0.3 }}
            />
          )}
          {pulled && pulledRow >= 0 && pulledRow < 5 && (
            <motion.g initial={{ x: 680, y: 150, opacity: 0 }} animate={{ x: [680, 624, 342], y: [150, 150, 104 + pulledRow * 26], opacity: [0, 1, 0] }} transition={{ duration: 0.6, delay: 0.55, ease: "easeInOut" }}>
              <rect width={120} height={22} rx={11} className="arch-box" style={{ fill: "var(--sun)" }} />
              <text x={10} y={15} className="arch-mono-small">
                {clip(pulledRef!, 14)}
              </text>
            </motion.g>
          )}
        </g>
      )}
    </g>
  );
}
