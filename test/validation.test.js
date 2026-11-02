import assert from "node:assert/strict";
import test from "node:test";
import { MAX_BYTES, selectUpdates } from "../src/index.js";

const OPTIONS_MESSAGE = "options must be an object";
const UNKNOWN_MESSAGE = "options has an unknown field";
const BUDGET_MESSAGE = "budget must be an integer from 0 to 9007199254740991";
const PACKET_HEADER_MESSAGE = "packetHeader must be an integer from 0 to budget";
const UPDATE_HEADER_MESSAGE = "updateHeader must be an integer from 0 to 9007199254740991";
const UPDATES_MESSAGE = "updates must be an array";
const UPDATE_MESSAGE = "update must be an object";
const UPDATE_FIELDS_MESSAGE = "update fields must be id, payload, priority, and ticks";
const ID_MESSAGE = "update id must be a non-empty string";
const UNIQUE_MESSAGE = "update ids must be unique";
const PAYLOAD_MESSAGE = "payload must be an integer from 0 to 9007199254740991";
const PRIORITY_MESSAGE = "priority must be a finite number greater than or equal to 0";
const TICKS_MESSAGE = "ticks must be an integer from 0 to 9007199254740991";
const AGE_MESSAGE = "age must be an object";
const TYPE_MESSAGE = "age type must be linear or capped";
const LINEAR_FIELDS_MESSAGE = "linear age fields must be type and perTick";
const CAPPED_FIELDS_MESSAGE = "capped age fields must be type, perTick, and cap";
const PER_TICK_MESSAGE = "perTick must be a finite number greater than or equal to 0";
const CAP_MESSAGE = "cap must be a finite number greater than or equal to 1";
const STRICT_MESSAGE = "strict must be a boolean";
const COST_MESSAGE = "update cost must be an integer from 0 to 9007199254740991";
const EFFECTIVE_MESSAGE = "effective priority must be finite";

function emptyOptions(overrides) {
  return {
    budget: 32,
    packetHeader: 4,
    updateHeader: 2,
    updates: [],
    ...overrides
  };
}

function oneUpdate(overrides) {
  return {
    id: "update-a",
    payload: 4,
    priority: 1,
    ticks: 0,
    ...overrides
  };
}

function rejects(options, name, message) {
  assert.throws(() => selectUpdates(options), { name, message });
}

test("options must be a plain object", () => {
  class Box {
    constructor() {
      this.budget = 1;
      this.packetHeader = 0;
      this.updateHeader = 0;
      this.updates = [];
    }
  }
  const values = [undefined, null, 1, "budget", true, [], new Box(), new Date()];
  for (const value of values) {
    rejects(value, "TypeError", OPTIONS_MESSAGE);
  }
});

test("options reject symbol keys and accessors", () => {
  const marked = emptyOptions();
  marked[Symbol("extra")] = true;
  rejects(marked, "TypeError", OPTIONS_MESSAGE);
  const read = {};
  Object.defineProperty(read, "budget", {
    enumerable: true,
    get() {
      return 32;
    }
  });
  read.packetHeader = 0;
  read.updateHeader = 0;
  read.updates = [];
  rejects(read, "TypeError", OPTIONS_MESSAGE);
});

test("options reject an unknown field before reading values", () => {
  rejects(
    {
      extra: true,
      budget: "no",
      packetHeader: 0,
      updateHeader: 0,
      updates: []
    },
    "TypeError",
    UNKNOWN_MESSAGE
  );
});

test("a null prototype and a frozen options object are accepted", () => {
  const bare = Object.create(null);
  bare.budget = 8;
  bare.packetHeader = 1;
  bare.updateHeader = 1;
  bare.updates = [{ id: "update-a", payload: 2, priority: 1, ticks: 0 }];
  const frozen = Object.freeze({
    budget: 8,
    packetHeader: 1,
    updateHeader: 1,
    updates: Object.freeze([Object.freeze({ id: "update-a", payload: 2, priority: 1, ticks: 0 })])
  });
  assert.deepEqual(selectUpdates(bare).selected, ["update-a"]);
  assert.deepEqual(selectUpdates(frozen).selected, ["update-a"]);
});

test("budget rejects values outside the safe integer range", () => {
  const values = [
    undefined,
    null,
    true,
    "32",
    1.5,
    -1,
    -0.1,
    NaN,
    Infinity,
    -Infinity,
    MAX_BYTES + 1
  ];
  for (const budget of values) {
    rejects(emptyOptions({ budget }), "RangeError", BUDGET_MESSAGE);
  }
  rejects({ packetHeader: 0, updateHeader: 0, updates: [] }, "RangeError", BUDGET_MESSAGE);
});

test("packetHeader rejects values outside 0 through budget", () => {
  const values = [undefined, null, 1.5, -1, NaN, Infinity, 33];
  for (const packetHeader of values) {
    rejects(emptyOptions({ packetHeader }), "RangeError", PACKET_HEADER_MESSAGE);
  }
  rejects({ budget: 10, updateHeader: 0, updates: [] }, "RangeError", PACKET_HEADER_MESSAGE);
  rejects(emptyOptions({ budget: "bad", packetHeader: 99 }), "RangeError", BUDGET_MESSAGE);
});

test("updateHeader rejects values outside the safe integer range", () => {
  const values = [undefined, null, -1, 1.5, NaN, Infinity, MAX_BYTES + 1];
  for (const updateHeader of values) {
    rejects(emptyOptions({ updateHeader }), "RangeError", UPDATE_HEADER_MESSAGE);
  }
  rejects(
    emptyOptions({ packetHeader: 99, updateHeader: -1 }),
    "RangeError",
    PACKET_HEADER_MESSAGE
  );
});

test("updates must be a dense array", () => {
  rejects(emptyOptions({ updates: undefined }), "TypeError", UPDATES_MESSAGE);
  rejects(emptyOptions({ updates: null }), "TypeError", UPDATES_MESSAGE);
  rejects(emptyOptions({ updates: {} }), "TypeError", UPDATES_MESSAGE);
  rejects(emptyOptions({ updates: "update-a" }), "TypeError", UPDATES_MESSAGE);
  const missing = { budget: 32, packetHeader: 0, updateHeader: 0 };
  rejects(missing, "TypeError", UPDATES_MESSAGE);
  const hole = [];
  hole.length = 1;
  rejects(emptyOptions({ updates: hole }), "TypeError", UPDATES_MESSAGE);
  const extra = [oneUpdate()];
  extra.note = true;
  rejects(emptyOptions({ updates: extra }), "TypeError", UPDATES_MESSAGE);
  const marked = [oneUpdate()];
  marked[Symbol("extra")] = true;
  rejects(emptyOptions({ updates: marked }), "TypeError", UPDATES_MESSAGE);
  const accessor = [];
  accessor.length = 1;
  Object.defineProperty(accessor, "0", {
    enumerable: true,
    get() {
      return oneUpdate();
    }
  });
  rejects(emptyOptions({ updates: accessor }), "TypeError", UPDATES_MESSAGE);
});

test("each update must be a plain object with the four fields", () => {
  rejects(emptyOptions({ updates: [null] }), "TypeError", UPDATE_MESSAGE);
  rejects(emptyOptions({ updates: ["update-a"] }), "TypeError", UPDATE_MESSAGE);
  rejects(emptyOptions({ updates: [1] }), "TypeError", UPDATE_MESSAGE);
  rejects(emptyOptions({ updates: [[]] }), "TypeError", UPDATE_MESSAGE);
  rejects(emptyOptions({ updates: [{}] }), "TypeError", UPDATE_FIELDS_MESSAGE);
  const missing = { payload: 1, priority: 1, ticks: 0 };
  rejects(emptyOptions({ updates: [missing] }), "TypeError", UPDATE_FIELDS_MESSAGE);
  const extra = oneUpdate({ note: true });
  rejects(emptyOptions({ updates: [extra] }), "TypeError", UPDATE_FIELDS_MESSAGE);
  const accessor = {};
  Object.defineProperty(accessor, "id", {
    enumerable: true,
    get() {
      return "update-a";
    }
  });
  accessor.payload = 1;
  accessor.priority = 1;
  accessor.ticks = 0;
  rejects(emptyOptions({ updates: [accessor] }), "TypeError", UPDATE_MESSAGE);
});

test("update ids must be unique non-empty strings", () => {
  rejects(emptyOptions({ updates: [oneUpdate({ id: "" })] }), "TypeError", ID_MESSAGE);
  rejects(emptyOptions({ updates: [oneUpdate({ id: 1 })] }), "TypeError", ID_MESSAGE);
  rejects(emptyOptions({ updates: [oneUpdate({ id: null })] }), "TypeError", ID_MESSAGE);
  rejects(
    emptyOptions({
      updates: [oneUpdate(), oneUpdate()]
    }),
    "TypeError",
    UNIQUE_MESSAGE
  );
  const result = selectUpdates(
    emptyOptions({
      budget: 20,
      packetHeader: 0,
      updateHeader: 0,
      updates: [oneUpdate({ id: "update-a" }), oneUpdate({ id: "update-b", payload: 1 })]
    })
  );
  assert.deepEqual(result.selected, ["update-a", "update-b"]);
});

test("payload, priority, and ticks reject out-of-range values", () => {
  const payloads = [-1, 1.5, NaN, Infinity, null, "4", MAX_BYTES + 1];
  for (const payload of payloads) {
    rejects(emptyOptions({ updates: [oneUpdate({ payload })] }), "RangeError", PAYLOAD_MESSAGE);
  }
  const priorities = [-1, NaN, Infinity, -Infinity, null, "1"];
  for (const priority of priorities) {
    rejects(emptyOptions({ updates: [oneUpdate({ priority })] }), "RangeError", PRIORITY_MESSAGE);
  }
  const ticks = [-1, 1.5, NaN, Infinity, null, "0", MAX_BYTES + 1];
  for (const ticksValue of ticks) {
    rejects(
      emptyOptions({ updates: [oneUpdate({ ticks: ticksValue })] }),
      "RangeError",
      TICKS_MESSAGE
    );
  }
});

test("age rejects the wrong shape and the wrong type", () => {
  rejects(emptyOptions({ age: null }), "TypeError", AGE_MESSAGE);
  rejects(emptyOptions({ age: [] }), "TypeError", AGE_MESSAGE);
  rejects(emptyOptions({ age: "linear" }), "TypeError", AGE_MESSAGE);
  rejects(emptyOptions({ age: { perTick: 1 } }), "TypeError", TYPE_MESSAGE);
  rejects(emptyOptions({ age: { type: "LINEAR", perTick: 1 } }), "TypeError", TYPE_MESSAGE);
  rejects(emptyOptions({ age: { type: "mean", perTick: 1 } }), "TypeError", TYPE_MESSAGE);
  rejects(emptyOptions({ age: { type: "linear" } }), "TypeError", LINEAR_FIELDS_MESSAGE);
  rejects(
    emptyOptions({ age: { type: "linear", perTick: 1, cap: 4 } }),
    "TypeError",
    LINEAR_FIELDS_MESSAGE
  );
  rejects(
    emptyOptions({ age: { type: "capped", perTick: 1 } }),
    "TypeError",
    CAPPED_FIELDS_MESSAGE
  );
  rejects(
    emptyOptions({ age: { type: "capped", perTick: 1, cap: 4, extra: true } }),
    "TypeError",
    CAPPED_FIELDS_MESSAGE
  );
});

test("perTick and cap reject values outside their ranges", () => {
  const perTicks = [-1, NaN, Infinity, null, "1"];
  for (const perTick of perTicks) {
    rejects(emptyOptions({ age: { type: "linear", perTick } }), "RangeError", PER_TICK_MESSAGE);
    rejects(
      emptyOptions({ age: { type: "capped", perTick, cap: 4 } }),
      "RangeError",
      PER_TICK_MESSAGE
    );
  }
  const caps = [0, 0.999, -1, NaN, Infinity, null, "4"];
  for (const cap of caps) {
    rejects(emptyOptions({ age: { type: "capped", perTick: 1, cap } }), "RangeError", CAP_MESSAGE);
  }
  rejects(
    emptyOptions({ age: { type: "capped", perTick: -1, cap: 0 } }),
    "RangeError",
    PER_TICK_MESSAGE
  );
});

test("strict must be a boolean when it is present", () => {
  for (const strict of [1, "true", null, 0]) {
    rejects(emptyOptions({ strict }), "TypeError", STRICT_MESSAGE);
  }
});

test("field checks run in a fixed order", () => {
  rejects(
    emptyOptions({
      updateHeader: -1,
      age: { type: "no", perTick: 1 },
      strict: "yes",
      updates: null
    }),
    "RangeError",
    UPDATE_HEADER_MESSAGE
  );
  rejects(
    emptyOptions({
      age: { type: "no", perTick: 1 },
      strict: "yes",
      updates: null
    }),
    "TypeError",
    TYPE_MESSAGE
  );
  rejects(
    emptyOptions({
      age: { type: "linear", perTick: 1 },
      strict: "yes",
      updates: null
    }),
    "TypeError",
    STRICT_MESSAGE
  );
  rejects(
    emptyOptions({
      updates: [oneUpdate({ id: "" }), oneUpdate({ payload: -1 })]
    }),
    "TypeError",
    ID_MESSAGE
  );
  rejects(
    emptyOptions({
      updates: [oneUpdate({ payload: -1 }), oneUpdate({ id: "" })]
    }),
    "RangeError",
    PAYLOAD_MESSAGE
  );
  rejects(
    emptyOptions({
      updateHeader: MAX_BYTES,
      updates: [oneUpdate({ payload: 1, id: "" })]
    }),
    "TypeError",
    ID_MESSAGE
  );
  rejects(
    emptyOptions({
      updateHeader: MAX_BYTES,
      updates: [oneUpdate({ payload: 1 }), oneUpdate({ id: "" })]
    }),
    "RangeError",
    COST_MESSAGE
  );
  rejects(
    emptyOptions({
      age: { type: "linear", perTick: Number.MAX_VALUE },
      updates: [
        oneUpdate({ priority: Number.MAX_VALUE, ticks: 1, id: "update-a" }),
        oneUpdate({ id: "" })
      ]
    }),
    "RangeError",
    EFFECTIVE_MESSAGE
  );
});

test("a throw leaves a frozen input unchanged", () => {
  const updates = Object.freeze([
    Object.freeze(oneUpdate()),
    Object.freeze(oneUpdate({ id: "update-b", priority: -1 }))
  ]);
  const options = Object.freeze(
    emptyOptions({
      updates
    })
  );
  rejects(options, "RangeError", PRIORITY_MESSAGE);
  assert.equal(updates.length, 2);
  assert.equal(updates[0].id, "update-a");
  assert.equal(updates[1].priority, -1);
});

test("accepted numeric edges include zero, the safe maximum, and one", () => {
  const full = selectUpdates({
    budget: MAX_BYTES,
    packetHeader: 0,
    updateHeader: 0,
    updates: [{ id: "update-a", payload: MAX_BYTES, priority: 0, ticks: MAX_BYTES }]
  });
  assert.deepEqual(full.selected, ["update-a"]);
  assert.equal(full.bytesUsed, MAX_BYTES);
  assert.equal(full.remaining, 0);
  const cap = selectUpdates({
    budget: 4,
    packetHeader: 0,
    updateHeader: 0,
    age: { type: "capped", perTick: 0, cap: 1 },
    updates: [{ id: "update-a", payload: 1, priority: 2, ticks: 9 }]
  });
  assert.deepEqual(cap.selected, ["update-a"]);
  assert.deepEqual(cap.deferred, []);
});
