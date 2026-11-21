import { typeLines } from "@lets-explain/core/components/TypedSandbox";
import { wsShell } from "../../engine/cli";
import { replay, simulate, type Net } from "../../engine/net";
import { ctxOf, type WsCtx } from "./NetScene";

/** Types lines into a scenario's terminal, the way a reader would, and builds what the check sees. */
export function typeInto(start: Net, lines: string[], edits: ((text: string) => string)[] = []): { moves: number; ctx: WsCtx; output: string[] } {
  const r = typeLines(wsShell, replay, start, lines, edits);
  return { moves: r.moves, ctx: ctxOf(start, r.actions, simulate(r.actions, start)), output: r.output };
}
