export class NdgrFetchError extends Error {
  constructor(public status: number, public uri: string) {
    super(`Failed to fetch(${uri}): ${status}`);

    this.name = new.target.name;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export function isNdgrFetchError(error: any): error is NdgrFetchError {
  // workaround: rxjs で届いた場合 instanceof が一致しないため、nameで判定する
  return error.name === 'NdgrFetchError';
}
