export interface ISceneCollectionLoadSession {
  /**
   * Legacy absolute-coordinate collections must load completely before they
   * can be persisted in the relative-coordinate schema.
   */
  strictCoordinateMigration: boolean;
}

export interface ISceneCollectionLoadContext {
  loadSession?: ISceneCollectionLoadSession;
}
