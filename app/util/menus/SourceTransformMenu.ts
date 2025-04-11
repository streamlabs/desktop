import { Menu } from './Menu';
import { SelectionService } from 'services/selection';
import { Inject } from 'services/core/injector';
import { $t } from 'services/i18n';
import { EditorCommandsService } from 'services/editor-commands';
import { ECenteringType } from 'services/editor-commands/commands/center-items';
import { EFlipAxis } from 'services/editor-commands/commands/flip-items';
import { TDisplayType } from 'services/video';

export class SourceTransformMenu extends Menu {
  @Inject() private selectionService: SelectionService;
  @Inject() private editorCommandsService: EditorCommandsService;

  constructor(private display?: TDisplayType) {
    super();

    this.appendMenuItems(this.display);
  }

  appendMenuItems(display?: TDisplayType) {
    this.append({
      label: $t('Edit Transform'),
      click: () => this.selectionService.openEditTransform(display),
    });

    this.append({
      label: $t('Reset Transform'),
      click: () =>
        this.editorCommandsService.executeCommand(
          'ResetTransformCommand',
          this.selectionService.views.globalSelection,
        ),
    });

    this.append({ type: 'separator' });

    this.append({
      label: $t('Stretch to Screen'),
      click: () =>
        this.editorCommandsService.executeCommand(
          'StretchToScreenCommand',
          this.selectionService.views.globalSelection,
        ),
    });

    this.append({
      label: $t('Fit to Screen'),
      click: () =>
        this.editorCommandsService.executeCommand(
          'FitToScreenCommand',
          this.selectionService.views.globalSelection,
        ),
    });

    this.append({ type: 'separator' });

    this.append({
      label: $t('Center on Screen'),
      click: () =>
        this.editorCommandsService.executeCommand(
          'CenterItemsCommand',
          this.selectionService.views.globalSelection,
          ECenteringType.Screen,
        ),
    });

    this.append({
      label: $t('Center Horizontal'),
      click: () =>
        this.editorCommandsService.executeCommand(
          'CenterItemsCommand',
          this.selectionService.views.globalSelection,
          ECenteringType.Horizontal,
        ),
    });

    this.append({
      label: $t('Center Vertical'),
      click: () =>
        this.editorCommandsService.executeCommand(
          'CenterItemsCommand',
          this.selectionService.views.globalSelection,
          ECenteringType.Vertical,
        ),
    });

    this.append({ type: 'separator' });

    this.append({
      label: $t('Flip Vertical'),
      click: () =>
        this.editorCommandsService.executeCommand(
          'FlipItemsCommand',
          this.selectionService.views.globalSelection,
          EFlipAxis.Vertical,
        ),
    });

    this.append({
      label: $t('Flip Horizontal'),
      click: () =>
        this.editorCommandsService.executeCommand(
          'FlipItemsCommand',
          this.selectionService.views.globalSelection,
          EFlipAxis.Horizontal,
        ),
    });

    this.append({ type: 'separator' });

    this.append({
      label: $t('Rotate 90 Degrees CW'),
      click: () =>
        this.editorCommandsService.executeCommand(
          'RotateItemsCommand',
          this.selectionService.views.globalSelection,
          90,
        ),
    });

    this.append({
      label: $t('Rotate 90 Degrees CCW'),
      click: () =>
        this.editorCommandsService.executeCommand(
          'RotateItemsCommand',
          this.selectionService.views.globalSelection,
          -90,
        ),
    });

    this.append({
      label: $t('Rotate 180 Degrees'),
      click: () =>
        this.editorCommandsService.executeCommand(
          'RotateItemsCommand',
          this.selectionService.views.globalSelection,
          180,
        ),
    });
  }
}
