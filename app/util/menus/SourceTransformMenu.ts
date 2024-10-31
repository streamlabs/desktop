import { $t } from 'services/i18n';
import { ScenesService } from 'services/scenes';
import { SelectionService } from 'services/selection';
import { VideoService } from 'services/video';
import { Inject } from '../../services/core/injector';
import { Menu } from './Menu';

export class SourceTransformMenu extends Menu {
  @Inject() private scenesService: ScenesService;
  @Inject() private videoService: VideoService;
  @Inject() private selectionService: SelectionService;

  constructor() {
    super();

    this.appendMenuItems();
  }

  appendMenuItems() {
    this.append({
      label: $t('sources.resetTransform'),
      click: () => {
        this.selectionService.resetTransform();
      },
    });

    this.append({ type: 'separator' });

    this.append({
      label: $t('sources.stretchToScreen'),
      click: () => {
        this.selectionService.stretchToScreen();
      },
    });

    this.append({
      label: $t('sources.fitToScreen'),
      click: () => {
        this.selectionService.fitToScreen();
      },
    });

    this.append({ type: 'separator' });

    this.append({
      label: $t('sources.centerOnScreen'),
      click: () => {
        this.selectionService.centerOnScreen();
      },
    });

    this.append({
      label: $t('sources.centerHorizontal'),
      click: () => {
        this.selectionService.centerOnHorizontal();
      },
    });

    this.append({
      label: $t('sources.centerVertical'),
      click: () => {
        this.selectionService.centerOnVertical();
      },
    });

    this.append({ type: 'separator' });

    this.append({
      label: $t('sources.flipVertical'),
      click: () => {
        this.selectionService.flipY();
      },
    });

    this.append({
      label: $t('sources.flipHorizontal'),
      click: () => {
        this.selectionService.flipX();
      },
    });

    this.append({ type: 'separator' });

    this.append({
      label: $t('sources.rotate90DegreesCw'),
      click: () => {
        this.selectionService.rotate(90);
      },
    });

    this.append({
      label: $t('sources.rotate90DegreesCcw'),
      click: () => {
        this.selectionService.rotate(-90);
      },
    });

    this.append({
      label: $t('sources.rotate180Degrees'),
      click: () => {
        this.selectionService.rotate(180);
      },
    });
  }
}
