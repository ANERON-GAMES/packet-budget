import { CAPPED, LINEAR } from "./constants.js";
import { assertExactKeys, isPlainObject, normalizeZero, readOwn } from "./plain.js";

const AGE_MESSAGE = "age must be an object";
const TYPE_MESSAGE = "age type must be linear or capped";
const LINEAR_FIELDS_MESSAGE = "linear age fields must be type and perTick";
const CAPPED_FIELDS_MESSAGE = "capped age fields must be type, perTick, and cap";
const PER_TICK_MESSAGE = "perTick must be a finite number greater than or equal to 0";
const CAP_MESSAGE = "cap must be a finite number greater than or equal to 1";
const EFFECTIVE_MESSAGE = "effective priority must be finite";

const LINEAR_KEYS = ["type", "perTick"];
const CAPPED_KEYS = ["type", "perTick", "cap"];

function readPerTick(age) {
  const value = readOwn(age, "perTick");
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new RangeError(PER_TICK_MESSAGE);
  }
  return normalizeZero(value);
}

function readCap(age) {
  const value = readOwn(age, "cap");
  if (typeof value !== "number" || !Number.isFinite(value) || value < 1) {
    throw new RangeError(CAP_MESSAGE);
  }
  return value;
}

export function readAge(options) {
  if (!Object.hasOwn(options, "age") || readOwn(options, "age") === undefined) {
    return { type: LINEAR, perTick: 0 };
  }
  const age = readOwn(options, "age");
  if (!isPlainObject(age)) {
    throw new TypeError(AGE_MESSAGE);
  }
  if (!Object.hasOwn(age, "type")) {
    throw new TypeError(TYPE_MESSAGE);
  }
  const type = readOwn(age, "type");
  if (type === LINEAR) {
    assertExactKeys(age, LINEAR_KEYS, LINEAR_FIELDS_MESSAGE);
    return { type: LINEAR, perTick: readPerTick(age) };
  }
  if (type === CAPPED) {
    assertExactKeys(age, CAPPED_KEYS, CAPPED_FIELDS_MESSAGE);
    return { type: CAPPED, perTick: readPerTick(age), cap: readCap(age) };
  }
  throw new TypeError(TYPE_MESSAGE);
}

export function effectivePriority(priority, ticks, age) {
  const grown = 1 + ticks * age.perTick;
  let factor = grown;
  if (age.type === CAPPED && grown > age.cap) {
    factor = age.cap;
  }
  const value = priority * factor;
  if (!Number.isFinite(value)) {
    throw new RangeError(EFFECTIVE_MESSAGE);
  }
  return normalizeZero(value);
}
