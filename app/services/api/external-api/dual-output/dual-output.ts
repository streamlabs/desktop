import { Fallback, Singleton } from 'services/api/external-api';
import { Inject } from 'services/core/injector';
import { DualOutputService as InternalDualOutputService } from 'services/dual-output';
import { Observable } from 'rxjs';

@Singleton()
export class DualOutputService {
  @Fallback()
  @Inject()
  private dualOutputService: InternalDualOutputService;

  /**
   * Observable event that is triggered whenever a dual output scene collection
   * create or validate has completed.
   * The observed value is the dual output scene collection's scene node map.
   */
  get collectionHandled(): Observable<{ [sceneId: string]: Dictionary<string> } | null> {
    return this.dualOutputService.collectionHandled;
  }

  /**
   * Observable event that is triggered whenever a dual output collection's
   * scene node has been handled.
   * The observed value is the scene node's index in the list of nodes.
   */
  get sceneNodeHandled(): Observable<number> {
    return this.dualOutputService.sceneNodeHandled;
  }

  /**
   * @returns The dual output scene collection's node map used to correlate
   * the nodes in the horizontal and vertical displays
   */
  get sceneNodeMaps(): { [sceneId: string]: Dictionary<string> } {
    return this.dualOutputService.views.sceneNodeMaps;
  }

  /**
   * Converts the single output collection to a dual output collection.
   */
  convertSingleOutputToDualOutputCollection(): void {
    return this.dualOutputService.convertSingleOutputToDualOutputCollection();
  }

  /**
   * Converts the single output collection to a dual output collection.
   */
  validateDualOutputCollection(): void {
    return this.dualOutputService.validateDualOutputCollection();
  }
}
