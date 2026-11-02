import { effectivePriority, readAge } from "./age.js";
import { MAX_BYTES } from "./constants.js";
import {
  assertDenseArray,
  assertExactKeys,
  freezeDeep,
  isPlainObject,
  normalizeZero,
  readOwn
} from "./plain.js";

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
const STRICT_MESSAGE = "strict must be a boolean";
const COST_MESSAGE = "update cost must be an integer from 0 to 9007199254740991";

const UPDATE_KEYS = ["id", "payload", "priority", "ticks"];

const OPTION_KEYS = Object.create(null);
OPTION_KEYS.budget = true;
OPTION_KEYS.packetHeader = true;
OPTION_KEYS.updateHeader = true;
OPTION_KEYS.updates = true;
OPTION_KEYS.age = true;
OPTION_KEYS.strict = true;

function assertKnownFields(options) {
  const keys = Object.keys(options);
  for (let index = 0; index < keys.length; index += 1) {
    if (!Object.hasOwn(OPTION_KEYS, keys[index])) {
      throw new TypeError(UNKNOWN_MESSAGE);
    }
  }
}

function readByteCount(value, max, message) {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0 || value > max) {
    throw new RangeError(message);
  }
  return normalizeZero(value);
}

function readPriority(value) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new RangeError(PRIORITY_MESSAGE);
  }
  return normalizeZero(value);
}

function readId(update) {
  const id = readOwn(update, "id");
  if (typeof id !== "string" || id.length === 0) {
    throw new TypeError(ID_MESSAGE);
  }
  return id;
}

function addCost(updateHeader, payload) {
  const cost = updateHeader + payload;
  if (!Number.isSafeInteger(cost)) {
    throw new RangeError(COST_MESSAGE);
  }
  return cost;
}

function readUpdateList(updates, age, updateHeader) {
  const seen = Object.create(null);
  const prepared = [];
  for (let index = 0; index < updates.length; index += 1) {
    const update = updates[index];
    if (!isPlainObject(update)) {
      throw new TypeError(UPDATE_MESSAGE);
    }
    assertExactKeys(update, UPDATE_KEYS, UPDATE_FIELDS_MESSAGE);
    const id = readId(update);
    if (Object.hasOwn(seen, id)) {
      throw new TypeError(UNIQUE_MESSAGE);
    }
    seen[id] = true;
    const payload = readByteCount(readOwn(update, "payload"), MAX_BYTES, PAYLOAD_MESSAGE);
    const priority = readPriority(readOwn(update, "priority"));
    const ticks = readByteCount(readOwn(update, "ticks"), MAX_BYTES, TICKS_MESSAGE);
    const cost = addCost(updateHeader, payload);
    prepared.push({
      id,
      cost,
      effectivePriority: effectivePriority(priority, ticks, age)
    });
  }
  return prepared;
}

function readStrict(options) {
  if (!Object.hasOwn(options, "strict") || readOwn(options, "strict") === undefined) {
    return false;
  }
  const value = readOwn(options, "strict");
  if (typeof value !== "boolean") {
    throw new TypeError(STRICT_MESSAGE);
  }
  return value;
}

function readSettings(options) {
  if (!isPlainObject(options)) {
    throw new TypeError(OPTIONS_MESSAGE);
  }
  assertKnownFields(options);
  const budget = readByteCount(
    Object.hasOwn(options, "budget") ? readOwn(options, "budget") : undefined,
    MAX_BYTES,
    BUDGET_MESSAGE
  );
  const packetHeader = readByteCount(
    Object.hasOwn(options, "packetHeader") ? readOwn(options, "packetHeader") : undefined,
    budget,
    PACKET_HEADER_MESSAGE
  );
  const updateHeader = readByteCount(
    Object.hasOwn(options, "updateHeader") ? readOwn(options, "updateHeader") : undefined,
    MAX_BYTES,
    UPDATE_HEADER_MESSAGE
  );
  const age = readAge(options);
  const strict = readStrict(options);
  if (!Object.hasOwn(options, "updates")) {
    throw new TypeError(UPDATES_MESSAGE);
  }
  const updates = readOwn(options, "updates");
  assertDenseArray(updates, UPDATES_MESSAGE);
  return {
    budget,
    packetHeader,
    updateHeader,
    usable: budget - packetHeader,
    age,
    strict,
    prepared: readUpdateList(updates, age, updateHeader)
  };
}

function compareUpdates(left, right) {
  if (left.effectivePriority > right.effectivePriority) {
    return -1;
  }
  if (left.effectivePriority < right.effectivePriority) {
    return 1;
  }
  if (left.id < right.id) {
    return -1;
  }
  if (left.id > right.id) {
    return 1;
  }
  return 0;
}

function pack(settings) {
  const oversize = [];
  const candidates = [];
  const prepared = settings.prepared;
  for (let index = 0; index < prepared.length; index += 1) {
    const update = prepared[index];
    if (update.cost > settings.usable) {
      oversize.push(update.id);
    } else {
      candidates.push(update);
    }
  }
  candidates.sort(compareUpdates);
  const selected = [];
  const deferred = [];
  let space = settings.usable;
  let stopped = false;
  for (let index = 0; index < candidates.length; index += 1) {
    const update = candidates[index];
    if (!stopped && update.cost <= space) {
      selected.push(update.id);
      space -= update.cost;
    } else {
      if (settings.strict) {
        stopped = true;
      }
      deferred.push({
        id: update.id,
        effectivePriority: update.effectivePriority
      });
    }
  }
  let bytesUsed = 0;
  if (selected.length > 0) {
    bytesUsed = settings.packetHeader + (settings.usable - space);
  }
  return {
    selected,
    bytesUsed,
    remaining: settings.budget - bytesUsed,
    deferred,
    oversize
  };
}

export function selectUpdates(options) {
  return freezeDeep(pack(readSettings(options)));
}
