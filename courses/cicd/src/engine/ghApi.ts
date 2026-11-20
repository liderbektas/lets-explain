import { lines, out, type TermLine } from "@lets-explain/core/lib/terminal";
import { runById, type CiAction, type World } from "./ci";
import type { Desk, DeskAction } from "./desk";

/**
 * `gh api` for the few REST endpoints the lessons use: branch protection, environments and
 * their reviewers, approving a waiting deployment, and who you are. Bodies come from
 * `-f`/`-F` fields (nested with `key[sub]` and `key[][sub]`, as gh builds them) or `--input file`.
 * Responses and errors follow GitHub's shape; any other endpoint says so plainly.
 */

const OWNER = "ada";
const REPO = "shop";
const BASE = `https://api.github.com/repos/${OWNER}/${REPO}`;
export const USER_ID = 583231;

/** A stable id per environment, the way GitHub numbers them. */
export const envId = (name: string) => 1450000000 + [...name].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 999983, 7);

export interface ApiResult {
  actions: DeskAction[];
  output: TermLine[];
  failed?: boolean;
}

type Json = null | boolean | number | string | Json[] | { [k: string]: Json };

const show = (body: Json): TermLine[] => lines(JSON.stringify(body, null, 2));
const ok = (body: Json | undefined, actions: DeskAction[] = []): ApiResult => ({ actions, output: body === undefined ? [] : show(body) });
const httpError = (status: number, message: string, extra: Record<string, Json> = {}): ApiResult => ({
  actions: [],
  output: [...lines(JSON.stringify({ message, ...extra, documentation_url: "https://docs.github.com/rest", status: String(status) })), out(`gh: ${message.split("\n")[0]} (HTTP ${status})`, "err")],
  failed: true,
});

/* ------------------------------------------------------------- arguments */

/** `key[a][]`-style names to a path: ["key", "a", ""] ("" means an array element). */
const keyPath = (k: string) => {
  const m = /^([^[\]]+)((?:\[[^[\]]*\])*)$/.exec(k);
  if (!m) return null;
  return [m[1]!, ...[...m[2]!.matchAll(/\[([^[\]]*)\]/g)].map((x) => x[1]!)];
};

/** Puts a value at a path the way gh does: `a[][k]=1 a[][j]=2` fill one object, a repeated key starts the next. */
function assign(root: Record<string, Json>, path: string[], value: Json) {
  let cur: Json = root;
  for (let i = 0; i < path.length; i++) {
    const k = path[i]!;
    const last = i === path.length - 1;
    if (k === "") {
      const arr = cur as Json[];
      if (last) {
        arr.push(value);
        return;
      }
      const next = path[i + 1]!;
      let el = arr[arr.length - 1];
      if (!el || typeof el !== "object" || Array.isArray(el) || next in el) {
        el = {};
        arr.push(el);
      }
      cur = el;
      continue;
    }
    const obj = cur as Record<string, Json>;
    if (last) {
      obj[k] = value;
      return;
    }
    if (obj[k] === undefined || obj[k] === null || typeof obj[k] !== "object") obj[k] = path[i + 1] === "" ? [] : {};
    cur = obj[k]!;
  }
}

/** `-F` turns true/false/null and integers into JSON values; `-f` keeps strings. */
const typed = (v: string): Json => (v === "true" ? true : v === "false" ? false : v === "null" ? null : /^-?\d+$/.test(v) ? Number(v) : v);

interface Request {
  method: string;
  path: string;
  body: Record<string, Json> | null;
  jq?: string;
}

function parseArgs(d: Desk, args: string[]): Request | ApiResult {
  let method: string | undefined;
  let path: string | undefined;
  let jq: string | undefined;
  let input: string | undefined;
  const fields: { key: string; value: Json }[] = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i]!;
    const next = () => args[++i] ?? "";
    if (a === "-X" || a === "--method") method = next().toUpperCase();
    else if (a.startsWith("--method=")) method = a.slice(9).toUpperCase();
    else if (a === "--input") input = next();
    else if (a === "-q" || a === "--jq") jq = next();
    else if (a === "-H" || a === "--header") next();
    else if (a === "-f" || a === "--raw-field" || a === "-F" || a === "--field") {
      const raw = next();
      const eq = raw.indexOf("=");
      if (eq < 1) return { actions: [], output: [out(`invalid key: "${raw}"`, "err")], failed: true };
      const key = raw.slice(0, eq);
      let value: Json = raw.slice(eq + 1);
      if (a === "-F" || a === "--field") {
        if (typeof value === "string" && value.startsWith("@")) {
          const file = value.slice(1);
          if (!(file in d.files)) return { actions: [], output: [out(`open ${file}: no such file or directory`, "err")], failed: true };
          value = d.files[file]!;
        } else value = typed(value as string);
      }
      fields.push({ key, value });
    } else if (a === "--silent" || a === "--paginate" || a === "-i" || a === "--include" || a === "--verbose") continue;
    else if (a.startsWith("-")) return { actions: [], output: [out(`unknown flag: ${a}`, "err"), out("", "out"), out("Usage:  gh api <endpoint> [flags]", "dim")], failed: true };
    else if (!path) path = a;
    else return { actions: [], output: [out(`accepts 1 arg(s), received ${args.filter((x) => !x.startsWith("-")).length}`, "err")], failed: true };
  }
  if (!path) return { actions: [], output: [out("accepts 1 arg(s), received 0", "err")], failed: true };
  let body: Record<string, Json> | null = null;
  if (input !== undefined) {
    if (!(input in d.files)) return { actions: [], output: [out(`open ${input}: no such file or directory`, "err")], failed: true };
    try {
      const parsed = JSON.parse(d.files[input]!) as Json;
      body = parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, Json>) : {};
    } catch {
      return httpError(400, "Problems parsing JSON");
    }
  }
  for (const f of fields) {
    const p = keyPath(f.key);
    if (!p) return { actions: [], output: [out(`invalid key: "${f.key}"`, "err")], failed: true };
    body ??= {};
    assign(body, p, f.value);
  }
  const clean = path
    .replace(/^https:\/\/api\.github\.com\//, "")
    .replace(/^\//, "")
    .replace(/\{owner\}|:owner/g, OWNER)
    .replace(/\{repo\}|:repo/g, REPO)
    .replace(/\/$/, "");
  return { method: method ?? (body ? "POST" : "GET"), path: clean, body, jq };
}

/* ---------------------------------------------------------------- --jq */

/** A small part of jq: `.a.b`, `.a[]`, `.a[].b`, `.[0]`. Enough for picking ids and names. */
function jqPick(value: Json, expr: string): Json[] | null {
  const e = expr.trim();
  if (e === ".") return [value];
  if (!/^(\.[A-Za-z_][\w-]*|\[\d*\]|\.\[\d*\])+$/.test(e)) return null;
  let cur: Json[] = [value];
  for (const part of e.match(/\.[A-Za-z_][\w-]*|\.?\[\d*\]/g) ?? []) {
    const next: Json[] = [];
    for (const v of cur) {
      if (part.startsWith(".") && !part.startsWith(".[")) {
        if (v && typeof v === "object" && !Array.isArray(v)) next.push((v as Record<string, Json>)[part.slice(1)] ?? null);
        else next.push(null);
      } else {
        const idx = part.replace(/^\./, "").slice(1, -1);
        if (!Array.isArray(v)) continue;
        if (idx === "") next.push(...v);
        else next.push(v[Number(idx)] ?? null);
      }
    }
    cur = next;
  }
  return cur;
}

const jqLines = (values: Json[]) => values.flatMap((v) => lines(typeof v === "string" ? v : JSON.stringify(v, null, 2)));

/* ------------------------------------------------------------- endpoints */

/** Required check names in the model are `Workflow / job`; the API speaks job names (check contexts). */
function checkOf(w: World, context: string): string {
  if (context.includes(" / ")) return context;
  const wf = w.workflows.find((x) => x.jobs.some((j) => j.id === context)) ?? w.workflows[0];
  return `${wf?.name ?? "CI"} / ${context}`;
}
const contextOf = (name: string) => name.replace(/^.* \/ /, "");

function protection(w: World): Json {
  return {
    url: `${BASE}/branches/main/protection`,
    required_status_checks: {
      url: `${BASE}/branches/main/protection/required_status_checks`,
      strict: true,
      contexts: (w.protection ?? []).map(contextOf),
      checks: (w.protection ?? []).map((c) => ({ context: contextOf(c), app_id: 15368 })),
    },
    enforce_admins: { url: `${BASE}/branches/main/protection/enforce_admins`, enabled: true },
    required_linear_history: { enabled: false },
    allow_force_pushes: { enabled: false },
  };
}

function environment(w: World, name: string): Json {
  const e = w.envs[name]!;
  return {
    id: envId(name),
    name,
    url: `${BASE}/environments/${name}`,
    html_url: `https://github.com/${OWNER}/${REPO}/deployments/activity_log?environments_filter=${name}`,
    protection_rules: e.approval ? [{ id: envId(name) + 11, type: "required_reviewers", prevent_self_review: false, reviewers: [{ type: "User", reviewer: { login: OWNER, id: USER_ID } }] }] : [],
    deployment_branch_policy: null,
  };
}

const gh = (action: CiAction): DeskAction => ({ type: "gh", action });

export function ghApi(d: Desk, args: string[]): ApiResult {
  const req = parseArgs(d, args);
  if ("actions" in req) return req;
  const r = route(d, req);
  if (!req.jq || r.failed || !r.output.length) return r;
  const picked = jqPick(JSON.parse(r.output.map((x) => x.text).join("\n")) as Json, req.jq);
  if (!picked) return { ...r, output: [out(`(this sandbox's --jq only picks fields, like .id or .environments[].name)`, "dim"), ...r.output] };
  return { ...r, output: jqLines(picked) };
}

function route(d: Desk, { method, path, body }: Request): ApiResult {
  const w = d.world;
  const repo = `repos/${OWNER}/${REPO}`;

  if (path === "user") {
    if (method !== "GET") return httpError(404, "Not Found");
    return ok({ login: OWNER, id: USER_ID, name: "Ada", type: "User", html_url: `https://github.com/${OWNER}` });
  }

  if (!path.startsWith(`${repo}`)) {
    if (/^repos\/[^/]+\/[^/]+/.test(path)) return httpError(404, "Not Found");
    return sandboxOnly(path);
  }
  const rest = path.slice(repo.length).replace(/^\//, "");

  // Branch protection: GET / PUT / DELETE repos/{owner}/{repo}/branches/main/protection
  let m = /^branches\/([^/]+)\/protection$/.exec(rest);
  if (m) {
    const branch = m[1]!;
    if (!w.heads[branch]) return httpError(404, "Branch not found");
    if (branch !== "main") return { actions: [], output: [out("(in this sandbox only main can be protected)", "dim")], failed: true };
    if (method === "GET") return w.protection ? ok(protection(w)) : httpError(404, "Branch not protected");
    if (method === "DELETE") return w.protection ? ok(undefined, [gh({ type: "setProtection", required: null })]) : httpError(404, "Branch not protected");
    if (method !== "PUT") return httpError(404, "Not Found");
    const b = body ?? {};
    const missing = ["required_status_checks", "enforce_admins", "required_pull_request_reviews", "restrictions"].filter((k) => !(k in b));
    if (missing.length) return httpError(422, `Invalid request.\n\n${missing.map((k) => `"${k}"`).join(", ")} ${missing.length > 1 ? "weren't" : "wasn't"} supplied.`);
    const rsc = b.required_status_checks;
    let contexts: string[] = [];
    if (rsc !== null) {
      if (typeof rsc !== "object" || Array.isArray(rsc)) return httpError(422, "Invalid request.\n\nFor 'properties/required_status_checks', is not an object or null.");
      const o = rsc as Record<string, Json>;
      if (!("strict" in o) || (!("contexts" in o) && !("checks" in o))) return httpError(422, `Invalid request.\n\n"strict", "contexts" weren't supplied.`);
      const list = (o.checks ?? o.contexts) as Json;
      if (!Array.isArray(list)) return httpError(422, "Invalid request.\n\nFor 'properties/contexts', is not an array.");
      contexts = list.map((c) => (c && typeof c === "object" && !Array.isArray(c) ? String((c as Record<string, Json>).context ?? "") : String(c))).filter(Boolean);
    }
    const required = contexts.map((c) => checkOf(w, c));
    const next: World = { ...w, protection: required };
    const notes: TermLine[] = [];
    if (b.required_pull_request_reviews !== null) notes.push(out("(required reviews are not modelled in this sandbox; only the status checks take effect)", "dim"));
    return { actions: [gh({ type: "setProtection", required })], output: [...show(protection(next)), ...notes] };
  }

  // Environments: GET the list, GET / PUT one (PUT creates it).
  if (rest === "environments") {
    if (method !== "GET") return httpError(404, "Not Found");
    const names = Object.keys(w.envs);
    return ok({ total_count: names.length, environments: names.map((n) => environment(w, n)) });
  }
  m = /^environments\/([\w.-]+)$/.exec(rest);
  if (m) {
    const name = m[1]!;
    if (method === "GET") return w.envs[name] ? ok(environment(w, name)) : httpError(404, "Not Found");
    if (method !== "PUT") return httpError(404, "Not Found");
    const b = body ?? {};
    const reviewers = b.reviewers;
    const notes: TermLine[] = [];
    let approval = false;
    if (reviewers !== undefined && reviewers !== null) {
      if (!Array.isArray(reviewers)) return httpError(422, "Invalid request.\n\nFor 'properties/reviewers', is not an array.");
      for (const r of reviewers) {
        const o = (r ?? {}) as Record<string, Json>;
        if (o.type !== "User" && o.type !== "Team") return httpError(422, "Invalid request.\n\nFor 'properties/type', is not one of User, Team.");
        if (o.type === "Team" || o.id !== USER_ID) return httpError(422, "Validation Failed", { errors: [{ resource: "Environment", code: "invalid", field: "reviewers", message: `Reviewer ${String(o.id)} is not a collaborator on ${OWNER}/${REPO}` }] });
      }
      approval = reviewers.length > 0;
    }
    if (b.wait_timer) notes.push(out("(wait_timer is not modelled in this sandbox)", "dim"));
    if (b.deployment_branch_policy) notes.push(out("(deployment_branch_policy is not modelled in this sandbox)", "dim"));
    const next: World = { ...w, envs: { ...w.envs, [name]: { ...(w.envs[name] ?? { name, sha: null, history: [] }), approval } } };
    return { actions: [gh({ type: "setEnv", name, approval })], output: [...show(environment(next, name)), ...notes] };
  }

  // Waiting deployments of a run: GET who waits, POST to approve.
  m = /^actions\/runs\/(\d+)\/pending_deployments$/.exec(rest);
  if (m) {
    const run = runById(w, Number(m[1]));
    if (!run) return httpError(404, "Not Found");
    const waiting = run.jobs.filter((j) => j.status === "waiting" && j.environment).map((j) => j.environment!);
    const envs = [...new Set(waiting)];
    if (method === "GET")
      return ok(
        envs.map((name) => ({
          environment: { id: envId(name), name, url: `${BASE}/environments/${name}` },
          wait_timer: 0,
          wait_timer_started_at: null,
          current_user_can_approve: true,
          reviewers: [{ type: "User", reviewer: { login: OWNER, id: USER_ID } }],
        })),
      );
    if (method !== "POST") return httpError(404, "Not Found");
    const b = body ?? {};
    const missing = ["environment_ids", "state", "comment"].filter((k) => !(k in b));
    if (missing.length) return httpError(422, `Invalid request.\n\n${missing.map((k) => `"${k}"`).join(", ")} ${missing.length > 1 ? "weren't" : "wasn't"} supplied.`);
    if (b.state !== "approved" && b.state !== "rejected") return httpError(422, "Invalid request.\n\nFor 'properties/state', is not one of approved, rejected.");
    const ids = Array.isArray(b.environment_ids) ? b.environment_ids.map(Number) : [];
    const target = envs.find((n) => ids.includes(envId(n)));
    if (!envs.length || !target) return httpError(422, "No pending deployment requests to approve or reject");
    if (b.state === "rejected") return { actions: [], output: [out("(rejecting a deployment is not in this sandbox: leave it waiting, or approve it)", "dim")], failed: true };
    return { actions: [gh({ type: "approve", run: run.id })], output: show([{ url: `${BASE}/deployments/${run.id}000`, id: Number(`${run.id}000`), environment: target, ref: run.branch, sha: run.sha }]) };
  }

  if (rest === "rulesets" && method === "GET") return ok([]);
  return sandboxOnly(path);
}

function sandboxOnly(path: string): ApiResult {
  return {
    ...httpError(404, "Not Found"),
    output: [
      ...httpError(404, "Not Found").output,
      out(`(this sandbox answers: user, repos/{owner}/{repo}/branches/main/protection, …/environments[/NAME], …/actions/runs/ID/pending_deployments — not ${path})`, "dim"),
    ],
  };
}
