import { PrepareFunc } from 'util/QueueRunner';
import { Speech } from '../nicolive-comment-synthesizer';

export interface ISpeechSynthesizer {
  speakText(
    speech: Speech,
    onstart: () => void,
    onend: () => void,
    onPhoneme?: (phoneme: string) => void,
  ): PrepareFunc;
}
