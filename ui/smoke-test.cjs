const fs = require("node:fs");
const vm = require("node:vm");
const assert = require("node:assert/strict");

class ClassList {
  constructor() { this.values = new Set(); }
  add(...names) { names.forEach((name) => this.values.add(name)); }
  remove(...names) { names.forEach((name) => this.values.delete(name)); }
  contains(name) { return this.values.has(name); }
  toggle(name, force) {
    if (force === true) { this.values.add(name); return true; }
    if (force === false) { this.values.delete(name); return false; }
    if (this.values.has(name)) { this.values.delete(name); return false; }
    this.values.add(name);
    return true;
  }
}

class Element {
  constructor(id = "") {
    this.id = id;
    this.className = "";
    this.classList = new ClassList();
    this.style = {};
    this.textContent = "";
    this.disabled = false;
    this.value = "";
    this.children = [];
    this.handlers = new Map();
    this._innerHTML = "";
    this._toggle = null;
  }

  set innerHTML(value) {
    this._innerHTML = String(value);
    if (value === "") this.children = [];
    if (!this._innerHTML.includes("mass-toggle")) this._toggle = null;
  }

  get innerHTML() { return this._innerHTML; }

  appendChild(child) { this.children.push(child); return child; }
  replaceChildren(...children) { this.children = [...children]; }

  addEventListener(type, handler) {
    if (!this.handlers.has(type)) this.handlers.set(type, []);
    this.handlers.get(type).push(handler);
  }

  emit(type, event = {}) {
    const supplied = { stopPropagation() {}, ...event };
    for (const handler of this.handlers.get(type) || []) handler(supplied);
  }

  setAttribute() {}

  querySelector(selector) {
    if (selector === ".mass-toggle" && this._innerHTML.includes("mass-toggle")) {
      if (!this._toggle) this._toggle = new Element("mass-toggle");
      return this._toggle;
    }
    return null;
  }
}

const elements = new Map();
const document = {
  getElementById(id) {
    if (!elements.has(id)) elements.set(id, new Element(id));
    return elements.get(id);
  },
  querySelectorAll() { return []; },
  createElement() { return new Element(); },
};

const window = { document };
const context = vm.createContext({
  window,
  document,
  setTimeout: (fn) => fn(),
  Intl,
  console,
});

const source = fs.readFileSync("ui/app.js", "utf8");
vm.runInContext(
  source + "\n;globalThis.__atlasTest = { state, ui, renderMassTree, renderDuplicates };",
  context,
  { filename: "ui/app.js" },
);

const { state, ui, renderMassTree } = context.__atlasTest;
const root = {
  name: "root",
  path: "C:/root",
  logicalBytes: 300,
  allocatedBytes: 300,
  reclaimableBytes: 200,
  fileCount: 3,
  duplicateFileCount: 2,
  children: [
    {
      name: "bloated",
      path: "C:/root/bloated",
      logicalBytes: 200,
      allocatedBytes: 200,
      reclaimableBytes: 200,
      fileCount: 2,
      duplicateFileCount: 2,
      children: [
        {
          name: "deep",
          path: "C:/root/bloated/deep",
          logicalBytes: 100,
          allocatedBytes: 100,
          reclaimableBytes: 100,
          fileCount: 1,
          duplicateFileCount: 1,
          children: [],
        },
      ],
    },
    {
      name: "clean",
      path: "C:/root/clean",
      logicalBytes: 100,
      allocatedBytes: 100,
      reclaimableBytes: 0,
      fileCount: 1,
      duplicateFileCount: 0,
      children: [],
    },
  ],
};

state.report = { directoryTree: root, duplicates: [] };
state.lens = "waste";
state.expandedPaths = new Set([root.path]);
state.dedupeScopePath = null;

renderMassTree(root);
assert.equal(ui.massTree.children.length, 2, "WASTE view should show root and its waste-bearing child");

let rootRow = ui.massTree.children[0];
assert.ok(rootRow._toggle, "root should expose an expand/collapse control");
rootRow._toggle.emit("click");
assert.equal(ui.massTree.children.length, 1, "collapsing root should remove child rows");

rootRow = ui.massTree.children[0];
rootRow._toggle.emit("click");
assert.equal(ui.massTree.children.length, 2, "expanding root should restore visible child rows");

const bloatedRow = ui.massTree.children[1];
bloatedRow.emit("click");
assert.equal(
  state.dedupeScopePath,
  "C:/root/bloated",
  "clicking a branch should scope duplicate evidence to that branch",
);

console.log("File Atlas UI runtime smoke: OK");
