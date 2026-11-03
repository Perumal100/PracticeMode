/**
 * content/regex_sampler.js
 * Produces strings that satisfy an HTML `pattern` attribute.
 *
 * Supports the subset of regular expressions that real form patterns use:
 * literals, escapes (\d \w \s and their negations), character classes with
 * ranges and negation, groups, alternation, and the ? * + {n} {n,} {n,m}
 * quantifiers. Lookarounds and word boundaries are skipped during generation;
 * every candidate is verified against the real RegExp, so an unsupported
 * construct can only cause "no value", never a wrong value.
 */

(() => {
  const PM = (globalThis.PracticeMode = globalThis.PracticeMode || {});

  const DIGITS = '1234567890';
  const LOWER = 'abcdefghijklmnopqrstuvwxyz';
  const UPPER = LOWER.toUpperCase();
  const WORD = LOWER + UPPER + DIGITS + '_';
  const POOL = LOWER + UPPER + DIGITS + ' -_.@';

  /** Compile an HTML pattern attribute the way browsers do (anchored, v/u flag). */
  function compileHtmlPattern(pattern) {
    for (const flags of ['v', 'u', '']) {
      try { return new RegExp(`^(?:${pattern})$`, flags); } catch (_) { /* try next */ }
    }
    return null;
  }

  function parse(pattern) {
    let i = 0;

    function peek() { return pattern[i]; }
    function eat() { return pattern[i++]; }

    function parseAlternation() {
      const options = [parseSequence()];
      while (peek() === '|') {
        eat();
        options.push(parseSequence());
      }
      return options.length === 1 ? options[0] : { type: 'alt', options };
    }

    function parseSequence() {
      const items = [];
      while (i < pattern.length && peek() !== '|' && peek() !== ')') {
        const atom = parseAtom();
        if (atom) items.push(parseQuantifier(atom));
      }
      return { type: 'seq', items };
    }

    function parseQuantifier(atom) {
      const c = peek();
      let min = null;
      let max = null;
      if (c === '?') { eat(); min = 0; max = 1; }
      else if (c === '*') { eat(); min = 0; max = Infinity; }
      else if (c === '+') { eat(); min = 1; max = Infinity; }
      else if (c === '{') {
        const m = /^\{(\d+)(,(\d*))?\}/.exec(pattern.slice(i));
        if (!m) return atom;
        i += m[0].length;
        min = Number(m[1]);
        max = m[2] ? (m[3] === '' ? Infinity : Number(m[3])) : min;
      } else {
        return atom;
      }
      if (peek() === '?') eat(); // lazy modifier
      return { type: 'repeat', node: atom, min, max };
    }

    function parseEscape(inClass) {
      const c = eat();
      switch (c) {
        case 'd': return DIGITS;
        case 'D': return LOWER;
        case 'w': return WORD;
        case 'W': return '-';
        case 's': return ' ';
        case 'S': return LOWER;
        case 't': return '\t';
        case 'n': return '\n';
        case 'b': return inClass ? '\b' : null; // word boundary outside a class
        case 'B': return null;
        case 'u': {
          const m = /^\{?([0-9a-fA-F]{4,6})\}?/.exec(pattern.slice(i));
          if (m) { i += m[0].length; return String.fromCodePoint(parseInt(m[1], 16)); }
          return 'u';
        }
        case 'x': {
          const hex = pattern.slice(i, i + 2);
          i += 2;
          return String.fromCharCode(parseInt(hex, 16));
        }
        default:
          if (/[1-9]/.test(c)) throw new Error('Backreferences are not supported');
          return c;
      }
    }

    function parseClass() {
      // after '['
      let negate = false;
      if (peek() === '^') { eat(); negate = true; }
      let chars = '';
      let first = true;
      while (i < pattern.length && (peek() !== ']' || first)) {
        first = false;
        let start;
        if (peek() === '\\') { eat(); start = parseEscape(true); }
        else start = eat();
        if (start && start.length === 1 && peek() === '-' && pattern[i + 1] && pattern[i + 1] !== ']') {
          eat();
          let end;
          if (peek() === '\\') { eat(); end = parseEscape(true); }
          else end = eat();
          const a = start.codePointAt(0);
          const b = end.codePointAt(0);
          for (let cp = a; cp <= b && cp - a < 400; cp++) chars += String.fromCodePoint(cp);
        } else if (start) {
          chars += start;
        }
      }
      eat(); // ']'
      if (negate) {
        const allowed = [...POOL].filter((ch) => !chars.includes(ch)).join('');
        return { type: 'set', chars: allowed || '~' };
      }
      return { type: 'set', chars: orderReadable(chars) };
    }

    function parseAtom() {
      const c = eat();
      if (c === '(') {
        let lookaround = false;
        if (peek() === '?') {
          eat();
          const kind = eat();
          if (kind === '=' || kind === '!') lookaround = true;
          else if (kind === '<') {
            const next = peek();
            if (next === '=' || next === '!') { eat(); lookaround = true; }
            else { while (i < pattern.length && peek() !== '>') eat(); eat(); }
          }
          // '?:' falls through as a plain group
        }
        const node = parseAlternation();
        eat(); // ')'
        return lookaround ? null : { type: 'group', node };
      }
      if (c === '[') return parseClass();
      if (c === '\\') {
        const chars = parseEscape(false);
        return chars === null ? null : { type: 'set', chars: chars.length > 1 ? orderReadable(chars) : chars };
      }
      if (c === '.') return { type: 'set', chars: LOWER };
      if (c === '^' || c === '$') return null;
      return { type: 'set', chars: c };
    }

    const ast = parseAlternation();
    if (i < pattern.length) throw new Error('Unbalanced pattern');
    return ast;
  }

  // Prefer letters, then digits, then everything else so samples look natural.
  function orderReadable(chars) {
    const uniq = [...new Set(chars)];
    const rank = (ch) => (LOWER.includes(ch) ? 0 : UPPER.includes(ch) ? 1 : DIGITS.includes(ch) ? 2 : 3);
    return uniq.sort((a, b) => rank(a) - rank(b) || (a < b ? -1 : 1)).join('');
  }

  function repeatCount(min, max, strategy) {
    const cap = max === Infinity ? min + 12 : max;
    if (strategy === 'min') return Math.max(min, min === 0 && max >= 1 ? 1 : 0);
    if (strategy === 'long') return cap;
    return Math.min(cap, Math.max(min, Math.ceil((min + cap) / 2)));
  }

  function generate(node, ctx) {
    switch (node.type) {
      case 'seq': return node.items.map((n) => generate(n, ctx)).join('');
      case 'alt': return generate(node.options[ctx.variant % node.options.length], ctx);
      case 'group': return generate(node.node, ctx);
      case 'set': {
        const ch = node.chars[(ctx.pos + ctx.variant) % node.chars.length];
        ctx.pos += 1;
        return ch;
      }
      case 'repeat': {
        const n = repeatCount(node.min, node.max, ctx.strategy);
        let out = '';
        for (let k = 0; k < n; k++) out += generate(node.node, ctx);
        return out;
      }
      default: return '';
    }
  }

  function satisfies(value, regex, minLength, maxLength) {
    if (typeof value !== 'string') return false;
    if (regex && !regex.test(value)) return false;
    if (minLength && value.length < minLength) return false;
    if (maxLength && value.length > maxLength) return false;
    return true;
  }

  /**
   * Return a value satisfying `pattern` (and optional length limits), trying
   * the caller's preferred values first. Returns null when nothing verifies.
   */
  function generateMatching(pattern, { minLength = 0, maxLength = 0, preferred = [], attempt = 0 } = {}) {
    const regex = pattern ? compileHtmlPattern(pattern) : null;
    if (pattern && !regex) return null;

    for (const candidate of preferred) {
      if (satisfies(candidate, regex, minLength, maxLength)) return candidate;
    }
    if (!pattern) return null;

    let ast;
    try { ast = parse(pattern); } catch (_) { return null; }

    const strategies = ['min', 'mid', 'long'];
    for (let variant = attempt; variant < attempt + 4; variant++) {
      for (const strategy of strategies) {
        const value = generate(ast, { strategy, variant, pos: 0 });
        if (satisfies(value, regex, minLength, maxLength)) return value;
        // Pad or trim to meet length limits while keeping the pattern valid.
        if (minLength && value.length < minLength) {
          const longer = generate(ast, { strategy: 'long', variant, pos: 0 });
          if (satisfies(longer, regex, minLength, maxLength)) return longer;
        }
      }
    }
    return null;
  }

  PM.regexSampler = { compileHtmlPattern, generateMatching, parse };
})();
