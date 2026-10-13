/**
 * Small arithmetic expression language for parameters and dimensions:
 * numbers, identifiers, + - * / ^ %, parentheses, unary minus and a few functions.
 */

type Node =
  | { t: 'num'; v: number }
  | { t: 'ref'; name: string }
  | { t: 'neg'; a: Node }
  | { t: 'bin'; op: string; a: Node; b: Node }
  | { t: 'call'; fn: string; args: Node[] };

const FUNCTIONS: Record<string, (...args: number[]) => number> = {
  sin: (d) => Math.sin((d * Math.PI) / 180),
  cos: (d) => Math.cos((d * Math.PI) / 180),
  tan: (d) => Math.tan((d * Math.PI) / 180),
  asin: (x) => (Math.asin(x) * 180) / Math.PI,
  acos: (x) => (Math.acos(x) * 180) / Math.PI,
  atan: (x) => (Math.atan(x) * 180) / Math.PI,
  sqrt: Math.sqrt,
  abs: Math.abs,
  min: Math.min,
  max: Math.max,
  round: Math.round,
  floor: Math.floor,
  ceil: Math.ceil,
};

const CONSTANTS: Record<string, number> = { pi: Math.PI, PI: Math.PI, phi: (1 + Math.sqrt(5)) / 2 };

export const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;

export function isReservedName(name: string) {
  return name in FUNCTIONS || name in CONSTANTS;
}

function tokenize(src: string): string[] {
  const tokens: string[] = [];
  const re = /\s*(\d+\.?\d*(?:[eE][-+]?\d+)?|\.\d+(?:[eE][-+]?\d+)?|[A-Za-z_][A-Za-z0-9_]*|[-+*/^%(),])/y;
  let i = 0;
  while (i < src.length) {
    if (/^\s*$/.test(src.slice(i))) break;
    re.lastIndex = i;
    const m = re.exec(src);
    if (!m) throw new Error(`Unexpected "${src.slice(i).trim()[0]}"`);
    tokens.push(m[1]);
    i = re.lastIndex;
  }
  return tokens;
}

function parse(src: string): Node {
  const tokens = tokenize(src);
  let pos = 0;
  const peek = () => tokens[pos];
  const next = () => tokens[pos++];
  const expect = (tok: string) => {
    if (next() !== tok) throw new Error(`Expected "${tok}"`);
  };

  function primary(): Node {
    const tok = next();
    if (tok === undefined) throw new Error('Unexpected end of expression');
    if (tok === '(') {
      const e = additive();
      expect(')');
      return e;
    }
    if (tok === '-') return { t: 'neg', a: power() };
    if (tok === '+') return power();
    if (/^[\d.]/.test(tok)) return { t: 'num', v: parseFloat(tok) };
    if (IDENTIFIER.test(tok)) {
      if (peek() === '(') {
        next();
        const args: Node[] = [];
        if (peek() !== ')') {
          args.push(additive());
          while (peek() === ',') {
            next();
            args.push(additive());
          }
        }
        expect(')');
        if (!(tok in FUNCTIONS)) throw new Error(`Unknown function "${tok}"`);
        return { t: 'call', fn: tok, args };
      }
      return { t: 'ref', name: tok };
    }
    throw new Error(`Unexpected "${tok}"`);
  }

  function power(): Node {
    const base = primary();
    if (peek() === '^') {
      next();
      return { t: 'bin', op: '^', a: base, b: power() };
    }
    return base;
  }

  function multiplicative(): Node {
    let a = power();
    while (peek() === '*' || peek() === '/' || peek() === '%') {
      const op = next();
      a = { t: 'bin', op, a, b: power() };
    }
    return a;
  }

  function additive(): Node {
    let a = multiplicative();
    while (peek() === '+' || peek() === '-') {
      const op = next();
      a = { t: 'bin', op, a, b: multiplicative() };
    }
    return a;
  }

  if (tokens.length === 0) throw new Error('Empty expression');
  const root = additive();
  if (pos < tokens.length) throw new Error(`Unexpected "${tokens[pos]}"`);
  return root;
}

function evalNode(n: Node, lookup: (name: string) => number): number {
  switch (n.t) {
    case 'num':
      return n.v;
    case 'ref':
      if (n.name in CONSTANTS) return CONSTANTS[n.name];
      return lookup(n.name);
    case 'neg':
      return -evalNode(n.a, lookup);
    case 'call':
      return FUNCTIONS[n.fn](...n.args.map((a) => evalNode(a, lookup)));
    case 'bin': {
      const a = evalNode(n.a, lookup);
      const b = evalNode(n.b, lookup);
      switch (n.op) {
        case '+':
          return a + b;
        case '-':
          return a - b;
        case '*':
          return a * b;
        case '/':
          return a / b;
        case '%':
          return a % b;
        default:
          return a ** b;
      }
    }
  }
}

export function evaluate(src: string, lookup: (name: string) => number): number {
  const value = evalNode(parse(src), lookup);
  if (!Number.isFinite(value)) throw new Error('Result is not a finite number');
  return value;
}

export function referencedNames(src: string): string[] {
  try {
    return tokenize(src).filter((t) => IDENTIFIER.test(t) && !(t in FUNCTIONS) && !(t in CONSTANTS));
  } catch {
    return [];
  }
}

export function isPlainNumber(src: string) {
  return /^\s*-?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?\s*$/.test(src);
}

export function renameInExpression(src: string, from: string, to: string) {
  return src.replace(new RegExp(`\\b${from}\\b`, 'g'), to);
}
