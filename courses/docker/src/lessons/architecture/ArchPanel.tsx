import { motion } from "motion/react";
import { l, type L } from "@lets-explain/core/i18n";
import type { DockerEvent, Host } from "../../engine/docker";
import "./arch.css";

/**
 * Docker's moving parts: the CLI in a terminal sends requests over the Docker socket to the
 * daemon, which holds the images and containers and pulls from a registry when it needs to.
 * The arrows light up for what the last command used.
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

      {/* Daemon */}
      <rect x={322} y={36} width={300} height={404} rx={20} style={{ fill: "var(--ink)" }} />
      <rect x={322} y={32} width={300} height={404} rx={20} className={`arch-box ${restarted ? "is-flash" : ""}`} style={{ fill: "var(--sky-soft)" }} />
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
          <rect width={260} height={22} rx={11} className="arch-box" style={{ fill: "var(--card)" }} />
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
      {containers.slice(0, 5).map((c, i) => (
        <g key={c.id} transform={`translate(342 ${268 + i * 26})`}>
          <rect width={260} height={22} rx={11} className="arch-box" style={{ fill: c.state === "running" ? "var(--mint)" : c.exitCode ? "var(--red-soft)" : "#e9e5ec" }} />
          <text x={12} y={15} className="arch-mono-small">
            {clip(`${c.name} · ${c.ref.replace(/:latest$/, "")} · ${c.state === "running" ? "Up" : `Exited (${c.exitCode})`}`, 36)}
          </text>
        </g>
      ))}
      <text x={472} y={424} textAnchor="middle" className="arch-tiny">
        {t(text.runtime)}
      </text>

      {/* daemon → registry */}
      <path d="M624 160 L 676 160" className={`arch-arrow ${pulled ? "is-lit" : failedPull ? "is-bad" : ""}`} />
      <text x={650} y={146} textAnchor="middle" className="arch-tiny">
        {t(text.pull)}
      </text>

      {/* Registry */}
      <rect x={680} y={64} width={160} height={290} rx={18} style={{ fill: "var(--ink)" }} />
      <rect x={680} y={60} width={160} height={290} rx={18} className={`arch-box ${pulled ? "is-flash" : ""}`} style={{ fill: "var(--sun-soft)" }} />
      <text x={760} y={88} textAnchor="middle" className="arch-title">
        {t(text.registry)}
      </text>
      <text x={760} y={106} textAnchor="middle" className="arch-small">
        {t(text.hub)}
      </text>
      {repos.map((ref, i) => (
        <text key={ref} x={696} y={134 + i * 26} className="arch-mono-small">
          {clip(ref.replace(/:latest$/, ""), 19)}
        </text>
      ))}
    </g>
  );
}
