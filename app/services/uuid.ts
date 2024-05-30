import { StatefulService } from './core/stateful-service';
import uuidv4 from 'uuid/v4';

interface IUuidServiceState {}

export class UuidService extends StatefulService<IUuidServiceState> {
  localStorageKey = 'InstallationUuidv4';
  private _uuid: string = null;

  init() {
    this._uuid = this.getUuid();
  }

  get uuid() {
    if (this._uuid === null) {
      this._uuid = this.getUuid();
    }
    return this._uuid;
  }

  private generateUuid(): string {
    return uuidv4();
  }

  private getUuid(): string {
    // もし uuid が生成済みで保存されていたらそれを返す
    const storageUuid = localStorage.getItem(this.localStorageKey);
    if (storageUuid !== null) {
      return storageUuid;
    }
    // 無ければ生成して保存してから返す
    const uuid = this.generateUuid();
    localStorage.setItem(this.localStorageKey, uuid);
    return uuid;
  }
}
