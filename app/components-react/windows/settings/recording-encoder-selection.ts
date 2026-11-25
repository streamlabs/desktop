import type { IObsListInput, IObsListOption, TObsFormData } from 'components/obs/inputs/ObsInput';
import { $t } from 'services/i18n';
import {
  convertFileFormatToRecordingFormat,
  EFileFormat,
  legacyEncoderAliasToObsEncoderIdOrSelf,
  missingEncoderAdvice,
  TOutputSettingsMode,
} from 'services/settings/output';
import type { EncoderQueryService } from 'services/settings/output';

type Choices = ReturnType<EncoderQueryService['getRecordingEncoderChoices']>;

export function recordingEncoderSelection(
  recording: TObsFormData,
  mode: TOutputSettingsMode,
  streamEncoder: string,
  choices: Choices,
  missing: ReturnType<EncoderQueryService['getMissingEncoderInfo']>,
) {
  const format = recording.find(p => p.name === 'RecFormat') as IObsListInput<EFileFormat>;
  const encoder = recording.find(p => p.name === 'RecEncoder') as IObsListInput<string>;
  const quality = recording.find(p => p.name === 'RecQuality')?.value;
  const useStream = mode === 'Simple' && quality === 'Stream';
  if (
    !format?.visible ||
    !format.enabled ||
    quality === 'Lossless' ||
    (!useStream && !encoder?.visible)
  ) {
    return { parameters: recording, valid: true };
  }

  const selectedFormat = convertFileFormatToRecordingFormat(format.value);
  if (selectedFormat === undefined) return { parameters: recording, valid: true };
  const compatible = choices[selectedFormat];
  const selected = useStream || encoder?.value === 'none' ? streamEncoder : encoder.value;
  const supports = (options: IObsListOption<string>[], id: string) =>
    options.some(
      option =>
        legacyEncoderAliasToObsEncoderIdOrSelf(option.value) ===
        legacyEncoderAliasToObsEncoderIdOrSelf(id),
    );
  const valid = !!compatible && supports(compatible, selected);
  const field = useStream ? format : encoder;
  const allEncoders = Object.values(choices).flat();
  const formatLabel =
    format.options.find(option => option.value === format.value)?.description ?? format.value;
  let options: IObsListOption<string>[];
  if (useStream) {
    options = format.options.map(option => {
      const encoders = choices[convertFileFormatToRecordingFormat(option.value)];
      return { ...option, disabled: !!encoders && !supports(encoders, streamEncoder) };
    });
  } else if (compatible) {
    const inherited = encoder.options.find(option => option.value === 'none');
    options = [...compatible];
    const listed = new Set(compatible.map(option => option.value));
    for (const option of allEncoders) {
      if (listed.has(option.value)) continue;
      listed.add(option.value);
      options.push({
        ...option,
        disabled: true,
        description: $t('%{encoder} (incompatible with %{format})', {
          encoder: option.description,
          format: formatLabel,
        }),
      });
    }
    if (inherited) {
      options.unshift({ ...inherited, disabled: !supports(compatible, streamEncoder) });
    }
  } else {
    options = encoder.options;
  }

  let warning: string | undefined;
  let placeholder: string | undefined;
  if (!compatible) {
    warning = $t(
      'Could not check which encoders work with this recording format. Reopen Output settings to try again.',
    );
  } else if (!valid) {
    const name = allEncoders.find(option => option.value === selected)?.description ?? selected;
    const labels = { encoder: name, format: formatLabel };
    placeholder = useStream ? $t('Select recording format') : $t('Select recording encoder');
    warning = useStream
      ? $t('Choose a recording format that works with your stream encoder (%{encoder}).', labels)
      : $t(
          'The selected encoder (%{encoder}) is unavailable for %{format}. Choose another encoder or change the recording format.',
          labels,
        );
    if (!useStream && missing && missing.id === selected) {
      const message = $t(
        'Your saved recording encoder (%{encoder}) is unavailable on this computer.',
        { encoder: missing.name },
      );
      const advice =
        missingEncoderAdvice(missing.reason, supports(compatible, 'obs_x264')) ??
        $t('Choose an available recording encoder below.');
      warning = `${message} ${advice}`;
    }
  }

  return {
    valid,
    parameters: recording.map(p => {
      if (p === field) return { ...field, options, placeholder, warning };
      if (useStream && p.name === 'RecEncoder') return { ...p, visible: false };
      return p;
    }),
  };
}
