import type { Metric } from "@lets-explain/core/components/SceneFrame";
import { l, type L } from "@lets-explain/core/i18n";
import { latency, type Net } from "../../engine/net";

/** Counters most lessons show: requests and empty answers since the step began, and how long the newest message waited. */
export function flowMetrics(net: Net, from: Net, t: (x: L) => string): Metric[] {
  const made = net.exchanges.slice(from.exchanges.length);
  const empty = made.filter((e) => e.empty).length;
  const newest = Object.keys(net.seen).map(Number).sort((a, b) => b - a)[0];
  const wait = newest === undefined ? null : latency(net, newest);
  return [
    { label: t(l("İstek", "Requests")), value: made.length },
    { label: t(l("Boş dönen", "Came back empty")), value: empty, tone: empty > 0 ? "warn" : "plain" },
    {
      label: t(l("Son mesaj bekledi", "Newest message waited")),
      value: wait === null ? "—" : `${(wait / 1000).toFixed(wait % 1000 ? 1 : 0)} ${t(l("sn", "s"))}`,
      tone: wait !== null && wait > 0 ? "warn" : wait === 0 ? "ok" : "plain",
    },
  ];
}
