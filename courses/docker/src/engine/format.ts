import { imageSize, memoryUse, type Container, type DockerEvent, type Host } from "./docker";

/**
 * What the Docker CLI would print for this host, built from the model: `docker ps`,
 * `images`, `logs`, `inspect`, `stats`. Columns are trimmed to fit the stage.
 */

const pad = (s: string, n: number) => (s.length >= n ? `${s.slice(0, n - 1)} ` : s + " ".repeat(n - s.length));

export function status(c: Container): string {
  if (c.state === "running") return "Up";
  if (c.state === "created") return "Created";
  return `Exited (${c.exitCode})`;
}

export function portsOf(c: Container): string {
  return c.ports.map((p) => `0.0.0.0:${p.host}->${p.container}/tcp`).join(", ");
}

const ordered = (h: Host) => Object.values(h.containers);

export function ps(h: Host, all: boolean): string[] {
  const rows = ordered(h).filter((c) => all || c.state === "running");
  return [
    pad("CONTAINER ID", 14) + pad("IMAGE", 16) + pad("STATUS", 13) + pad("PORTS", 22) + "NAMES",
    ...rows.map((c) => pad(c.id.slice(0, 12), 14) + pad(c.ref.replace(/:latest$/, ""), 16) + pad(status(c), 13) + pad(portsOf(c), 22) + c.name),
  ];
}

export function images(h: Host): string[] {
  const lines = [pad("REPOSITORY", 18) + pad("TAG", 9) + pad("IMAGE ID", 14) + "SIZE"];
  for (const img of Object.values(h.images)) {
    const tags = Object.keys(h.tags).filter((t) => h.tags[t] === img.id);
    const size = `${imageSize(img)}MB`;
    if (!tags.length) lines.push(pad("<none>", 18) + pad("<none>", 9) + pad(img.id.slice(0, 12), 14) + size);
    for (const t of tags) {
      const i = t.lastIndexOf(":");
      lines.push(pad(t.slice(0, i), 18) + pad(t.slice(i + 1), 9) + pad(img.id.slice(0, 12), 14) + size);
    }
  }
  return lines;
}

/** Images with no tag that no container uses: what a plain `docker image prune` removes. */
export function dangling(h: Host): string[] {
  const used = new Set(Object.values(h.containers).map((c) => c.image));
  const tagged = new Set(Object.values(h.tags));
  return Object.keys(h.images).filter((id) => !used.has(id) && !tagged.has(id));
}

export function inspect(c: Container): string[] {
  const env = Object.entries(c.env).map(([k, v]) => `"${k}=${v}"`);
  return [
    "[{",
    `  "Name": "/${c.name}",`,
    `  "Image": "sha256:${c.image}…",`,
    `  "State": { "Status": "${c.state}", "ExitCode": ${c.exitCode ?? 0}, "OOMKilled": ${c.oomKilled} },`,
    `  "Config": { "Cmd": ${JSON.stringify(c.cmd)}, "Env": [${env.join(", ")}] },`,
    `  "HostConfig": { "PortBindings": ${JSON.stringify(Object.fromEntries(c.ports.map((p) => [`${p.container}/tcp`, [{ HostPort: String(p.host) }]])))} },`,
    `  "Mounts": ${JSON.stringify(c.mounts.map((m) => ({ Type: m.type, Source: m.source, Destination: m.target })))}`,
    "}]",
  ];
}

export function stats(h: Host): string[] {
  return [
    pad("NAME", 12) + pad("CPU %", 8) + "MEM USAGE / LIMIT",
    ...ordered(h)
      .filter((c) => c.state === "running")
      .map((c) => pad(c.name, 12) + pad("0.02%", 8) + `${memoryUse(h, c)}MiB / ${c.memoryLimit ? `${c.memoryLimit}MiB` : "7.6GiB"}`),
  ];
}

/** What the terminal shows after a sandbox move: errors as Docker prints them, prune's summary, exec output. */
export function outputOf(events: DockerEvent[]): string[] {
  const out: string[] = [];
  for (const e of events) {
    if (e.type === "error") out.push(`Error response from daemon: ${e.message.replace(/^Error response from daemon: /, "")}`);
    if (e.type === "pruned") {
      out.push("Deleted Containers:", ...(e.containers.length ? e.containers : ["(none)"]).map((n) => `  ${n}`));
      out.push("Deleted Images:", ...(e.images.length ? e.images : ["(none)"]).map((id) => `  deleted: sha256:${id}`));
      if (e.networks.length) out.push("Deleted Networks:", ...e.networks.map((n) => `  ${n}`));
    }
    if (e.type === "execOutput") out.push(...e.output);
    if (e.type === "imageRemoved") out.push(`Untagged: ${e.ref}`, ...(e.untaggedOnly ? [] : [`Deleted: sha256:${e.id}`]));
    if (e.type === "removed") out.push(e.name);
    if (e.type === "exited" && e.reason === "stopped") out.push(e.name);
    if (e.type === "started") out.push(e.name);
  }
  return out;
}
