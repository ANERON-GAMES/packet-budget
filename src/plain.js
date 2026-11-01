export function isPlainObject(value) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    return false;
  }
  if (Object.getOwnPropertySymbols(value).length !== 0) {
    return false;
  }
  const names = Object.getOwnPropertyNames(value);
  for (let index = 0; index < names.length; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(value, names[index]);
    if (descriptor.enumerable !== true) {
      return false;
    }
    if (Object.hasOwn(descriptor, "get") || Object.hasOwn(descriptor, "set")) {
      return false;
    }
  }
  return true;
}

export function readOwn(object, key) {
  return Object.getOwnPropertyDescriptor(object, key).value;
}

export function assertExactKeys(object, expected, message) {
  const keys = Object.keys(object);
  if (keys.length !== expected.length) {
    throw new TypeError(message);
  }
  for (let index = 0; index < expected.length; index += 1) {
    if (!Object.hasOwn(object, expected[index])) {
      throw new TypeError(message);
    }
  }
}

export function assertDenseArray(value, message) {
  if (!Array.isArray(value) || Object.getOwnPropertySymbols(value).length !== 0) {
    throw new TypeError(message);
  }
  const names = Object.getOwnPropertyNames(value);
  if (names.length !== value.length + 1 || !Object.hasOwn(value, "length")) {
    throw new TypeError(message);
  }
  for (let index = 0; index < value.length; index += 1) {
    const key = String(index);
    if (!Object.hasOwn(value, key)) {
      throw new TypeError(message);
    }
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor.enumerable !== true || Object.hasOwn(descriptor, "get")) {
      throw new TypeError(message);
    }
  }
}

export function normalizeZero(value) {
  if (value === 0) {
    return 0;
  }
  return value;
}

export function freezeDeep(value) {
  if (value === null || typeof value !== "object") {
    return value;
  }
  const keys = Object.keys(value);
  for (let index = 0; index < keys.length; index += 1) {
    freezeDeep(readOwn(value, keys[index]));
  }
  return Object.freeze(value);
}
