import styles from './TitleGeneration.m.less';
import React, { useEffect, useState } from 'react';
import { Services } from 'components-react/service-provider';
import { IAiClip } from 'services/highlighter/models/highlighter.models';
import { EHighlighterInputTypes } from 'services/highlighter/models/ai-highlighter.models';
import { generateTitles } from 'services/highlighter/ai-highlighter-utils';
import { Button, Tooltip, Dropdown, MenuProps, Input } from 'antd';
import TextArea from 'antd/lib/input/TextArea';
import { $t } from 'services/i18n';

interface TitleGenerationProps {
  streamId: string;
}

interface TitleGenerationData {
  game: string;
  streamTitle: string;
  inputTypes: string[];
  duration: number;
}
export default function TitleGeneration({ props }: { props: TitleGenerationProps }) {
  const { streamId } = props;
  const { HighlighterService, UsageStatisticsService, UserService } = Services;
  const [isGeneratingTitles, setIsGeneratingTitles] = useState<boolean>(false);
  const [prompt, setPrompt] = useState<string>('');
  const [generatedTitles, setGeneratedTitles] = useState<string[]>([]);
  const videoData = useEffect(() => {
    const game = HighlighterService.getGameByStreamId(streamId);
    const currentClips = HighlighterService.getClips(HighlighterService.views.clips, streamId);
    const streamTitle = HighlighterService.views.highlightedStreamsDictionary[streamId]?.title;
    const duration = Math.round(
      currentClips.reduce((acc, clip) => acc + ((clip as IAiClip).duration ?? 0), 0),
    );
    const inputTypes = currentClips
      .map(clip => (clip as IAiClip).aiInfo.inputs.map(input => input.type))
      .flat();
    const prompt = generatePrompt({
      game,
      streamTitle,
      inputTypes,
      duration,
    });
    setPrompt(prompt);
  }, [streamId]);

  const handleGenerateTitles = async () => {
    setIsGeneratingTitles(true);
    try {
      const currentClips = HighlighterService.getClips(HighlighterService.views.clips, streamId);
      const firstFile = currentClips[0].path;
      const inputTypes = currentClips
        .map(clip => {
          if (clip.source === 'AiClip') {
            return (clip as IAiClip).aiInfo.inputs.map(input => input.type);
          }
          return [];
        })
        .flat();

      const userId = UserService.getLocalUserId();
      const game = HighlighterService.getGameByStreamId(streamId);
      const titles = await generateTitles(firstFile, userId, inputTypes, game, prompt); // This function should be imported or defined
      setGeneratedTitles(titles);
    } catch (error: unknown) {
      console.error('Error generating titles:', error);
      setGeneratedTitles([]);
    } finally {
      setIsGeneratingTitles(false);
    }
  };

  return (
    <div className={styles.wrapper}>
      <h1>Title Generation</h1>
      <div style={{ marginBottom: '16px' }}>
        <span style={{ display: 'block', marginBottom: '8px', color: '#fff' }}>Prompt:</span>
        <TextArea
          rows={6}
          showCount
          placeholder={$t('Enter your prompt here...')}
          onChange={e => setPrompt(e.target.value)}
          value={prompt}
        />

        <Button
          onClick={handleGenerateTitles}
          disabled={isGeneratingTitles || !prompt.trim()}
          type="primary"
          style={{ marginTop: '8px' }}
        >
          {isGeneratingTitles ? 'Generating...' : 'Generate Titles'}
        </Button>

        {generatedTitles.length > 0 && (
          <div>
            <h2 style={{ color: '#fff', marginTop: '16px' }}>Generated Titles</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {generatedTitles.map((title, index) => (
                <div
                  key={index}
                  style={{
                    padding: '12px',
                    backgroundColor: '#1a2832',
                    color: '#fff',
                    border: '1px solid #3a4a5c',
                    borderRadius: '6px',
                  }}
                >
                  {title}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function getPromptFromInput(inputCounts: {
  inputType: EHighlighterInputTypes;
  count: number;
}): string {
  //
  switch (inputCounts.inputType) {
    case EHighlighterInputTypes.KILL:
      return `I made ${inputCounts.count} ${inputCounts.count !== 1 ? 'kills' : 'kill'}`;
    case EHighlighterInputTypes.DEATH:
      return `I died ${inputCounts.count} ${inputCounts.count !== 1 ? 'times' : 'time'}`;
    case EHighlighterInputTypes.VICTORY:
      return `I got ${inputCounts.count} ${inputCounts.count !== 1 ? 'victories' : 'victory'}`;
    case EHighlighterInputTypes.DEFEAT:
      return `I got ${inputCounts.count} ${inputCounts.count !== 1 ? 'defeats' : 'defeat'}`;
    default:
      return '';
  }
}
function generatePrompt(videoData: TitleGenerationData): string {
  const inputCounts = videoData.inputTypes.reduce((acc, inputType) => {
    if (
      inputType === EHighlighterInputTypes.KNOCKOUT ||
      inputType === EHighlighterInputTypes.KNOCKED ||
      inputType === EHighlighterInputTypes.ELIMINATION
    ) {
      inputType = EHighlighterInputTypes.KILL; // Normalize knockout and knocked to kill
    }
    acc[inputType] = (acc[inputType] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  console.log('inputCounts', inputCounts);
  const inputTypePrompts = Object.entries(inputCounts).map(([inputType, count]) => {
    const prompt = getPromptFromInput({
      inputType: inputType as EHighlighterInputTypes,
      count,
    });
    return prompt;
  });
  console.log('inputTypePrompts', inputTypePrompts);

  let base = `I recorded a ${videoData.game} gaming video I want to publish. It\'s ${
    videoData.duration / 60
  } minutes long. `;
  base += inputTypePrompts.join(',  ') + '. ';
  base += `Can you suggest me 5 video titles I could use for YouTube? My stream title was "${videoData.streamTitle}". `;
  base +=
    "You don't need to include the game name or video duration in the title, but you can if you want. ";
  base += 'Make sure the titles are catchy and engaging, and avoid using clickbait.';
  return base;
}
