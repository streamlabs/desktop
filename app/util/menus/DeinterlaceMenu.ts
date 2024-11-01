import { EDeinterlaceFieldOrder, EDeinterlaceMode } from 'obs-studio-node';
import { $t } from 'services/i18n';
import { ScenesService } from 'services/scenes';
import { SelectionService } from 'services/selection';
import { Source } from 'services/sources';
import { Inject } from '../../services/core/injector';
import { Menu } from './Menu';

export class DeinterlaceMenu extends Menu {
  @Inject() private scenesService: ScenesService;
  @Inject() private selectionService: SelectionService;

  private source: Source;

  constructor(source: Source) {
    super();

    this.source = source;
    this.appendMenuItems();
  }

  appendMenuItems() {
    const DEINTERLACE_MODES = [
      { id: 'Disable', value: EDeinterlaceMode.Disable, label: $t('deinterlace.disable') },
      { id: 'Discard', value: EDeinterlaceMode.Discard, label: $t('deinterlace.discard') },
      { id: 'Retro', value: EDeinterlaceMode.Retro, label: $t('deinterlace.retro') },
      { id: 'Blend', value: EDeinterlaceMode.Blend, label: $t('deinterlace.blend') },
      { id: 'Blend 2x', value: EDeinterlaceMode.Blend2X, label: $t('deinterlace.blend2x') },
      { id: 'Linear', value: EDeinterlaceMode.Linear, label: $t('deinterlace.linear') },
      { id: 'Linear 2x', value: EDeinterlaceMode.Linear2X, label: $t('deinterlace.linear2x') },
      { id: 'Yadif', value: EDeinterlaceMode.Yadif, label: $t('deinterlace.yadif') },
      { id: 'Yadif 2x', value: EDeinterlaceMode.Yadif2X, label: $t('deinterlace.yadif2x') },
    ];
    const DEINTERLACE_FIELD_ORDERS = [
      {
        id: 'Top field first',
        value: EDeinterlaceFieldOrder.Top,
        label: $t('deinterlace.top_field_first'),
      },
      {
        id: 'Bottom field first',
        value: EDeinterlaceFieldOrder.Bottom,
        label: $t('deinterlace.bottom_field_first'),
      },
    ];

    for (const mode of DEINTERLACE_MODES) {
      this.append({
        id: mode.id,
        type: 'checkbox',
        checked: this.source.deinterlaceMode === mode.value,
        label: mode.label,
        click: () => {
          this.source.setDeinterlaceMode(mode.value);
        },
      });
    }

    this.append({ type: 'separator' });

    for (const mode of DEINTERLACE_FIELD_ORDERS) {
      this.append({
        id: mode.id,
        type: 'checkbox',
        checked: this.source.deinterlaceFieldOrder === mode.value,
        label: mode.label,
        click: () => {
          this.source.setDeinterlaceFieldOrder(mode.value);
        },
      });
    }
  }
}
