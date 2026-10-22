// Shim minimo de DOM para testar o frontend em Node, sem navegador.

class ClassList {
  constructor(el) { this.el = el; this.set = new Set(); }
  add(...c) { c.forEach((x) => this.set.add(x)); this.sync(); }
  remove(...c) { c.forEach((x) => this.set.delete(x)); this.sync(); }
  toggle(c, force) {
    const on = force === undefined ? !this.set.has(c) : !!force;
    if (on) this.set.add(c); else this.set.delete(c);
    this.sync();
    return on;
  }
  contains(c) { return this.set.has(c); }
  sync() { this.el._className = [...this.set].join(' '); }
}

class Node {
  constructor() { this.childNodes = []; this.parentNode = null; }
  get firstChild() { return this.childNodes[0] || null; }
  appendChild(child) {
    if (child.parentNode) child.parentNode.removeChild(child);
    child.parentNode = this;
    this.childNodes.push(child);
    return child;
  }
  removeChild(child) {
    const i = this.childNodes.indexOf(child);
    if (i >= 0) this.childNodes.splice(i, 1);
    child.parentNode = null;
    return child;
  }
  insertBefore(child, ref) {
    if (!ref) return this.appendChild(child);
    if (child.parentNode) child.parentNode.removeChild(child);
    const i = this.childNodes.indexOf(ref);
    child.parentNode = this;
    this.childNodes.splice(i < 0 ? this.childNodes.length : i, 0, child);
    return child;
  }
  remove() { if (this.parentNode) this.parentNode.removeChild(this); }
}

class TextNode extends Node {
  constructor(t) { super(); this.nodeType = 3; this._text = String(t); }
  get textContent() { return this._text; }
  set textContent(v) { this._text = String(v); }
}

class Element extends Node {
  constructor(tag) {
    super();
    this.nodeType = 1;
    this.tagName = tag.toUpperCase();
    this.attributes = {};
    this._className = '';
    this.style = makeStyle();
    this.dataset = {};
    this._innerHTML = '';
    this._listeners = {};
    this.classList = new ClassList(this);
  }
  get className() { return this._className; }
  set className(v) {
    this._className = v || '';
    this.classList.set = new Set(String(v || '').split(/\s+/).filter(Boolean));
  }
  get innerHTML() { return this._innerHTML; }
  set innerHTML(v) { this._innerHTML = String(v); this.childNodes = []; }
  get textContent() {
    return this.childNodes.map((c) => c.textContent).join('');
  }
  set textContent(v) {
    this.childNodes = [];
    if (v !== '' && v != null) this.appendChild(new TextNode(v));
  }
  setAttribute(k, v) {
    this.attributes[k] = String(v);
    if (k === 'class') this.className = v;
  }
  getAttribute(k) { return this.attributes[k] ?? null; }
  addEventListener(tipo, fn) { (this._listeners[tipo] ||= []).push(fn); }
  removeEventListener(tipo, fn) {
    this._listeners[tipo] = (this._listeners[tipo] || []).filter((f) => f !== fn);
  }
  dispatch(tipo, ev = {}) {
    const e = { type: tipo, target: this, preventDefault() {}, stopPropagation() {}, ...ev };
    for (const fn of this._listeners[tipo] || []) fn(e);
    return e;
  }
  descendants() {
    const out = [];
    for (const c of this.childNodes) {
      if (c.nodeType === 1) { out.push(c); out.push(...c.descendants()); }
    }
    return out;
  }
  querySelectorAll(sel) {
    const all = this.descendants();
    return all.filter((n) => matches(n, sel));
  }
  querySelector(sel) { return this.querySelectorAll(sel)[0] || null; }
  get outerHTML() { return serialize(this); }
}

function matchSimples(node, sel) {
  for (const part of sel.split(/(?=[.#])/)) {
    if (!part) continue;
    if (part.startsWith('.')) {
      if (!node.classList.contains(part.slice(1))) return false;
    } else if (part.startsWith('#')) {
      if (node.id !== part.slice(1)) return false;
    } else if (node.tagName !== part.toUpperCase()) return false;
  }
  return true;
}

function matches(node, sel) {
  const parts = sel.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return false;
  if (!matchSimples(node, parts[parts.length - 1])) return false;
  let anc = node.parentNode;
  for (let i = parts.length - 2; i >= 0; i--) {
    let found = false;
    while (anc) {
      if (matchSimples(anc, parts[i])) { found = true; anc = anc.parentNode; break; }
      anc = anc.parentNode;
    }
    if (!found) return false;
  }
  return true;
}

function makeStyle() {
  const s = {};
  s.setProperty = (k, v) => { s[k] = v; };
  return s;
}

function serialize(node, depth = 0) {
  if (node.nodeType === 3) return node.textContent;
  const attrs = Object.entries(node.attributes).map(([k, v]) => ` ${k}="${v}"`).join('');
  const kids = node.childNodes.map((c) => serialize(c)).join('');
  return `<${node.tagName.toLowerCase()}${attrs}>${kids}</${node.tagName.toLowerCase()}>`;
}

export function instalarDOM() {
  const doc = new Element('#document');
  doc.createElement = (t) => new Element(t);
  doc.createElementNS = (ns, t) => new Element(t);
  doc.createTextNode = (t) => new TextNode(t);
  doc.getElementById = (id) => doc.descendants().find((n) => n.id === id) || null;
  doc.querySelectorAll = (sel) => doc.querySelectorAll(sel);
  doc.documentElement = new Element('html');
  doc.body = new Element('body');
  doc.appendChild(doc.documentElement);
  doc.documentElement.appendChild(doc.body);

  const win = {
    document: doc,
    location: { hash: '', reload() {} },
    history: { replaceState() {} },
    setInterval: () => 0,
    clearInterval: () => {},
    setTimeout: (fn, ms) => setTimeout(fn, ms),
    clearTimeout: (t) => clearTimeout(t),
    open: () => {},
    addEventListener() {},
  };
  win.window = win;
  win.globalThis = win;

  globalThis.document = doc;
  globalThis.window = win;
  globalThis.location = win.location;
  globalThis.history = win.history;
  globalThis.Element = Element;
  globalThis.Node = Node;
  globalThis.setInterval = win.setInterval;
  globalThis.clearInterval = win.clearInterval;
  return { doc, win };
}

export { Element, TextNode };
