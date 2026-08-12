export function orderIdempotencyKey(source, sourceId) {
  return `${source}:${sourceId}`;
}

export function assertPresent(value, name) {
  if (value === null || value === undefined || value === '') {
    throw new Error(`${name} is required`);
  }
}
