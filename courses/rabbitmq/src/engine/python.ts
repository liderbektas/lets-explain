/**
 * Just enough Python to run the pika snippets the course teaches: assignments, `for` over a
 * list or `range(n)`, `def` (kept for callbacks), `print`, and calls with keyword arguments.
 * The values it understands are strings (also b"…" and f"…"), numbers, booleans, None, lists,
 * dicts, and a few pika objects. Anything else is reported as outside the sandbox.
 */

export type Py =
  | string
  | number
  | boolean
  | null
  | Py[]
  | { [k: string]: Py }
  | PyObj;

export interface PyObj {
  __obj: string;
  [k: string]: unknown;
}

export const isObj = (v: unknown): v is PyObj => typeof v === "object" && v !== null && !Array.isArray(v) && "__obj" in v;

export class PyError extends Error {
  constructor(
    readonly kind: string,
    message: string,
  ) {
    super(message);
  }
}

/* ------------------------------------------------------------- statements */

export interface Stmt {
  line: number;
  text: string;
  indent: number;
  body: Stmt[];
}

/** Joins lines inside open brackets, drops comments and blanks, and nests blocks by indentation. */
export function parseBlocks(source: string): Stmt[] {
  const raw = source.split("\n");
  const flat: { line: number; text: string; indent: number }[] = [];
  let buf = "";
  let start = 0;
  let depth = 0;
  for (let i = 0; i < raw.length; i++) {
    const line = stripComment(raw[i]!);
    if (!buf && !line.trim()) continue;
    if (!buf) start = i;
    buf += (buf ? " " : "") + (buf ? line.trim() : line.replace(/\s+$/, ""));
    depth = bracketDepth(buf);
    if (depth <= 0) {
      const indent = buf.length - buf.trimStart().length;
      flat.push({ line: start + 1, text: buf.trim(), indent });
      buf = "";
    }
  }
  if (buf) throw new PyError("SyntaxError", "'(' was never closed");
  const root: Stmt = { line: 0, text: "", indent: -1, body: [] };
  const stack: Stmt[] = [root];
  for (const f of flat) {
    while (stack.length > 1 && f.indent <= stack[stack.length - 1]!.indent) stack.pop();
    const s: Stmt = { ...f, body: [] };
    stack[stack.length - 1]!.body.push(s);
    if (f.text.endsWith(":")) stack.push(s);
  }
  return root.body;
}

function stripComment(line: string): string {
  let quote: string | null = null;
  for (let i = 0; i < line.length; i++) {
    const c = line[i]!;
    if (quote) {
      if (c === "\\") i++;
      else if (c === quote) quote = null;
    } else if (c === '"' || c === "'") quote = c;
    else if (c === "#") return line.slice(0, i);
  }
  return line;
}

function bracketDepth(s: string): number {
  let d = 0;
  let quote: string | null = null;
  for (let i = 0; i < s.length; i++) {
    const c = s[i]!;
    if (quote) {
      if (c === "\\") i++;
      else if (c === quote) quote = null;
    } else if (c === '"' || c === "'") quote = c;
    else if ("([{".includes(c)) d++;
    else if (")]}".includes(c)) d--;
  }
  return d;
}

/* ------------------------------------------------------------ expressions */

export interface Call {
  /** Dotted name of what is called, e.g. "ch.basic_publish" or "pika.BasicProperties". */
  callee: string;
  args: Py[];
  kwargs: Record<string, Py>;
}

export interface Env {
  vars: Record<string, Py>;
  /** Called for every call the evaluator cannot do itself; returns the call's value. */
  call: (c: Call) => Py;
}

export function evaluate(src: string, env: Env): Py {
  const p = new Parser(src, env);
  const v = p.expr();
  p.ws();
  if (p.i < src.length) throw new PyError("SyntaxError", "invalid syntax");
  return v;
}

class Parser {
  i = 0;
  constructor(
    readonly s: string,
    readonly env: Env,
  ) {}

  ws() {
    while (this.i < this.s.length && /\s/.test(this.s[this.i]!)) this.i++;
  }
  peek(t: string) {
    this.ws();
    return this.s.startsWith(t, this.i);
  }
  eat(t: string) {
    if (!this.peek(t)) throw new PyError("SyntaxError", "invalid syntax");
    this.i += t.length;
  }

  expr(): Py {
    let v = this.postfix();
    // String concatenation and a plain `+` on numbers, enough for keys built from parts.
    while (this.peek("+") && !this.peek("+=")) {
      this.i++;
      const r = this.postfix();
      if (typeof v === "string" && typeof r === "string") v = v + r;
      else if (typeof v === "number" && typeof r === "number") v = v + r;
      else throw new PyError("TypeError", "unsupported operand type(s) for +");
    }
    return v;
  }

  postfix(): Py {
    this.ws();
    let name = "";
    let value: Py | undefined;
    const id = /^[A-Za-z_][A-Za-z0-9_]*/.exec(this.s.slice(this.i));
    if (id && !/^[bfBF]["']/.test(this.s.slice(this.i, this.i + 2))) {
      this.i += id[0].length;
      name = id[0];
      while (this.peek(".")) {
        this.i++;
        this.ws();
        const m = /^[A-Za-z_][A-Za-z0-9_]*/.exec(this.s.slice(this.i));
        if (!m) throw new PyError("SyntaxError", "invalid syntax");
        this.i += m[0].length;
        name += `.${m[0]}`;
      }
      if (this.peek("(")) {
        const { args, kwargs } = this.callArgs();
        value = this.invoke(name, args, kwargs);
      } else value = this.lookup(name);
    } else value = this.atom();
    while (this.peek("[")) {
      this.i++;
      const k = this.expr();
      this.eat("]");
      if (Array.isArray(value) && typeof k === "number") value = value[k] ?? null;
      else if (value && typeof value === "object" && !Array.isArray(value) && typeof k === "string") value = (value as Record<string, Py>)[k] ?? null;
      else throw new PyError("TypeError", "object is not subscriptable");
    }
    // A method on a value, such as "x".encode() or body.decode().
    while (this.peek(".")) {
      this.i++;
      const m = /^[A-Za-z_][A-Za-z0-9_]*/.exec(this.s.slice(this.i));
      if (!m) throw new PyError("SyntaxError", "invalid syntax");
      this.i += m[0].length;
      if (this.peek("(")) this.callArgs();
      if (typeof value === "string" && ["encode", "decode", "strip", "lower", "upper"].includes(m[0])) {
        value = m[0] === "lower" ? value.toLowerCase() : m[0] === "upper" ? value.toUpperCase() : m[0] === "strip" ? value.trim() : value;
      } else if (isObj(value) && m[0] in value) value = value[m[0]] as Py;
      else throw new PyError("AttributeError", `object has no attribute '${m[0]}'`);
    }
    return value;
  }

  callArgs(): { args: Py[]; kwargs: Record<string, Py> } {
    this.eat("(");
    const args: Py[] = [];
    const kwargs: Record<string, Py> = {};
    while (!this.peek(")")) {
      const kw = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=(?!=)/.exec(this.s.slice(this.i));
      if (kw) {
        this.i += kw[0].length;
        kwargs[kw[1]!] = this.expr();
      } else args.push(this.expr());
      if (!this.peek(")")) this.eat(",");
    }
    this.eat(")");
    return { args, kwargs };
  }

  lookup(name: string): Py {
    if (name === "True") return true;
    if (name === "False") return false;
    if (name === "None") return null;
    if (name === "pika.DeliveryMode.Persistent") return 2;
    if (name === "pika.DeliveryMode.Transient") return 1;
    const [head, ...rest] = name.split(".");
    if (!(head! in this.env.vars)) throw new PyError("NameError", `name '${head}' is not defined`);
    let v: Py = this.env.vars[head!]!;
    for (const part of rest) {
      if (isObj(v) && part in v) v = v[part] as Py;
      else if (v && typeof v === "object" && !Array.isArray(v) && part in v) v = (v as Record<string, Py>)[part]!;
      else throw new PyError("AttributeError", `'${typeName(v)}' object has no attribute '${part}'`);
    }
    return v;
  }

  invoke(name: string, args: Py[], kwargs: Record<string, Py>): Py {
    if (name === "range") {
      const [a, b] = args.map(Number);
      const [from, to] = b === undefined ? [0, a!] : [a!, b];
      return Array.from({ length: Math.max(0, to - from) }, (_, k) => from + k);
    }
    if (name === "str") return pyStr(args[0] ?? "");
    if (name === "int") return Number(args[0]);
    if (name === "len") return Array.isArray(args[0]) || typeof args[0] === "string" ? args[0].length : 0;
    if (name === "json.dumps") return JSON.stringify(args[0]);
    return this.env.call({ callee: name, args, kwargs });
  }

  atom(): Py {
    this.ws();
    const c = this.s[this.i];
    if (c === undefined) throw new PyError("SyntaxError", "invalid syntax");
    const str = /^([bfBF]?)("|')/.exec(this.s.slice(this.i));
    if (str) {
      this.i += str[0].length;
      const q = str[2]!;
      let out = "";
      while (this.i < this.s.length && this.s[this.i] !== q) {
        if (this.s[this.i] === "\\") {
          const n = this.s[this.i + 1];
          out += n === "n" ? "\n" : (n ?? "");
          this.i += 2;
        } else out += this.s[this.i++];
      }
      if (this.s[this.i] !== q) throw new PyError("SyntaxError", "unterminated string literal");
      this.i++;
      if (str[1]!.toLowerCase() === "f") {
        return out.replace(/\{([^}]+)\}/g, (_, e: string) => pyStr(evaluate(e, this.env)));
      }
      return out;
    }
    const num = /^-?\d+(\.\d+)?/.exec(this.s.slice(this.i));
    if (num) {
      this.i += num[0].length;
      return Number(num[0]);
    }
    if (c === "[") {
      this.i++;
      const out: Py[] = [];
      while (!this.peek("]")) {
        out.push(this.expr());
        if (!this.peek("]")) this.eat(",");
      }
      this.eat("]");
      return out;
    }
    if (c === "{") {
      this.i++;
      const out: Record<string, Py> = {};
      while (!this.peek("}")) {
        const k = this.expr();
        this.eat(":");
        out[pyStr(k)] = this.expr();
        if (!this.peek("}")) this.eat(",");
      }
      this.eat("}");
      return out;
    }
    if (c === "(") {
      this.i++;
      const v = this.expr();
      this.eat(")");
      return v;
    }
    throw new PyError("SyntaxError", "invalid syntax");
  }
}

export function pyStr(v: Py | undefined): string {
  if (v === null || v === undefined) return "None";
  if (v === true) return "True";
  if (v === false) return "False";
  if (typeof v === "string" || typeof v === "number") return String(v);
  if (Array.isArray(v)) return `[${v.map(pyRepr).join(", ")}]`;
  if (isObj(v)) return `<${v.__obj}>`;
  return `{${Object.entries(v).map(([k, x]) => `'${k}': ${pyRepr(x)}`).join(", ")}}`;
}

const pyRepr = (v: Py): string => (typeof v === "string" ? `'${v}'` : pyStr(v));

function typeName(v: Py): string {
  if (isObj(v)) return v.__obj;
  if (typeof v === "string") return "str";
  if (typeof v === "number") return "int";
  if (Array.isArray(v)) return "list";
  if (v === null) return "NoneType";
  return typeof v === "object" ? "dict" : "bool";
}
