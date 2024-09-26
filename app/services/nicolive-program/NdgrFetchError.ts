export class NdgrFetchError extends Error {
  constructor(
    public status: number | Error,
    public uri: string,
    public label: string,
    public phase: 'head' | 'backwards' | 'previous' | 'segment',
  ) {
    super(`Failed to fetch[${label}:${phase}]: ${status}`);

    this.name = new.target.name;
    Object.setPrototypeOf(this, new.target.prototype);
  }

  getTagsForSentry() {
    return {
      'ndgr.uri': this.uri,
      'ndgr.type': this.label,
      'ndgr.phase': this.phase,
      status: `${this.status}`,
    };
  }
}

export function isNdgrFetchError(error: any): error is NdgrFetchError {
  // workaround: rxjs で届いた場合 instanceof が一致しないため、nameで判定する
  return error.name === 'NdgrFetchError';
}
