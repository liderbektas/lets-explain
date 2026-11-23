/**
 * Just enough JavaScript to run the amqplib snippets the course teaches: `import`/`require`,
 * `const`/`let`, functions and arrow functions (async or not, called or kept as callbacks),
 * `if`/`else`, `for…of` and counting `for` loops, `try`/`catch`, template literals, objects,
 * arrays, `await`, `console.log` and a few globals (Buffer, JSON, Math, setTimeout…).
 *
 * The reader runs everything at once, in order: `await` hands back the value at once, and
 * timers run after the file's own code. Library objects (amqplib) come from the host as
 * `HostObj`s whose methods are `Native`s. Anything else is reported as outside the sandbox.
 */

export const NODE_VERSION = "v22.12.0";

/* ---------------------------------------------------------------- errors */

/** A syntax error in the file, with the line it is on. */
export class JsSyntaxError extends Error {
  constructor(
    message: string,
    readonly line: number,
  ) {
    super(message);
  }
}

/** A JavaScript exception: `value` is what was thrown, `line` where. */
export class JsThrow extends Error {
  constructor(
    readonly value: Val,
    public line: number,
  ) {
    super(typeof value === "object" && value instanceof HostObj ? String(value.props.message) : String(value));
  }
}

/** Something this sandbox does not run (a `while` loop, a class…); never caught by the file. */
export class SandboxError extends Error {}

/** `process.exit()`. */
export class ExitSignal extends Error {
  constructor(readonly code: number) {
    super("exit");
  }
}

/** A library call made while the reader only looks at a callback (see `Interp.analysing`). */
export class NoEval extends Error {}

class ReturnSig {
  constructor(readonly v: Val) {}
}
class BreakSig {}
class ContinueSig {}
/** The file awaits something that never settles: it just stops there. */
class Halt {}

/* ---------------------------------------------------------------- values */

export type Val = unknown;

/** A function written in the file. */
export class Fn {
  constructor(
    readonly def: FnDef,
    readonly scope: Scope,
  ) {}
  get name() {
    return this.def.name ?? "";
  }
}

/** A function the sandbox provides. `effect` marks library calls (blocked while analysing). */
export class Native {
  constructor(
    readonly name: string,
    readonly call: (args: Val[], self: Val) => Val,
    readonly effect = false,
  ) {}
}

/** An object the sandbox provides (a Buffer, a Promise, an Error, an amqplib channel…). */
export class HostObj {
  constructor(
    readonly kind: string,
    readonly props: Record<string, Val> = {},
  ) {}
}

export const isHost = (v: Val, kind?: string): v is HostObj => v instanceof HostObj && (kind === undefined || v.kind === kind);

/** A Node Buffer holding text. A `symbolic` one stands for a message body not known yet. */
export function makeBuffer(text: string, symbolic = false): HostObj {
  const bytes = [...new TextEncoder().encode(text)];
  return new HostObj("Buffer", {
    text,
    symbolic,
    length: bytes.length,
    toString: new Native("toString", () => text),
    toJSON: new Native("toJSON", () => ({ type: "Buffer", data: bytes })),
  });
}

export function makeError(name: string, message: string, extra: Record<string, Val> = {}): HostObj {
  return new HostObj("Error", { name, message, stack: `${name}: ${message}`, ...extra });
}

export const jsErr = (name: string, message: string, line = 0, extra: Record<string, Val> = {}) => new JsThrow(makeError(name, message, extra), line);

/* ----------------------------------------------------------------- scope */

export class Scope {
  readonly vars = new Map<string, { v: Val; c: boolean }>();
  constructor(readonly parent: Scope | null) {}
  find(name: string): { v: Val; c: boolean } | undefined {
    for (let s: Scope | null = this; s; s = s.parent) {
      const x = s.vars.get(name);
      if (x) return x;
    }
    return undefined;
  }
  declare(name: string, v: Val, c = false) {
    this.vars.set(name, { v, c });
  }
}

/* ---------------------------------------------------------------- tokens */

interface Tok {
  t: "id" | "num" | "str" | "tpl" | "punc" | "eof";
  v: string;
  num?: number;
  parts?: { strs: string[]; exprs: { src: string; at: number }[] };
  at: number;
  to: number;
  line: number;
  /** A line break comes before this token. */
  nl: boolean;
}

const PUNCS = [
  "...", "===", "!==", "**=", "??=", "||=", "&&=", "=>", "==", "!=", "<=", ">=", "&&", "||", "??", "?.", "++", "--", "+=", "-=", "*=", "/=", "%=", "**",
  "{", "}", "(", ")", "[", "]", ";", ",", ".", ":", "?", "=", "+", "-", "*", "/", "%", "<", ">", "!", "&", "|", "^", "~", "@", "#",
];

const lineAt = (src: string, at: number) => src.slice(0, at).split("\n").length;

function readEscape(src: string, i: number): [string, number] {
  const n = src[i + 1] ?? "";
  const simple: Record<string, string> = { n: "\n", t: "\t", r: "\r", b: "\b", f: "\f", v: "\v", "0": "\0" };
  if (n in simple) return [simple[n]!, i + 2];
  if (n === "u") {
    const m = /^\{([0-9a-fA-F]+)\}|^([0-9a-fA-F]{4})/.exec(src.slice(i + 2));
    if (m) return [String.fromCodePoint(parseInt(m[1] ?? m[2]!, 16)), i + 2 + m[0].length];
  }
  if (n === "x") {
    const m = /^[0-9a-fA-F]{2}/.exec(src.slice(i + 2));
    if (m) return [String.fromCharCode(parseInt(m[0], 16)), i + 4];
  }
  if (n === "\n") return ["", i + 2];
  return [n, i + 2];
}

/** Tokens of `src`, which starts at offset `base` of the whole file `full` (for template pieces). */
export function tokenize(src: string, base = 0, full = src): Tok[] {
  const toks: Tok[] = [];
  let i = 0;
  let nl = false;
  const line = (at: number) => lineAt(full, base + at);
  while (i < src.length) {
    const c = src[i]!;
    if (c === "\n") {
      nl = true;
      i++;
      continue;
    }
    if (/\s/.test(c)) {
      i++;
      continue;
    }
    if (c === "/" && src[i + 1] === "/") {
      while (i < src.length && src[i] !== "\n") i++;
      continue;
    }
    if (c === "/" && src[i + 1] === "*") {
      const end = src.indexOf("*/", i + 2);
      if (end < 0) throw new JsSyntaxError("Invalid or unexpected token", line(i));
      if (src.slice(i, end).includes("\n")) nl = true;
      i = end + 2;
      continue;
    }
    const at = i;
    const push = (t: Tok["t"], v: string, extra: Partial<Tok> = {}) => {
      toks.push({ t, v, at: base + at, to: base + i, line: line(at), nl, ...extra });
      nl = false;
    };
    const id = /^[A-Za-z_$][\w$]*/.exec(src.slice(i));
    if (id) {
      i += id[0].length;
      push("id", id[0]);
      continue;
    }
    const num = /^(?:0[xX][0-9a-fA-F_]+|0[bB][01_]+|(?:\d[\d_]*(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?)n?/.exec(src.slice(i));
    if (num) {
      i += num[0].length;
      const text = num[0].replace(/_/g, "").replace(/n$/, "");
      push("num", num[0], { num: Number(text) });
      continue;
    }
    if (c === '"' || c === "'") {
      let out = "";
      i++;
      while (i < src.length && src[i] !== c) {
        if (src[i] === "\n") throw new JsSyntaxError("Invalid or unexpected token", line(at));
        if (src[i] === "\\") {
          const [s, j] = readEscape(src, i);
          out += s;
          i = j;
        } else out += src[i++];
      }
      if (src[i] !== c) throw new JsSyntaxError("Invalid or unexpected token", line(at));
      i++;
      push("str", out);
      continue;
    }
    if (c === "`") {
      const strs: string[] = [];
      const exprs: { src: string; at: number }[] = [];
      let cur = "";
      i++;
      while (i < src.length && src[i] !== "`") {
        if (src[i] === "\\") {
          const [s, j] = readEscape(src, i);
          cur += s;
          i = j;
        } else if (src[i] === "$" && src[i + 1] === "{") {
          strs.push(cur);
          cur = "";
          const start = i + 2;
          const end = matchBrace(src, start);
          if (end < 0) throw new JsSyntaxError("Unterminated template literal", line(at));
          exprs.push({ src: src.slice(start, end), at: base + start });
          i = end + 1;
        } else cur += src[i++];
      }
      if (src[i] !== "`") throw new JsSyntaxError("Unterminated template literal", line(at));
      i++;
      strs.push(cur);
      push("tpl", src.slice(at, i), { parts: { strs, exprs } });
      continue;
    }
    const p = PUNCS.find((x) => src.startsWith(x, i));
    if (p) {
      // `?.5` is a conditional with a number, not optional chaining.
      if (p === "?." && /\d/.test(src[i + 2] ?? "")) {
        i += 1;
        push("punc", "?");
        continue;
      }
      i += p.length;
      push("punc", p);
      continue;
    }
    throw new JsSyntaxError("Invalid or unexpected token", line(at));
  }
  toks.push({ t: "eof", v: "", at: base + src.length, to: base + src.length, line: line(src.length), nl: true });
  return toks;
}

/** Where the `}` closing a `${` is, skipping strings, templates and nested braces. */
function matchBrace(src: string, i: number): number {
  let depth = 0;
  while (i < src.length) {
    const c = src[i]!;
    if (c === '"' || c === "'") {
      i++;
      while (i < src.length && src[i] !== c) i += src[i] === "\\" ? 2 : 1;
    } else if (c === "`") {
      i++;
      while (i < src.length && src[i] !== "`") {
        if (src[i] === "\\") i += 2;
        else if (src[i] === "$" && src[i + 1] === "{") {
          const end = matchBrace(src, i + 2);
          if (end < 0) return -1;
          i = end + 1;
        } else i++;
      }
    } else if (c === "{") depth++;
    else if (c === "}") {
      if (depth === 0) return i;
      depth--;
    }
    i++;
  }
  return -1;
}

/* ------------------------------------------------------------------- AST */

interface Node {
  at: number;
  to: number;
}

export type Pattern =
  | ({ k: "id"; name: string } & Node)
  | ({ k: "opat"; props: { key: string; value: Pattern }[]; rest?: string } & Node)
  | ({ k: "apat"; items: (Pattern | null)[]; rest?: string } & Node)
  | ({ k: "def"; target: Pattern; def: Expr } & Node);

export interface FnDef extends Node {
  name?: string;
  params: Pattern[];
  rest?: string;
  body: Stmt[] | Expr;
  async: boolean;
  arrow: boolean;
}

export type Prop = { key: string | Expr; value: Expr; spread?: false } | { spread: true; value: Expr };

export type Expr = Node &
  (
    | { k: "lit"; v: Val }
    | { k: "tpl"; strs: string[]; exprs: Expr[] }
    | { k: "id"; name: string }
    | { k: "mem"; obj: Expr; prop: string | Expr; optional: boolean }
    | { k: "call"; callee: Expr; args: Expr[]; optional: boolean }
    | { k: "new"; callee: Expr; args: Expr[] }
    | { k: "arr"; items: Expr[] }
    | { k: "obj"; props: Prop[] }
    | { k: "fn"; fn: FnDef }
    | { k: "un"; op: string; e: Expr }
    | { k: "await"; e: Expr }
    | { k: "bin"; op: string; l: Expr; r: Expr }
    | { k: "cond"; test: Expr; yes: Expr; no: Expr }
    | { k: "assign"; op: string; target: Expr; value: Expr }
    | { k: "update"; op: string; prefix: boolean; target: Expr }
    | { k: "spread"; e: Expr }
    | { k: "bad"; what: string }
  );

export type Stmt = Node & { line: number } & (
    | { k: "expr"; e: Expr }
    | { k: "var"; kind: string; decls: { target: Pattern; init?: Expr }[] }
    | { k: "func"; fn: FnDef }
    | { k: "if"; test: Expr; yes: Stmt[]; no?: Stmt[] }
    | { k: "forof"; kind: string; target: Pattern; iter: Expr; body: Stmt[]; of: boolean }
    | { k: "for"; init?: Stmt; test?: Expr; update?: Expr; body: Stmt[] }
    | { k: "block"; body: Stmt[] }
    | { k: "return"; e?: Expr }
    | { k: "throw"; e: Expr }
    | { k: "try"; block: Stmt[]; param?: Pattern; handler?: Stmt[]; finalizer?: Stmt[] }
    | { k: "import"; source: string; def?: string; ns?: string; named: { name: string; local: string }[] }
    | { k: "empty" }
    | { k: "break" }
    | { k: "continue" }
    | { k: "unsupported"; what: string }
  );

/** A statement before its position is filled in. */
type DistOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
type Bare = DistOmit<Stmt, "at" | "to" | "line">;

/* ---------------------------------------------------------------- parser */

const ASSIGN_OPS = ["=", "+=", "-=", "*=", "/=", "%=", "**=", "??=", "||=", "&&="];
const BIN_PREC: Record<string, number> = {
  "??": 1, "||": 2, "&&": 3, "|": 4, "^": 5, "&": 6,
  "==": 7, "!=": 7, "===": 7, "!==": 7,
  "<": 8, ">": 8, "<=": 8, ">=": 8, instanceof: 8, in: 8,
  "+": 10, "-": 10, "*": 11, "/": 11, "%": 11, "**": 12,
};

/** Parses a file into statements; throws JsSyntaxError with the line of the problem. */
export function parse(source: string): Stmt[] {
  const p = new Parser(tokenize(source), source);
  const out: Stmt[] = [];
  while (p.peek().t !== "eof") out.push(p.statement());
  return out;
}

class Parser {
  i = 0;
  noIn = false;
  constructor(
    readonly toks: Tok[],
    readonly src: string,
  ) {}

  peek(n = 0): Tok {
    return this.toks[Math.min(this.i + n, this.toks.length - 1)]!;
  }
  next(): Tok {
    return this.toks[this.i++] ?? this.toks[this.toks.length - 1]!;
  }
  is(v: string, n = 0): boolean {
    const t = this.peek(n);
    return (t.t === "punc" || t.t === "id") && t.v === v;
  }
  fail(t: Tok = this.peek()): never {
    throw new JsSyntaxError(t.t === "eof" ? "Unexpected end of input" : t.t === "str" || t.t === "tpl" ? "Unexpected string" : t.t === "num" ? "Unexpected number" : t.t === "id" ? `Unexpected identifier '${t.v}'` : `Unexpected token '${t.v}'`, t.line);
  }
  eat(v: string): Tok {
    if (!this.is(v)) this.fail();
    return this.next();
  }
  ident(): string {
    const t = this.peek();
    if (t.t !== "id") this.fail();
    return this.next().v;
  }
  semi() {
    if (this.is(";")) this.next();
    else if (!(this.is("}") || this.peek().t === "eof" || this.peek().nl)) this.fail();
  }
  get last() {
    return this.toks[this.i - 1]!;
  }

  /* --------------------------------------------------------- statements */

  statement(): Stmt {
    const start = this.peek();
    const s = this.statementInner();
    return { ...s, at: start.at, to: this.last.to, line: start.line } as Stmt;
  }

  private statementInner(): Bare {
    const t = this.peek();
    if (this.is(";")) {
      this.next();
      return { k: "empty" };
    }
    if (this.is("{")) return { k: "block", body: this.block() };
    if (t.t === "id") {
      switch (t.v) {
        case "import":
          if (this.is("(", 1) || this.is(".", 1)) break;
          return this.importStmt();
        case "export": {
          this.next();
          if (this.is("default")) this.next();
          if (this.is("{")) {
            this.skipBalanced();
            if (this.is("from")) {
              this.next();
              this.next();
            }
            this.semi();
            return { k: "empty" };
          }
          return this.statementInner();
        }
        case "const":
        case "let":
        case "var": {
          const v = this.varDecl();
          this.semi();
          return v;
        }
        case "function":
          return { k: "func", fn: this.fnDecl(false) };
        case "async":
          if (this.is("function", 1) && !this.peek(1).nl) {
            this.next();
            return { k: "func", fn: this.fnDecl(true) };
          }
          break;
        case "if": {
          this.next();
          this.eat("(");
          const test = this.expr();
          this.eat(")");
          const yes = this.body();
          let no: Stmt[] | undefined;
          if (this.is("else")) {
            this.next();
            no = this.body();
          }
          return { k: "if", test, yes, no };
        }
        case "for":
          return this.forStmt();
        case "return": {
          this.next();
          if (this.is(";") || this.is("}") || this.peek().nl || this.peek().t === "eof") {
            this.semi();
            return { k: "return" };
          }
          const e = this.expr();
          this.semi();
          return { k: "return", e };
        }
        case "throw": {
          this.next();
          const e = this.expr();
          this.semi();
          return { k: "throw", e };
        }
        case "break":
        case "continue":
          this.next();
          this.semi();
          return { k: t.v };
        case "try": {
          this.next();
          const block = this.block();
          let param: Pattern | undefined;
          let handler: Stmt[] | undefined;
          let finalizer: Stmt[] | undefined;
          if (this.is("catch")) {
            this.next();
            if (this.is("(")) {
              this.next();
              param = this.pattern();
              this.eat(")");
            }
            handler = this.block();
          }
          if (this.is("finally")) {
            this.next();
            finalizer = this.block();
          }
          if (!handler && !finalizer) this.fail();
          return { k: "try", block, param, handler, finalizer };
        }
        case "while":
        case "do":
        case "switch":
        case "class":
        case "with": {
          this.next();
          // Skip to the end of the construct: it is valid JavaScript, just not something the sandbox runs.
          if (t.v === "class") while (!this.is("{") && this.peek().t !== "eof") this.next();
          if (this.is("(")) this.skipBalanced();
          if (this.is("{")) this.skipBalanced();
          else if (t.v !== "class") this.statement();
          if (t.v === "do" && this.is("while")) {
            this.next();
            this.skipBalanced();
            this.semi();
          }
          const what = { while: "while loops", do: "do…while loops", switch: "switch", class: "classes", with: "with" }[t.v]!;
          return { k: "unsupported", what };
        }
      }
    }
    const e = this.expr();
    this.semi();
    return { k: "expr", e };
  }

  skipBalanced() {
    const open = this.next();
    const close = { "(": ")", "[": "]", "{": "}" }[open.v];
    if (!close) this.fail(open);
    let depth = 1;
    while (depth > 0) {
      const t = this.next();
      if (t.t === "eof") this.fail(t);
      if (t.t === "punc" && t.v === open.v) depth++;
      else if (t.t === "punc" && t.v === close) depth--;
    }
  }

  block(): Stmt[] {
    this.eat("{");
    const out: Stmt[] = [];
    while (!this.is("}")) {
      if (this.peek().t === "eof") this.fail();
      out.push(this.statement());
    }
    this.next();
    return out;
  }

  /** The body of an if or a loop: a block or one statement. */
  body(): Stmt[] {
    if (this.is("{")) return this.block();
    return [this.statement()];
  }

  importStmt(): Bare {
    this.next();
    const named: { name: string; local: string }[] = [];
    let def: string | undefined;
    let ns: string | undefined;
    if (this.peek().t === "str") {
      const source = this.next().v;
      this.semi();
      return { k: "import", source, named };
    }
    if (this.peek().t === "id" && !this.is("from")) def = this.ident();
    else if (this.is("from") && this.is("from", 1)) def = this.ident();
    if (def && this.is(",")) this.next();
    if (this.is("*")) {
      this.next();
      if (this.ident() !== "as") this.fail(this.last);
      ns = this.ident();
    } else if (this.is("{")) {
      this.next();
      while (!this.is("}")) {
        const t = this.next();
        if (t.t !== "id" && t.t !== "str") this.fail(t);
        let local = t.v;
        if (this.is("as")) {
          this.next();
          local = this.ident();
        }
        named.push({ name: t.v, local });
        if (!this.is("}")) this.eat(",");
      }
      this.next();
    }
    if (!this.is("from")) this.fail();
    this.next();
    const src = this.next();
    if (src.t !== "str") this.fail(src);
    this.semi();
    return { k: "import", source: src.v, def, ns, named };
  }

  varDecl(): Extract<Stmt, { k: "var" }> {
    const start = this.peek();
    const kind = this.next().v;
    const decls: { target: Pattern; init?: Expr }[] = [];
    do {
      if (decls.length) this.next();
      const target = this.pattern();
      let init: Expr | undefined;
      if (this.is("=")) {
        this.next();
        init = this.assign();
      } else if (kind === "const" && !this.is("of") && !this.is("in")) throw new JsSyntaxError("Missing initializer in const declaration", this.peek().line);
      decls.push({ target, init });
    } while (this.is(","));
    return { k: "var", kind, decls, at: start.at, to: this.last.to, line: start.line };
  }

  forStmt(): Bare {
    this.next();
    if (this.is("await")) return this.skipUnsupported("for await loops");
    this.eat("(");
    let init: Stmt | undefined;
    if (this.is("const") || this.is("let") || this.is("var")) {
      const start = this.peek();
      if (this.peek(2).t === "id" && (this.is("of", 2) || this.is("in", 2))) {
        const kind = this.next().v;
        const target = this.pattern();
        return this.forOfRest(kind, target);
      }
      if ((this.is("{", 1) || this.is("[", 1)) && this.patternThenOf()) {
        const kind = this.next().v;
        const target = this.pattern();
        return this.forOfRest(kind, target);
      }
      this.noIn = true;
      init = { ...this.varDecl(), line: start.line };
      this.noIn = false;
    } else if (!this.is(";")) {
      const start = this.peek();
      if (start.t === "id" && (this.is("of", 1) || this.is("in", 1))) {
        const target: Pattern = { k: "id", name: this.next().v, at: start.at, to: start.to };
        return this.forOfRest("", target);
      }
      const e = this.expr();
      init = { k: "expr", e, at: start.at, to: this.last.to, line: start.line };
    }
    this.eat(";");
    const test = this.is(";") ? undefined : this.expr();
    this.eat(";");
    const update = this.is(")") ? undefined : this.expr();
    this.eat(")");
    return { k: "for", init, test, update, body: this.body() };
  }

  /** After `for (const`: does a destructuring pattern come before `of`/`in`? */
  patternThenOf(): boolean {
    const save = this.i;
    try {
      this.next();
      this.pattern();
      return this.is("of") || this.is("in");
    } catch {
      return false;
    } finally {
      this.i = save;
    }
  }

  forOfRest(kind: string, target: Pattern): Bare {
    const of = this.next().v === "of";
    const iter = this.expr();
    this.eat(")");
    return { k: "forof", kind, target, iter, body: this.body(), of };
  }

  skipUnsupported(what: string): Bare {
    while (!this.is("(")) this.next();
    this.skipBalanced();
    this.body();
    return { k: "unsupported", what };
  }

  /* ----------------------------------------------------------- patterns */

  pattern(): Pattern {
    const t = this.peek();
    let p: Pattern;
    if (this.is("{")) {
      this.next();
      const props: { key: string; value: Pattern }[] = [];
      let rest: string | undefined;
      while (!this.is("}")) {
        if (this.is("...")) {
          this.next();
          rest = this.ident();
        } else {
          const kt = this.next();
          if (kt.t !== "id" && kt.t !== "str" && kt.t !== "num") this.fail(kt);
          let value: Pattern;
          if (this.is(":")) {
            this.next();
            value = this.pattern();
          } else {
            if (kt.t !== "id") this.fail();
            value = { k: "id", name: kt.v, at: kt.at, to: kt.to };
            if (this.is("=")) {
              this.next();
              value = { k: "def", target: value, def: this.assign(), at: kt.at, to: this.last.to };
            }
          }
          props.push({ key: kt.v, value });
        }
        if (!this.is("}")) this.eat(",");
      }
      this.next();
      p = { k: "opat", props, rest, at: t.at, to: this.last.to };
    } else if (this.is("[")) {
      this.next();
      const items: (Pattern | null)[] = [];
      let rest: string | undefined;
      while (!this.is("]")) {
        if (this.is(",")) {
          this.next();
          items.push(null);
          continue;
        }
        if (this.is("...")) {
          this.next();
          rest = this.ident();
        } else items.push(this.pattern());
        if (!this.is("]")) this.eat(",");
      }
      this.next();
      p = { k: "apat", items, rest, at: t.at, to: this.last.to };
    } else {
      const name = this.ident();
      p = { k: "id", name, at: t.at, to: t.to };
    }
    return p;
  }

  params(): { params: Pattern[]; rest?: string } {
    this.eat("(");
    const params: Pattern[] = [];
    let rest: string | undefined;
    while (!this.is(")")) {
      if (this.is("...")) {
        this.next();
        rest = this.ident();
      } else {
        const start = this.peek();
        let p = this.pattern();
        if (this.is("=")) {
          this.next();
          p = { k: "def", target: p, def: this.assign(), at: start.at, to: this.last.to };
        }
        params.push(p);
      }
      if (!this.is(")")) this.eat(",");
    }
    this.next();
    return { params, rest };
  }

  fnDecl(isAsync: boolean): FnDef {
    const start = this.eat("function");
    if (this.is("*")) this.fail();
    const name = this.peek().t === "id" ? this.next().v : undefined;
    const { params, rest } = this.params();
    const body = this.block();
    return { name, params, rest, body, async: isAsync, arrow: false, at: start.at, to: this.last.to };
  }

  /* -------------------------------------------------------- expressions */

  expr(): Expr {
    return this.assign();
  }

  /** Is the token at `n` the start of an arrow function's parameters? */
  arrowAhead(n = 0): boolean {
    const t = this.peek(n);
    if (t.t === "id" && this.is("=>", n + 1) && !this.peek(n + 1).nl) return true;
    if (!this.is("(", n)) return false;
    let depth = 0;
    for (let k = n; ; k++) {
      const x = this.peek(k);
      if (x.t === "eof") return false;
      if (x.t === "punc" && "([{".includes(x.v)) depth++;
      else if (x.t === "punc" && ")]}".includes(x.v)) {
        depth--;
        if (depth === 0) return this.is("=>", k + 1);
      }
    }
  }

  arrow(isAsync: boolean, start: Tok): Expr {
    let params: Pattern[];
    let rest: string | undefined;
    if (this.peek().t === "id") {
      const t = this.next();
      params = [{ k: "id", name: t.v, at: t.at, to: t.to }];
    } else ({ params, rest } = this.params());
    this.eat("=>");
    const body: Stmt[] | Expr = this.is("{") ? this.block() : this.assign();
    const fn: FnDef = { params, rest, body, async: isAsync, arrow: true, at: start.at, to: this.last.to };
    return { k: "fn", fn, at: start.at, to: this.last.to };
  }

  assign(): Expr {
    const start = this.peek();
    if (this.is("async") && !this.peek(1).nl && this.arrowAhead(1)) {
      this.next();
      return this.arrow(true, start);
    }
    if (this.arrowAhead()) return this.arrow(false, start);
    const left = this.conditional();
    const op = this.peek();
    if (op.t === "punc" && ASSIGN_OPS.includes(op.v)) {
      if (left.k !== "id" && left.k !== "mem") throw new JsSyntaxError("Invalid left-hand side in assignment", op.line);
      this.next();
      const value = this.assign();
      return { k: "assign", op: op.v, target: left, value, at: start.at, to: this.last.to };
    }
    return left;
  }

  conditional(): Expr {
    const start = this.peek();
    const test = this.binary(0);
    if (!this.is("?")) return test;
    this.next();
    const yes = this.assign();
    this.eat(":");
    const no = this.assign();
    return { k: "cond", test, yes, no, at: start.at, to: this.last.to };
  }

  binary(min: number): Expr {
    const start = this.peek();
    let left = this.unary();
    for (;;) {
      const t = this.peek();
      const prec = (t.t === "punc" || (t.t === "id" && (t.v === "instanceof" || (t.v === "in" && !this.noIn)))) ? BIN_PREC[t.v] : undefined;
      if (prec === undefined || prec <= min) {
        if (!(prec !== undefined && t.v === "**" && prec === min)) return left;
      }
      this.next();
      const right = this.binary(t.v === "**" ? prec - 1 : prec);
      left = { k: "bin", op: t.v, l: left, r: right, at: start.at, to: this.last.to };
    }
  }

  unary(): Expr {
    const t = this.peek();
    if (t.t === "punc" && ["!", "-", "+", "~"].includes(t.v)) {
      this.next();
      return { k: "un", op: t.v, e: this.unary(), at: t.at, to: this.last.to };
    }
    if (t.t === "punc" && (t.v === "++" || t.v === "--")) {
      this.next();
      const target = this.unary();
      return { k: "update", op: t.v, prefix: true, target, at: t.at, to: this.last.to };
    }
    if (t.t === "id" && ["typeof", "void", "delete"].includes(t.v)) {
      this.next();
      return { k: "un", op: t.v, e: this.unary(), at: t.at, to: this.last.to };
    }
    if (t.t === "id" && t.v === "await") {
      this.next();
      return { k: "await", e: this.unary(), at: t.at, to: this.last.to };
    }
    const e = this.postfix();
    const n = this.peek();
    if (n.t === "punc" && (n.v === "++" || n.v === "--") && !n.nl) {
      this.next();
      return { k: "update", op: n.v, prefix: false, target: e, at: t.at, to: this.last.to };
    }
    return e;
  }

  args(): Expr[] {
    this.eat("(");
    const out: Expr[] = [];
    while (!this.is(")")) {
      if (this.is("...")) {
        const s = this.next();
        out.push({ k: "spread", e: this.assign(), at: s.at, to: this.last.to });
      } else out.push(this.assign());
      if (!this.is(")")) this.eat(",");
    }
    this.next();
    return out;
  }

  propName(): string {
    const t = this.next();
    if (t.t !== "id") this.fail(t);
    return t.v;
  }

  postfix(): Expr {
    const start = this.peek();
    let e: Expr;
    if (this.is("new")) {
      this.next();
      let callee = this.primary();
      while (this.is(".")) {
        this.next();
        callee = { k: "mem", obj: callee, prop: this.propName(), optional: false, at: start.at, to: this.last.to };
      }
      const args = this.is("(") ? this.args() : [];
      e = { k: "new", callee, args, at: start.at, to: this.last.to };
    } else e = this.primary();
    for (;;) {
      if (this.is(".")) {
        this.next();
        e = { k: "mem", obj: e, prop: this.propName(), optional: false, at: start.at, to: this.last.to };
      } else if (this.is("?.")) {
        this.next();
        if (this.is("(")) e = { k: "call", callee: e, args: this.args(), optional: true, at: start.at, to: this.last.to };
        else if (this.is("[")) {
          this.next();
          const prop = this.expr();
          this.eat("]");
          e = { k: "mem", obj: e, prop, optional: true, at: start.at, to: this.last.to };
        } else e = { k: "mem", obj: e, prop: this.propName(), optional: true, at: start.at, to: this.last.to };
      } else if (this.is("[")) {
        this.next();
        const prop = this.expr();
        this.eat("]");
        e = { k: "mem", obj: e, prop, optional: false, at: start.at, to: this.last.to };
      } else if (this.is("(")) {
        e = { k: "call", callee: e, args: this.args(), optional: false, at: start.at, to: this.last.to };
      } else if (this.peek().t === "tpl" && !this.peek().nl) {
        this.next();
        e = { k: "bad", what: "tagged templates", at: start.at, to: this.last.to };
      } else return e;
    }
  }

  primary(): Expr {
    const t = this.peek();
    const node = <T extends object>(x: T) => ({ ...x, at: t.at, to: this.last.to }) as unknown as Expr;
    switch (t.t) {
      case "num":
        this.next();
        return node({ k: "lit", v: t.num });
      case "str":
        this.next();
        return node({ k: "lit", v: t.v });
      case "tpl": {
        this.next();
        const parts = t.parts!;
        const exprs = parts.exprs.map((x) => {
          const sub = new Parser(tokenize(x.src, x.at, this.src), this.src);
          const e = sub.expr();
          if (sub.peek().t !== "eof") sub.fail();
          return e;
        });
        return node({ k: "tpl", strs: parts.strs, exprs });
      }
      case "id": {
        if (t.v === "function" || (t.v === "async" && this.is("function", 1) && !this.peek(1).nl)) {
          const isAsync = t.v === "async";
          if (isAsync) this.next();
          const fn = this.fnDecl(isAsync);
          return { k: "fn", fn, at: t.at, to: this.last.to };
        }
        if (t.v === "class") {
          this.next();
          while (!this.is("{")) this.next();
          this.skipBalanced();
          return node({ k: "bad", what: "classes" });
        }
        const RESERVED = ["const", "let", "var", "if", "else", "for", "while", "return", "import", "export", "throw", "try", "catch", "finally", "switch", "case", "do", "break", "continue", "in", "of", "instanceof"];
        if (RESERVED.includes(t.v) && !(t.v === "of")) this.fail();
        this.next();
        if (t.v === "true") return node({ k: "lit", v: true });
        if (t.v === "false") return node({ k: "lit", v: false });
        if (t.v === "null") return node({ k: "lit", v: null });
        if (t.v === "undefined") return node({ k: "lit", v: undefined });
        if (t.v === "import" && this.is("(")) {
          this.args();
          return node({ k: "bad", what: "import()" });
        }
        return node({ k: "id", name: t.v });
      }
      case "punc": {
        if (t.v === "(") {
          this.next();
          const e = this.expr();
          this.eat(")");
          return e;
        }
        if (t.v === "[") {
          this.next();
          const items: Expr[] = [];
          while (!this.is("]")) {
            if (this.is("...")) {
              const s = this.next();
              items.push({ k: "spread", e: this.assign(), at: s.at, to: this.last.to });
            } else items.push(this.assign());
            if (!this.is("]")) this.eat(",");
          }
          this.next();
          return node({ k: "arr", items });
        }
        if (t.v === "{") return this.object();
        if (t.v === "/") {
          // A regular expression literal.
          this.next();
          while (!this.is("/") && !this.peek().nl && this.peek().t !== "eof") this.next();
          if (this.is("/")) this.next();
          if (this.peek().t === "id" && !this.peek().nl) this.next();
          return node({ k: "bad", what: "regular expressions" });
        }
        this.fail();
      }
    }
    return this.fail();
  }

  object(): Expr {
    const start = this.eat("{");
    const props: Prop[] = [];
    while (!this.is("}")) {
      if (this.is("...")) {
        this.next();
        props.push({ spread: true, value: this.assign() });
      } else {
        const kt = this.peek();
        let key: string | Expr;
        if (this.is("[")) {
          this.next();
          key = this.expr();
          this.eat("]");
        } else {
          this.next();
          if (kt.t !== "id" && kt.t !== "str" && kt.t !== "num") this.fail(kt);
          key = kt.t === "num" ? String(kt.num) : kt.v;
        }
        // `async name() {}` and `name() {}` are methods.
        let isAsync = false;
        if (kt.t === "id" && kt.v === "async" && this.peek().t === "id" && this.is("(", 1)) {
          isAsync = true;
          key = this.next().v;
        }
        if (this.is(":")) {
          this.next();
          props.push({ key, value: this.assign() });
        } else if (this.is("(")) {
          const { params, rest } = this.params();
          const body = this.block();
          const fn: FnDef = { name: typeof key === "string" ? key : undefined, params, rest, body, async: isAsync, arrow: false, at: kt.at, to: this.last.to };
          props.push({ key, value: { k: "fn", fn, at: kt.at, to: this.last.to } });
        } else {
          if (kt.t !== "id") this.fail();
          props.push({ key: kt.v, value: { k: "id", name: kt.v, at: kt.at, to: kt.to } });
        }
      }
      if (!this.is("}")) this.eat(",");
    }
    this.next();
    return { k: "obj", props, at: start.at, to: this.last.to };
  }
}

/* --------------------------------------------------------- strings, show */

const isIdent = (s: string) => /^[A-Za-z_$][\w$]*$/.test(s);

/** JavaScript's String(v). */
export function jsStr(v: Val): string {
  if (v === undefined) return "undefined";
  if (v === null) return "null";
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (Array.isArray(v)) return v.map((x) => (x === null || x === undefined ? "" : jsStr(x))).join(",");
  if (v instanceof Fn) return v.def.arrow ? "(…) => {…}" : `function ${v.name}() {…}`;
  if (v instanceof Native) return `function ${v.name}() { [native code] }`;
  if (v instanceof HostObj) {
    if (v.kind === "Buffer") return String(v.props.text);
    if (v.kind === "Error") return `${String(v.props.name)}: ${String(v.props.message)}`;
    return `[object ${v.kind}]`;
  }
  return "[object Object]";
}

/** How console.log shows a value (util.inspect, roughly). */
export function inspect(v: Val, nested = false, depth = 0): string {
  if (typeof v === "string") return nested ? `'${v.replace(/'/g, "\\'")}'` : v;
  if (v === undefined || v === null || typeof v === "number" || typeof v === "boolean") return String(v);
  if (v instanceof Fn) return v.name ? `[${v.def.async ? "AsyncFunction" : "Function"}: ${v.name}]` : `[${v.def.async ? "AsyncFunction" : "Function"} (anonymous)]`;
  if (v instanceof Native) return `[Function: ${v.name}]`;
  if (v instanceof HostObj) {
    if (v.kind === "Buffer") {
      if (v.props.symbolic) return "{buffer}";
      const bytes = [...new TextEncoder().encode(String(v.props.text))];
      return `<Buffer ${bytes.slice(0, 50).map((b) => b.toString(16).padStart(2, "0")).join(" ")}${bytes.length > 50 ? ` ... ${bytes.length - 50} more bytes` : ""}>`;
    }
    if (v.kind === "Error") return String(v.props.stack ?? `${String(v.props.name)}: ${String(v.props.message)}`);
    if (v.kind === "Promise") return v.props.state === "pending" ? "Promise { <pending> }" : v.props.state === "rejected" ? `Promise { <rejected> ${inspect(v.props.value, true, depth + 1)} }` : `Promise { ${inspect(v.props.value, true, depth + 1)} }`;
    return `${v.kind} {}`;
  }
  if (depth > 2) return Array.isArray(v) ? "[Array]" : "[Object]";
  if (Array.isArray(v)) return v.length ? `[ ${v.map((x) => inspect(x, true, depth + 1)).join(", ")} ]` : "[]";
  const entries = Object.entries(v as Record<string, Val>);
  if (!entries.length) return "{}";
  return `{ ${entries.map(([k, x]) => `${isIdent(k) ? k : `'${k}'`}: ${inspect(x, true, depth + 1)}`).join(", ")} }`;
}

/** console.log's line for these arguments: a `%s` format first, the rest joined by spaces. */
export function formatLog(args: Val[]): string {
  const rest = [...args];
  let head = "";
  if (typeof rest[0] === "string" && rest.length > 1 && /%[sdifjoOc%]/.test(rest[0])) {
    const fmt = rest.shift() as string;
    head = fmt.replace(/%([sdifjoOc%])/g, (m, c: string) => {
      if (c === "%") return "%";
      if (!rest.length) return m;
      const a = rest.shift();
      if (c === "s") return typeof a === "string" ? a : a instanceof HostObj && a.kind !== "Buffer" ? jsStr(a) : typeof a === "object" && a !== null ? inspect(a, true) : jsStr(a);
      if (c === "d" || c === "i") return String(c === "i" ? Math.trunc(Number(a)) : Number(a));
      if (c === "f") return String(Number(a));
      if (c === "j") return JSON.stringify(toPlain(a)) ?? "undefined";
      if (c === "c") return "";
      return inspect(a, true);
    });
    return [head, ...rest.map((a) => inspect(a))].join(" ");
  }
  return rest.map((a) => inspect(a)).join(" ");
}

/** A value as plain data for JSON.stringify. */
function toPlain(v: Val): Val {
  if (v instanceof HostObj) {
    if (v.kind === "Buffer") return { type: "Buffer", data: [...new TextEncoder().encode(String(v.props.text))] };
    if (v.kind === "Error") return {};
    return {};
  }
  if (v instanceof Fn || v instanceof Native) return undefined;
  if (Array.isArray(v)) return v.map((x) => (x instanceof Fn || x instanceof Native || x === undefined ? null : toPlain(x)));
  if (v && typeof v === "object") {
    const out: Record<string, Val> = {};
    for (const [k, x] of Object.entries(v)) {
      const p = toPlain(x);
      if (p !== undefined) out[k] = p;
    }
    return out;
  }
  return v;
}

export function typeOf(v: Val): string {
  if (v instanceof Fn || v instanceof Native) return "function";
  if (v === null) return "object";
  return typeof v;
}

const truthy = (v: Val) => {
  if (v instanceof HostObj || v instanceof Fn || v instanceof Native) return true;
  return Boolean(v);
};

/* ----------------------------------------------------------- interpreter */

export interface JsHost {
  /** A module from `import`/`require`, or undefined when there is no such module. */
  module(name: string): Val | undefined;
  log(text: string): void;
}

/** Iterations a loop may run before the sandbox gives up on it. */
const MAX_LOOP = 10_000;

export class Interp {
  /** The innermost statement running: where an error is reported. */
  current: Stmt | null = null;
  /** True while the reader only looks at a callback: library calls throw NoEval. */
  analysing = false;
  readonly globals = new Scope(null);
  private timers: { at: number; seq: number; fn: Val; args: Val[] }[] = [];
  private now = 0;
  private seq = 0;
  private depth = 0;
  /** Rejected promises nobody has awaited or caught yet. */
  private unhandled = new Set<HostObj>();
  private uuid = 0;

  constructor(
    readonly host: JsHost,
    readonly file: string,
    readonly src: string,
  ) {
    this.installGlobals();
  }

  /* ------------------------------------------------------------ running */

  /** Runs a whole file, then its timers; an uncaught error (or unhandled rejection) is thrown as JsThrow. */
  run(stmts: Stmt[]) {
    const scope = new Scope(this.globals);
    try {
      this.execBlock(stmts, scope);
      this.drainTimers();
    } catch (e) {
      if (e instanceof Halt || e instanceof ReturnSig) return;
      throw e;
    }
    const first = [...this.unhandled][0];
    if (first) throw new JsThrow(first.props.value, Number(first.props.line ?? 0));
  }

  private drainTimers(until?: HostObj) {
    for (let n = 0; this.timers.length && n < MAX_LOOP; n++) {
      if (until && until.props.state !== "pending") return;
      this.timers.sort((a, b) => a.at - b.at || a.seq - b.seq);
      const t = this.timers.shift()!;
      this.now = Math.max(this.now, t.at);
      this.call(t.fn, t.args);
    }
  }

  private hoist(stmts: Stmt[], scope: Scope) {
    for (const s of stmts) if (s.k === "func" && s.fn.name) scope.declare(s.fn.name, new Fn(s.fn, scope));
  }

  execBlock(stmts: Stmt[], scope: Scope) {
    this.hoist(stmts, scope);
    for (const s of stmts) this.exec(s, scope);
  }

  exec(s: Stmt, scope: Scope): void {
    const prev = this.current;
    this.current = s;
    try {
      this.execInner(s, scope);
    } catch (e) {
      if (e instanceof JsThrow && !e.line) e.line = s.line;
      throw e;
    }
    // Keep the failing statement as `current` when an error escapes.
    this.current = prev;
  }

  private execInner(s: Stmt, scope: Scope): void {
    switch (s.k) {
      case "empty":
      case "func":
        return;
      case "expr":
        this.eval(s.e, scope);
        return;
      case "var":
        for (const d of s.decls) this.bind(d.target, d.init ? this.eval(d.init, scope) : undefined, scope, s.kind === "const", true);
        return;
      case "import": {
        const mod = this.require(s.source, true);
        if (s.def) scope.declare(s.def, mod && typeof mod === "object" && !(mod instanceof HostObj) && "default" in mod ? (mod as Record<string, Val>).default : mod, true);
        if (s.ns) scope.declare(s.ns, mod, true);
        for (const n of s.named) {
          const v = this.member(mod, n.name);
          if (v === undefined)
            throw jsErr("SyntaxError", `The requested module '${s.source}' does not provide an export named '${n.name}'`, s.line);
          scope.declare(n.local, v, true);
        }
        return;
      }
      case "if":
        if (truthy(this.eval(s.test, scope))) this.execBlock(s.yes, new Scope(scope));
        else if (s.no) this.execBlock(s.no, new Scope(scope));
        return;
      case "block":
        this.execBlock(s.body, new Scope(scope));
        return;
      case "forof": {
        const iter = this.eval(s.iter, scope);
        let items: Val[];
        if (s.of) {
          if (Array.isArray(iter)) items = [...iter];
          else if (typeof iter === "string") items = [...iter];
          else throw jsErr("TypeError", `${this.text(s.iter)} is not iterable`, s.line);
        } else {
          if (iter === null || iter === undefined) items = [];
          else items = Object.keys(iter as object);
        }
        for (const item of items) {
          const inner = new Scope(scope);
          this.bind(s.target, item, inner, s.kind === "const", Boolean(s.kind));
          try {
            this.execBlock(s.body, inner);
          } catch (e) {
            if (e instanceof BreakSig) break;
            if (e instanceof ContinueSig) continue;
            throw e;
          }
        }
        return;
      }
      case "for": {
        const loop = new Scope(scope);
        if (s.init) this.exec(s.init, loop);
        for (let n = 0; ; n++) {
          if (n >= MAX_LOOP) throw new SandboxError("a loop that runs too long");
          if (s.test && !truthy(this.eval(s.test, loop))) break;
          // Each turn gets its own copy of the loop variables, as with `let`.
          const turn = new Scope(loop);
          try {
            this.execBlock(s.body, turn);
          } catch (e) {
            if (e instanceof BreakSig) break;
            if (!(e instanceof ContinueSig)) throw e;
          }
          if (s.update) this.eval(s.update, loop);
        }
        return;
      }
      case "return":
        throw new ReturnSig(s.e ? this.eval(s.e, scope) : undefined);
      case "throw":
        throw new JsThrow(this.eval(s.e, scope), s.line);
      case "break":
        throw new BreakSig();
      case "continue":
        throw new ContinueSig();
      case "try": {
        try {
          this.execBlock(s.block, new Scope(scope));
        } catch (e) {
          if (!(e instanceof JsThrow) || !s.handler) throw e;
          const inner = new Scope(scope);
          if (s.param) this.bind(s.param, e.value, inner, false, true);
          this.execBlock(s.handler, inner);
        } finally {
          if (s.finalizer) this.execBlock(s.finalizer, new Scope(scope));
        }
        return;
      }
      case "unsupported":
        throw new SandboxError(s.what);
    }
  }

  /** Binds a pattern: a name, or `{ a, b: c }` / `[x, y]` destructuring. */
  bind(p: Pattern, v: Val, scope: Scope, isConst: boolean, declare: boolean) {
    switch (p.k) {
      case "id":
        if (declare) scope.declare(p.name, v, isConst);
        else this.setVar(p.name, v, scope);
        return;
      case "def":
        this.bind(p.target, v === undefined ? this.eval(p.def, scope) : v, scope, isConst, declare);
        return;
      case "opat": {
        if (v === null || v === undefined) throw jsErr("TypeError", `Cannot destructure '${jsStr(v)}' as it is ${jsStr(v)}.`);
        const used = new Set<string>();
        for (const prop of p.props) {
          used.add(prop.key);
          this.bind(prop.value, this.member(v, prop.key), scope, isConst, declare);
        }
        if (p.rest) {
          const rest: Record<string, Val> = {};
          if (typeof v === "object" && !(v instanceof HostObj)) for (const [k, x] of Object.entries(v as object)) if (!used.has(k)) rest[k] = x;
          this.bind({ k: "id", name: p.rest, at: p.at, to: p.to }, rest, scope, isConst, declare);
        }
        return;
      }
      case "apat": {
        if (!Array.isArray(v)) throw jsErr("TypeError", `${jsStr(v)} is not iterable`);
        p.items.forEach((item, k) => item && this.bind(item, v[k], scope, isConst, declare));
        if (p.rest) this.bind({ k: "id", name: p.rest, at: p.at, to: p.to }, v.slice(p.items.length), scope, isConst, declare);
        return;
      }
    }
  }

  private setVar(name: string, v: Val, scope: Scope) {
    const slot = scope.find(name);
    if (!slot) throw jsErr("ReferenceError", `${name} is not defined`);
    if (slot.c) throw jsErr("TypeError", "Assignment to constant variable.");
    slot.v = v;
  }

  /** The source text of a node. */
  text(n: { at: number; to: number }): string {
    return this.src.slice(n.at, n.to);
  }

  /* -------------------------------------------------------- expressions */

  eval(e: Expr, scope: Scope): Val {
    switch (e.k) {
      case "lit":
        return e.v;
      case "tpl":
        return e.strs.reduce((acc, s, k) => acc + s + (k < e.exprs.length ? jsStr(this.eval(e.exprs[k]!, scope)) : ""), "");
      case "id": {
        const slot = scope.find(e.name);
        if (!slot) throw jsErr("ReferenceError", `${e.name} is not defined`);
        return slot.v;
      }
      case "mem": {
        const obj = this.eval(e.obj, scope);
        if (e.optional && (obj === null || obj === undefined)) return undefined;
        const prop = typeof e.prop === "string" ? e.prop : this.eval(e.prop, scope);
        if (obj === null || obj === undefined) throw jsErr("TypeError", `Cannot read properties of ${jsStr(obj)} (reading '${jsStr(prop)}')`);
        return this.member(obj, prop);
      }
      case "call":
        return this.evalCall(e, scope);
      case "new":
        return this.construct(e, scope);
      case "arr": {
        const out: Val[] = [];
        for (const it of e.items) {
          if (it.k === "spread") {
            const v = this.eval(it.e, scope);
            if (!Array.isArray(v)) throw jsErr("TypeError", `${this.text(it.e)} is not iterable`);
            out.push(...v);
          } else out.push(this.eval(it, scope));
        }
        return out;
      }
      case "obj": {
        const out: Record<string, Val> = {};
        for (const p of e.props) {
          if (p.spread) {
            const v = this.eval(p.value, scope);
            if (v && typeof v === "object" && !(v instanceof HostObj)) Object.assign(out, v);
            else if (v instanceof HostObj) Object.assign(out, v.props);
          } else out[typeof p.key === "string" ? p.key : jsStr(this.eval(p.key, scope))] = this.eval(p.value, scope);
        }
        return out;
      }
      case "fn":
        return new Fn(e.fn, scope);
      case "await":
        return this.await(this.eval(e.e, scope));
      case "un": {
        if (e.op === "typeof") {
          if (e.e.k === "id" && !scope.find(e.e.name)) return "undefined";
          return typeOf(this.eval(e.e, scope));
        }
        const v = this.eval(e.e, scope);
        if (e.op === "!") return !truthy(v);
        if (e.op === "-") return -Number(v);
        if (e.op === "+") return Number(v);
        if (e.op === "~") return ~Number(v);
        if (e.op === "void") return undefined;
        if (e.op === "delete") return true;
        return undefined;
      }
      case "bin":
        return this.binary(e, scope);
      case "cond":
        return truthy(this.eval(e.test, scope)) ? this.eval(e.yes, scope) : this.eval(e.no, scope);
      case "assign": {
        if (e.op === "&&=" || e.op === "||=" || e.op === "??=") {
          const cur = this.eval(e.target, scope);
          const keep = e.op === "&&=" ? !truthy(cur) : e.op === "||=" ? truthy(cur) : cur !== null && cur !== undefined;
          if (keep) return cur;
          const v = this.eval(e.value, scope);
          this.store(e.target, v, scope);
          return v;
        }
        let v = this.eval(e.value, scope);
        if (e.op !== "=") v = this.arith(e.op.slice(0, -1), this.eval(e.target, scope), v);
        this.store(e.target, v, scope);
        return v;
      }
      case "update": {
        const old = Number(this.eval(e.target, scope));
        const v = e.op === "++" ? old + 1 : old - 1;
        this.store(e.target, v, scope);
        return e.prefix ? v : old;
      }
      case "spread":
        throw new SandboxError("spread here");
      case "bad":
        throw new SandboxError(e.what);
    }
  }

  private store(target: Expr, v: Val, scope: Scope) {
    if (target.k === "id") return this.setVar(target.name, v, scope);
    if (target.k === "mem") {
      const obj = this.eval(target.obj, scope);
      const prop = typeof target.prop === "string" ? target.prop : jsStr(this.eval(target.prop, scope));
      if (obj === null || obj === undefined) throw jsErr("TypeError", `Cannot set properties of ${jsStr(obj)} (setting '${prop}')`);
      if (obj instanceof HostObj) obj.props[prop] = v;
      else if (typeof obj === "object") (obj as Record<string, Val>)[prop] = v;
      return;
    }
    throw jsErr("SyntaxError", "Invalid left-hand side in assignment");
  }

  private binary(e: Extract<Expr, { k: "bin" }>, scope: Scope): Val {
    if (e.op === "&&") {
      const l = this.eval(e.l, scope);
      return truthy(l) ? this.eval(e.r, scope) : l;
    }
    if (e.op === "||") {
      const l = this.eval(e.l, scope);
      return truthy(l) ? l : this.eval(e.r, scope);
    }
    if (e.op === "??") {
      const l = this.eval(e.l, scope);
      return l === null || l === undefined ? this.eval(e.r, scope) : l;
    }
    const l = this.eval(e.l, scope);
    const r = this.eval(e.r, scope);
    switch (e.op) {
      case "===":
        return l === r;
      case "!==":
        return l !== r;
      case "==":
        return looseEq(l, r);
      case "!=":
        return !looseEq(l, r);
      case "<":
        return (l as number) < (r as number);
      case ">":
        return (l as number) > (r as number);
      case "<=":
        return (l as number) <= (r as number);
      case ">=":
        return (l as number) >= (r as number);
      case "instanceof":
        return l instanceof HostObj && r instanceof Native && l.kind === "Error" && (r.name === "Error" || l.props.name === r.name);
      case "in":
        return r !== null && typeof r === "object" && jsStr(l) in (r instanceof HostObj ? r.props : (r as object));
      default:
        return this.arith(e.op, l, r);
    }
  }

  private arith(op: string, l: Val, r: Val): Val {
    if (op === "+") {
      const prim = (v: Val) => (typeof v === "object" && v !== null) || v instanceof Fn ? jsStr(v) : v;
      const a = prim(l);
      const b = prim(r);
      if (typeof a === "string" || typeof b === "string") return jsStr(a) + jsStr(b);
      return Number(a) + Number(b);
    }
    const a = Number(l);
    const b = Number(r);
    switch (op) {
      case "-":
        return a - b;
      case "*":
        return a * b;
      case "/":
        return a / b;
      case "%":
        return a % b;
      case "**":
        return a ** b;
      case "|":
        return a | b;
      case "&":
        return a & b;
      case "^":
        return a ^ b;
    }
    throw new SandboxError(`the ${op} operator`);
  }

  private evalArgs(args: Expr[], scope: Scope): Val[] {
    const out: Val[] = [];
    for (const a of args) {
      if (a.k === "spread") {
        const v = this.eval(a.e, scope);
        if (!Array.isArray(v)) throw jsErr("TypeError", `${this.text(a.e)} is not iterable`);
        out.push(...v);
      } else out.push(this.eval(a, scope));
    }
    return out;
  }

  private evalCall(e: Extract<Expr, { k: "call" }>, scope: Scope): Val {
    let self: Val = undefined;
    let fn: Val;
    if (e.callee.k === "mem") {
      self = this.eval(e.callee.obj, scope);
      if (e.callee.optional && (self === null || self === undefined)) return undefined;
      const prop = typeof e.callee.prop === "string" ? e.callee.prop : this.eval(e.callee.prop, scope);
      if (self === null || self === undefined) throw jsErr("TypeError", `Cannot read properties of ${jsStr(self)} (reading '${jsStr(prop)}')`);
      fn = this.member(self, prop);
    } else fn = this.eval(e.callee, scope);
    if (e.optional && (fn === null || fn === undefined)) return undefined;
    if (!(fn instanceof Fn) && !(fn instanceof Native)) throw jsErr("TypeError", `${this.text(e.callee)} is not a function`);
    return this.call(fn, this.evalArgs(e.args, scope), self);
  }

  /** Calls a function value: the file's own (run now) or the sandbox's. */
  call(fn: Val, args: Val[], self?: Val): Val {
    if (fn instanceof Native) {
      if (fn.effect && this.analysing) throw new NoEval();
      return fn.call(args, self);
    }
    if (!(fn instanceof Fn)) throw jsErr("TypeError", `${inspect(fn)} is not a function`);
    if (this.depth > 200) throw jsErr("RangeError", "Maximum call stack size exceeded");
    const def = fn.def;
    const scope = new Scope(fn.scope);
    this.depth++;
    try {
      def.params.forEach((p, k) => this.bind(p, args[k], scope, false, true));
      if (def.rest) scope.declare(def.rest, args.slice(def.params.length));
      let value: Val;
      if (Array.isArray(def.body)) {
        try {
          this.execBlock(def.body, scope);
          value = undefined;
        } catch (e) {
          if (!(e instanceof ReturnSig)) throw e;
          value = e.v;
        }
      } else value = this.eval(def.body, scope);
      return def.async ? this.promise("fulfilled", value instanceof HostObj && value.kind === "Promise" ? this.await(value) : value) : value;
    } catch (e) {
      if (def.async && e instanceof JsThrow) {
        const p = this.promise("rejected", e.value);
        p.props.line = e.line;
        return p;
      }
      throw e;
    } finally {
      this.depth--;
    }
  }

  /** A settled promise (or a pending one, settled later by `settle`). */
  promise(state: "fulfilled" | "rejected" | "pending", value?: Val): HostObj {
    const p = new HostObj("Promise", { state, value });
    if (state === "rejected" && !this.analysing) this.unhandled.add(p);
    const then = (onOk: Val, onErr: Val): Val => {
      this.unhandled.delete(p);
      if (p.props.state === "pending") this.drainTimers(p);
      if (p.props.state === "pending") return this.promise("pending");
      const handler = p.props.state === "fulfilled" ? onOk : onErr;
      if (!(handler instanceof Fn || handler instanceof Native)) return p;
      try {
        const r = this.call(handler, [p.props.value]);
        if (r instanceof HostObj && r.kind === "Promise") return r;
        return this.promise("fulfilled", r);
      } catch (e) {
        if (!(e instanceof JsThrow)) throw e;
        const out = this.promise("rejected", e.value);
        out.props.line = e.line;
        return out;
      }
    };
    p.props.then = new Native("then", ([a, b]) => then(a, b));
    p.props.catch = new Native("catch", ([b]) => then(undefined, b));
    p.props.finally = new Native("finally", ([f]) => {
      this.unhandled.delete(p);
      if (f instanceof Fn || f instanceof Native) this.call(f, []);
      return p;
    });
    return p;
  }

  settle(p: HostObj, state: "fulfilled" | "rejected", value: Val) {
    if (p.props.state !== "pending") return;
    p.props.state = state;
    p.props.value = value;
    if (state === "rejected") this.unhandled.add(p);
  }

  /** `await v`: a promise's value (its error is thrown), anything else as it is. */
  await(v: Val): Val {
    if (!(v instanceof HostObj && v.kind === "Promise")) return v;
    this.unhandled.delete(v);
    if (v.props.state === "pending") this.drainTimers(v);
    if (v.props.state === "pending") {
      if (this.analysing) throw new NoEval();
      throw new Halt();
    }
    if (v.props.state === "rejected") throw new JsThrow(v.props.value, Number(v.props.line ?? 0));
    return v.props.value;
  }

  private construct(e: Extract<Expr, { k: "new" }>, scope: Scope): Val {
    const ctor = this.eval(e.callee, scope);
    const args = this.evalArgs(e.args, scope);
    if (isHost(ctor, "PromiseClass")) {
      const p = this.promise("pending");
      const resolve = new Native("resolve", ([v]) => this.settle(p, "fulfilled", v));
      const reject = new Native("reject", ([v]) => this.settle(p, "rejected", v));
      try {
        this.call(args[0], [resolve, reject]);
      } catch (err) {
        if (!(err instanceof JsThrow)) throw err;
        this.settle(p, "rejected", err.value);
      }
      return p;
    }
    if (ctor instanceof Native && /Error$/.test(ctor.name)) return makeError(ctor.name, args[0] === undefined ? "" : jsStr(args[0]));
    if (isHost(ctor, "DateClass")) return new HostObj("Date", { toISOString: new Native("toISOString", () => new Date(this.dateNow()).toISOString()), getTime: new Native("getTime", () => this.dateNow()) });
    throw new SandboxError(`new ${this.text(e.callee)}`);
  }

  private dateNow() {
    return Date.UTC(2026, 10, 21, 10, 0, 0) + this.now;
  }

  /* ------------------------------------------------------------ members */

  member(obj: Val, prop: Val): Val {
    const key = jsStr(prop);
    if (obj instanceof HostObj) return obj.props[key];
    if (typeof obj === "string") {
      if (key === "length") return obj.length;
      if (/^\d+$/.test(key)) return obj[Number(key)];
      return stringMethod(obj, key);
    }
    if (typeof obj === "number") {
      if (key === "toString") return new Native("toString", ([b]) => obj.toString(b === undefined ? 10 : Number(b)));
      if (key === "toFixed") return new Native("toFixed", ([d]) => obj.toFixed(Number(d ?? 0)));
      return undefined;
    }
    if (typeof obj === "boolean") return key === "toString" ? new Native("toString", () => String(obj)) : undefined;
    if (Array.isArray(obj)) {
      if (key === "length") return obj.length;
      if (/^\d+$/.test(key)) return obj[Number(key)];
      return this.arrayMethod(obj, key);
    }
    if (obj instanceof Fn) return key === "name" ? obj.name : undefined;
    if (obj instanceof Native) return key === "name" ? obj.name : undefined;
    if (obj && typeof obj === "object") {
      const o = obj as Record<string, Val>;
      if (Object.prototype.hasOwnProperty.call(o, key)) return o[key];
      if (key === "hasOwnProperty") return new Native("hasOwnProperty", ([k]) => Object.prototype.hasOwnProperty.call(o, jsStr(k)));
      if (key === "toString") return new Native("toString", () => "[object Object]");
      return undefined;
    }
    return undefined;
  }

  private arrayMethod(arr: Val[], key: string): Val {
    const fnOf = (f: Val) => (x: Val, k: number) => this.call(f, [x, k, arr]);
    const m: Record<string, (args: Val[]) => Val> = {
      map: ([f]) => arr.map(fnOf(f)),
      forEach: ([f]) => {
        arr.forEach(fnOf(f));
        return undefined;
      },
      filter: ([f]) => arr.filter((x, k) => truthy(fnOf(f)(x, k))),
      find: ([f]) => arr.find((x, k) => truthy(fnOf(f)(x, k))),
      some: ([f]) => arr.some((x, k) => truthy(fnOf(f)(x, k))),
      every: ([f]) => arr.every((x, k) => truthy(fnOf(f)(x, k))),
      reduce: ([f, init]) => (init === undefined ? arr.reduce((a, x, k) => this.call(f, [a, x, k, arr])) : arr.reduce((a, x, k) => this.call(f, [a, x, k, arr]), init)),
      join: ([sep]) => arr.map((x) => (x === null || x === undefined ? "" : jsStr(x))).join(sep === undefined ? "," : jsStr(sep)),
      includes: ([x]) => arr.includes(x),
      indexOf: ([x]) => arr.indexOf(x),
      push: (xs) => arr.push(...xs),
      pop: () => arr.pop(),
      shift: () => arr.shift(),
      unshift: (xs) => arr.unshift(...xs),
      slice: ([a, b]) => arr.slice(a as number | undefined, b as number | undefined),
      concat: (xs) => arr.concat(...xs.map((x) => (Array.isArray(x) ? x : [x]))),
      reverse: () => arr.reverse(),
      entries: () => arr.map((x, k) => [k, x]),
      keys: () => arr.map((_, k) => k),
      at: ([k]) => arr.at(Number(k)),
      toString: () => jsStr(arr),
    };
    const f = m[key];
    return f ? new Native(key, f) : undefined;
  }

  /* -------------------------------------------------------------- modules */

  require(name: string, esm = false): Val {
    const own = this.host.module(name);
    if (own !== undefined) return own;
    const bare = name.replace(/^node:/, "");
    const builtin = this.builtinModule(bare);
    if (builtin !== undefined) return builtin;
    if (esm) throw jsErr("Error", `Cannot find package '${name}' imported from /home/you/shop/${this.file}`, 0, { code: "ERR_MODULE_NOT_FOUND" });
    throw jsErr("Error", `Cannot find module '${name}'`, 0, { code: "MODULE_NOT_FOUND" });
  }

  private builtinModule(name: string): Val {
    const g = (k: string) => this.globals.find(k)?.v;
    switch (name) {
      case "timers/promises": {
        const wait = (v: Val) => this.promise("fulfilled", v);
        return { setTimeout: new Native("setTimeout", ([, v]) => wait(v)), setImmediate: new Native("setImmediate", ([v]) => wait(v)) };
      }
      case "timers":
        return { setTimeout: g("setTimeout"), setInterval: g("setInterval"), clearTimeout: g("clearTimeout") };
      case "crypto":
        return { randomUUID: g("crypto") && this.member(g("crypto"), "randomUUID") };
      case "process": {
        const p = g("process");
        return Object.assign({ default: p }, p instanceof HostObj ? p.props : {});
      }
      case "util":
        return { format: new Native("format", (args) => formatLog(args)), inspect: new Native("inspect", ([v]) => inspect(v)) };
    }
    return undefined;
  }

  /* -------------------------------------------------------------- globals */

  private installGlobals() {
    const g = (name: string, v: Val) => this.globals.declare(name, v, true);
    const log = new Native(
      "log",
      (args) => {
        this.host.log(formatLog(args));
        return undefined;
      },
      true,
    );
    g("console", new HostObj("console", { log, info: log, warn: log, error: log, debug: log }));
    g("require", new Native("require", ([name]) => this.require(jsStr(name))));
    g(
      "JSON",
      new HostObj("JSON", {
        stringify: new Native("stringify", ([v, , space]) => JSON.stringify(toPlain(v), null, space as number | undefined)),
        parse: new Native("parse", ([s]) => {
          try {
            return JSON.parse(jsStr(s)) as Val;
          } catch (e) {
            throw jsErr("SyntaxError", (e as Error).message);
          }
        }),
      }),
    );
    g(
      "Buffer",
      new HostObj("BufferClass", {
        from: new Native("from", ([v]) => {
          if (v instanceof HostObj && v.kind === "Buffer") return makeBuffer(String(v.props.text), Boolean(v.props.symbolic));
          if (Array.isArray(v)) return makeBuffer(String.fromCharCode(...v.map(Number)));
          if (typeof v !== "string") throw jsErr("TypeError", `The first argument must be of type string or an instance of Buffer, ArrayBuffer, or Array or an Array-like Object. Received ${inspect(v, true)}`, 0, { code: "ERR_INVALID_ARG_TYPE" });
          return makeBuffer(v);
        }),
        isBuffer: new Native("isBuffer", ([v]) => isHost(v, "Buffer")),
        byteLength: new Native("byteLength", ([v]) => new TextEncoder().encode(jsStr(v)).length),
        alloc: new Native("alloc", () => makeBuffer("")),
      }),
    );
    g("String", new Native("String", ([v]) => (v === undefined ? "" : jsStr(v))));
    g("Number", new Native("Number", ([v]) => Number(v instanceof HostObj ? jsStr(v) : v)));
    g("Boolean", new Native("Boolean", ([v]) => truthy(v)));
    g("parseInt", new Native("parseInt", ([v, b]) => parseInt(jsStr(v), b === undefined ? 10 : Number(b))));
    g("parseFloat", new Native("parseFloat", ([v]) => parseFloat(jsStr(v))));
    g("isNaN", new Native("isNaN", ([v]) => Number.isNaN(Number(v))));
    g("NaN", NaN);
    g("Infinity", Infinity);
    g("Math", new HostObj("Math", { ...Object.fromEntries(["floor", "ceil", "round", "max", "min", "abs", "sqrt", "pow", "trunc"].map((k) => [k, new Native(k, (args) => (Math as unknown as Record<string, (...a: number[]) => number>)[k]!(...args.map(Number)))])), random: new Native("random", () => 0.42), PI: Math.PI }));
    g(
      "Object",
      new HostObj("Object", {
        keys: new Native("keys", ([o]) => (o && typeof o === "object" ? Object.keys(o instanceof HostObj ? o.props : o) : [])),
        values: new Native("values", ([o]) => (o && typeof o === "object" ? Object.values(o instanceof HostObj ? o.props : o) : [])),
        entries: new Native("entries", ([o]) => (o && typeof o === "object" ? Object.entries(o instanceof HostObj ? o.props : o) : [])),
        assign: new Native("assign", ([t, ...xs]) => Object.assign(t as object, ...xs.map((x) => (x instanceof HostObj ? x.props : x)))),
        freeze: new Native("freeze", ([o]) => o),
      }),
    );
    g("Array", new HostObj("Array", { isArray: new Native("isArray", ([v]) => Array.isArray(v)), from: new Native("from", ([v, f]) => {
      const items = Array.isArray(v) ? [...v] : typeof v === "string" ? [...v] : v && typeof v === "object" && "length" in (v as object) ? Array.from({ length: Number((v as { length: number }).length) }, () => undefined) : [];
      return f ? items.map((x, k) => this.call(f, [x, k])) : items;
    }), of: new Native("of", (xs) => xs) }));
    g(
      "Promise",
      new HostObj("PromiseClass", {
        all: new Native("all", ([xs]) => {
          if (!Array.isArray(xs)) throw jsErr("TypeError", `${inspect(xs)} is not iterable`);
          try {
            return this.promise("fulfilled", xs.map((x) => this.await(x)));
          } catch (e) {
            if (!(e instanceof JsThrow)) throw e;
            return this.promise("rejected", e.value);
          }
        }),
        resolve: new Native("resolve", ([v]) => this.promise("fulfilled", v)),
        reject: new Native("reject", ([v]) => this.promise("rejected", v)),
      }),
    );
    for (const name of ["Error", "TypeError", "RangeError", "SyntaxError"]) g(name, new Native(name, ([m]) => makeError(name, m === undefined ? "" : jsStr(m))));
    g("Date", new HostObj("DateClass", { now: new Native("now", () => this.dateNow()) }));
    g("setTimeout", new Native("setTimeout", ([fn, ms, ...args]) => this.addTimer(fn, Number(ms) || 0, args), true));
    g("setImmediate", new Native("setImmediate", ([fn, ...args]) => this.addTimer(fn, 0, args), true));
    g("setInterval", new Native("setInterval", () => {
      throw new SandboxError("setInterval");
    }));
    const clear = new Native("clearTimeout", ([id]) => {
      this.timers = this.timers.filter((t) => t.seq !== Number(id));
      return undefined;
    });
    g("clearTimeout", clear);
    g("clearInterval", clear);
    g(
      "crypto",
      new HostObj("crypto", {
        randomUUID: new Native("randomUUID", () => {
          this.uuid++;
          return `9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb${String(this.uuid).padStart(2, "0")}`;
        }),
      }),
    );
    const exit = new Native(
      "exit",
      ([code]) => {
        throw new ExitSignal(Number(code ?? 0));
      },
      true,
    );
    g(
      "process",
      new HostObj("process", {
        exit,
        env: {},
        argv: ["/usr/bin/node", `/home/you/shop/${this.file}`],
        on: new Native("on", () => undefined),
        once: new Native("once", () => undefined),
        version: NODE_VERSION,
        platform: "linux",
        pid: 4242,
      }),
    );
    g("module", { exports: {} });
    g("exports", {});
    g("__dirname", "/home/you/shop");
    g("__filename", `/home/you/shop/${this.file}`);
    g("globalThis", {});
  }

  private addTimer(fn: Val, ms: number, args: Val[]): number {
    const seq = ++this.seq;
    this.timers.push({ at: this.now + ms, seq, fn, args });
    return seq;
  }
}

function looseEq(a: Val, b: Val): boolean {
  if ((a === null || a === undefined) && (b === null || b === undefined)) return true;
  if (a === null || a === undefined || b === null || b === undefined) return false;
  if (typeof a === typeof b) return a === b;
  if (typeof a === "object" || typeof b === "object") return a === b;
  return Number(a) === Number(b);
}

function stringMethod(s: string, key: string): Val {
  const m: Record<string, (args: Val[]) => Val> = {
    toString: () => s,
    valueOf: () => s,
    toUpperCase: () => s.toUpperCase(),
    toLowerCase: () => s.toLowerCase(),
    trim: () => s.trim(),
    trimStart: () => s.trimStart(),
    trimEnd: () => s.trimEnd(),
    includes: ([x]) => s.includes(jsStr(x)),
    startsWith: ([x]) => s.startsWith(jsStr(x)),
    endsWith: ([x]) => s.endsWith(jsStr(x)),
    indexOf: ([x]) => s.indexOf(jsStr(x)),
    split: ([x]) => (x === undefined ? [s] : s.split(jsStr(x))),
    slice: ([a, b]) => s.slice(a as number | undefined, b as number | undefined),
    substring: ([a, b]) => s.substring(Number(a), b === undefined ? undefined : Number(b)),
    replace: ([a, b]) => s.replace(jsStr(a), jsStr(b)),
    replaceAll: ([a, b]) => s.split(jsStr(a)).join(jsStr(b)),
    padStart: ([n, f]) => s.padStart(Number(n), f === undefined ? " " : jsStr(f)),
    padEnd: ([n, f]) => s.padEnd(Number(n), f === undefined ? " " : jsStr(f)),
    repeat: ([n]) => s.repeat(Number(n)),
    concat: (xs) => s + xs.map(jsStr).join(""),
    at: ([k]) => s.at(Number(k)),
    charAt: ([k]) => s.charAt(Number(k)),
  };
  const f = m[key];
  return f ? new Native(key, f) : undefined;
}

/* ---------------------------------------------------------------- walking */

/** An expression's direct sub-expressions, in source order (a function's body is not included). */
export function childExprs(e: Expr): Expr[] {
  switch (e.k) {
    case "tpl":
      return e.exprs;
    case "mem":
      return typeof e.prop === "string" ? [e.obj] : [e.obj, e.prop];
    case "call":
    case "new":
      return [e.callee, ...e.args];
    case "arr":
      return e.items;
    case "obj":
      return e.props.flatMap((p) => (!p.spread && typeof p.key !== "string" ? [p.key, p.value] : [p.value]));
    case "un":
    case "await":
    case "spread":
      return [e.e];
    case "bin":
      return [e.l, e.r];
    case "cond":
      return [e.test, e.yes, e.no];
    case "assign":
      return [e.target, e.value];
    case "update":
      return [e.target];
    default:
      return [];
  }
}

/** A statement's own expressions and the statements nested in it. */
export function stmtParts(s: Stmt): { exprs: Expr[]; blocks: Stmt[][] } {
  switch (s.k) {
    case "expr":
      return { exprs: [s.e], blocks: [] };
    case "var":
      return { exprs: s.decls.flatMap((d) => (d.init ? [d.init] : [])), blocks: [] };
    case "func":
      return { exprs: [], blocks: Array.isArray(s.fn.body) ? [s.fn.body] : [] };
    case "if":
      return { exprs: [s.test], blocks: s.no ? [s.yes, s.no] : [s.yes] };
    case "forof":
      return { exprs: [s.iter], blocks: [s.body] };
    case "for":
      return { exprs: [s.test, s.update].filter((x): x is Expr => Boolean(x)), blocks: s.init ? [[s.init], s.body] : [s.body] };
    case "block":
      return { exprs: [], blocks: [s.body] };
    case "return":
      return { exprs: s.e ? [s.e] : [], blocks: [] };
    case "throw":
      return { exprs: [s.e], blocks: [] };
    case "try":
      return { exprs: [], blocks: [s.block, ...(s.handler ? [s.handler] : []), ...(s.finalizer ? [s.finalizer] : [])] };
    default:
      return { exprs: [], blocks: [] };
  }
}

/** Calls `visit` on every expression in a statement list, in source order, nested functions included. */
export function walkExprs(stmts: Stmt[], visit: (e: Expr) => void) {
  const ex = (e: Expr): void => {
    visit(e);
    if (e.k === "fn") {
      if (Array.isArray(e.fn.body)) st(e.fn.body);
      else ex(e.fn.body);
    } else childExprs(e).forEach(ex);
  };
  const st = (list: Stmt[]): void => {
    for (const s of list) {
      const { exprs, blocks } = stmtParts(s);
      exprs.forEach(ex);
      blocks.forEach(st);
    }
  };
  st(stmts);
}

/** The name a call is made by: `setTimeout` for `setTimeout(…)`, `ack` for `ch.ack(…)`. */
export function calleeName(e: Expr): string | null {
  if (e.k !== "call") return null;
  if (e.callee.k === "id") return e.callee.name;
  if (e.callee.k === "mem" && typeof e.callee.prop === "string") return e.callee.prop;
  return null;
}
