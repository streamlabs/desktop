import React, { useEffect, useState } from 'react';
import cx from 'classnames';
import SvgContainer from 'components-react/shared/SvgContainer';
import { $t } from 'services/i18n';

const loadingStrings = () => [
  'Sources are elements you add to your stream like video & audio feeds, text, images, alerts, and widgets.',
  'Download the Streamlabs Controller app from your mobile device to control your stream from your phone.',
  'Widgets are dynamic, interactive elements you can add to you stream.',
  'Our App Store contains over 50 apps to take your stream to the next level.',
  'With multistream, you can stream to Twitch, YouTube, Kick, TikTok, X (Twitter), Patreon, and more at the same time.',
  'You can customize the design of your tip page from the Streamlabs Dashboard online.',
  'You can edit the sounds of your stream alerts from the Alert Box properties menu.',
  'Access thousands professionally-made themes from the left sidebar.',
  'All of our themes are created by professional (human) designers.',
  'Brand your stream your way with overlays, alert box and widget themes.',
  'Explore a mix of thousands of free and Ultra-exclusive themes from 100% human professional artists from the Library',
  'Thousands of overlays and widget themes designed to match your style — easy to install in seconds from the Library.',
  'You use the Alert Box widget to keep viewers engaged with custom alerts for Twitch, YouTube, Kick, and more.',
  'Join our community of 200k+ creators at Discord.gg/stream.',
  'Sources are what we call media like text, images, video & audio feeds.',
  'Undo works in the Editor. Just hit Ctrl + Z!',
  'The sources listed at the top of your sources panel will be layered the highest in your editor.',
  'Studio Mode is a powerful way to curate a professional-quality stream.',
  'Cloudbot is a chatbot that can help you moderate your stream.',
  'Cloudbot is our free, cloud-based chatbot that simplifies chat moderation and engages your audience.',
  'Keep your channel safe from chat abuse with filter options including caps, emotes, paragraphs, links, symbols, words, and more with Cloudbot.',
  'Set Hotkeys from your settings to control your stream with your keyboard.',
  'You can set Hotkeys to hide & show sources, save replays, skip alerts & more.',
  'With Game Overlay you can view chat messages while gaming without switching screens.',
  'The editor is fully customizable. Try repositioning things from the Layout Editor.',
  'Studio Mode allows you to customize a scene while you are live before your viewers can see it.',
  'With the Highlighter, you can save clips during your stream and publish them to YouTube.',
  "You can login to Streamlabs from any device, and we'll load your scenes from the cloud.",
  'As your scenes get more complex, try managing your sources in folders.',
  'Group multiple sources together in Folders to keep your scenes organized.',
  'To fine-tune the positioning of a source, select it from the editor then press any arrow key.',
  'Right-click a source, then choose "Properties" to view its advanced settings.',
  'You can position your chat panel to be either on the left or right side of your screen.',
  'Right-click on your camera source to add filters to your webcam.',
  'You can add and edit stinger transitions by clicking the settings cog near your scene collections.',
  'To crop your webcam, press Alt then drag the bounding box.',
  'You can switch devices mid-stream, like from your Desktop to your phone, with Stream Shift. Enable Stream Shift in the Go Live modal.',
  'Get paid to stream with Sponsorships. Download in the App Store to get started.',
  'Display chat messages on stream with the Chat Box widget.',
  'The Intelligent Streaming Agent is your co-host, live producer and tech support built into Streamlabs Desktop. Learn more via the AI panel in the left sidebar.',
  'Add your friends or guest creators directly on your stream with Collab Cam Source.',
  "Use the Collab Cam Source to add your friend's webcam feed to your stream.",
  'You can give your Cloudbot chat bot a Custom Name',
  'With Streamlabs Ultra, you can change the name of your Cloudbot chat bot.',
  'Use a Stream Label source to highlight recent follows, subs counts, top tippers & more.',
  'Game Pulse sources can display your media when you get a Kill, Win, Death & more in over 25 supported games.',
  'Use the Game Pulse source for game-driven reactions and animations.',
  'Display an on-screen victory celebration every time you win in Fortnite with the Game Pulse widget.',
  'Set subscriber or fundraising goals using the Goal Widgets.',
  'Let tippers or chatters share YouTube videos to play on stream with the Media Share source. Comes with flexible moderation settings.',
  'Visualize support by filling a tip jar with subs, bits, tips, and more with the Tip Jar Widget.',
  'Decorate your stream with emotes used in chat with the Emote Wall Widget.',
  'Use the Tip Ticker to highlight tippers with a scrolling ticker.',
  'All Streamlabs widgets are free to use and customize. The completely optional upgrade to Ultra unlocks more widget themes available from professional artists plus matching overlays, multistreaming, and more.',
  'Add custom Victory Counters, Death Trackers, and more by visiting the Reactive collection in the Library.',
  'All Streamlabs widgets are free to use and customize. The completely optional upgrade to Ultra unlocks more widget themes available from professional artists plus matching overlays, multistreaming, and more.',
  'Fun Fact: There are over 30+ different widget types to help engage and reward your audience.',
  'Goal Widgets help encourage your viewers to reach your milestones.',
  'Highlight chat messages directly on your stream with the Chat Highlight widget.',
  'Emote Wall displays and animates emotes from your chat.',
  'Always eyeing your view count? Disable it by clicking the Eye Icon in the top-right.',
  'The Intelligent Streaming Agent can remind you to unmute your mic so your audience can hear you.',
  'Create a campaign and raise funds for charities with Streamlabs Charity.',
  'Add your VTuber avatar on your stream by using the Spout2 Source. Supports VTube Studio and VSeeFace.',
  'Go live to one Horizontal and one Vertical stream for free using Dual Output.',
  'Go live to unlimited destinations at once using Multistream - Streamlabs Ultra exclusive.',
  'Reach more viewers and grow your following faster with cloud-based multistreaming — no added strain on your connection or hardware.',
  'Did you know? New creators who multistream regularly are 2x as likely to attract 5+ concurrent viewers.',
  'Cloudbot provides entertainment and moderation features to protect your chat from trolls while also offering fun games, customizable commands, and more for your growing audience',
  'Streamlabs Desktop is built on top of the core OBS engine. Without their years of hard work Streamlabs Desktop would not have been possible.',
  'Full Patreon Integration is now live! Set your audience, add curated overlays and stream to your community!',
  'Reactive Overlays update based on your gameplay like eliminations and wins for over a dozen games including Fortnite, LoL, CS2, and more.',
  'Our Theme Library has overlays inspired by dozens of the most popular game titles.',
  'You can use Selective Recording to hide certain sources, like widgets and alerts, from your stream recording.',
  "Performance Mode hides your stream's preview to save on system resources.",
  'Virtual Webcam lets your display your scenes from Streamlabs Desktop in video conferencing software like Discord and Zoom.',
  'If you use BetterTTV or FrankerFaceZ, enable those emotes via Settings > Appearance > Chat Settings',
  'Pin the Chat to the left side of Streamlabs Desktop via Settings > Appearance > Chat Settings',
  'Never miss a chat message again by enabling Chat Notifications on the Chat Box dashboard.',
  'Save & Share the last few seconds or minutes of your stream by enabling Replay Buffer in Settings > Output > Replay Buffer',
  'Draw directly on your stream with the Annotate and Draw! app on the App Store.',
  'Add DMCA-free music to your stream with the Pretzel Rocks Music Player on the App Store.',
];

export default function Loader(p: { className?: string }) {
  const [loaderText, setLoaderText] = useState('');
  useEffect(lifecycle, []);

  function lifecycle() {
    function loopRandomText() {
      const randomIndex = Math.floor(Math.random() * loadingStrings().length);
      if (loaderText === loadingStrings()[randomIndex]) {
        loopRandomText();
      } else {
        setLoaderText(loadingStrings()[randomIndex]);
      }
    }
    loopRandomText();
    const interval = setInterval(loopRandomText, 5000);

    return function cleanup() {
      clearInterval(interval);
    };
  }

  return (
    <div className={cx('s-loader', p.className)}>
      <div className="s-loader__bg">
        <div className="s-loader__inner">
          <Spinner />
          <div className="s-loader__text">{loaderText}</div>
        </div>
      </div>
    </div>
  );
}

export function Spinner() {
  return (
    <div className="s-spinner s-spinner__overlay">
      <div className="s-bars">
        <SvgContainer src={spinnerSrc} className="s-spinner--large" />
      </div>
    </div>
  );
}

const spinnerSrc = `
<svg
version="1.1"
xmlns="http://www.w3.org/2000/svg"
xmlnsXlink="http://www.w3.org/1999/xlink"
viewBox="0 0 28 40"
>
  <path d="M0 0, l0 4, l0 -4" id="s-bar-y-path"></path>
  <rect width="4" height="40" x="0" y="0" ry="2" rx="2" class="s-spinner__bar">
    <animate
      attributeName="opacity"
      values=".24; .08; .24"
      begin="0s"
      dur="1.2s"
      repeatCount="indefinite"
    ></animate>
    <animate
      attributeName="height"
      values="40; 32; 40"
      begin="0s"
      dur="1.2s"
      repeatCount="indefinite"
    ></animate>
    <animateMotion begin="0s" dur="1.2s" repeatCount="indefinite">
      <mpath xlink:href="#s-bar-y-path"></mpath>
    </animateMotion>
  </rect>
  <rect width="4" height="40" x="12" y="0" ry="2" rx="2" class="s-spinner__bar">
    <animate attributeName="opacity" values=".24; .24; .24" begin="0s" dur="0.4s"></animate>
    <animate
      attributeName="opacity"
      values=".24; .08; .24"
      begin="0.4s"
      dur="1.2s"
      repeatCount="indefinite"
    ></animate>
    <animate
      attributeName="height"
      values="40; 32; 40"
      begin="0.4s"
      dur="1.2s"
      repeatCount="indefinite"
    ></animate>
    <animateMotion begin="0.4s" dur="1.2s" repeatCount="indefinite">
      <mpath xlink:href="#s-bar-y-path"></mpath>
    </animateMotion>
  </rect>
  <rect width="4" height="40" x="24" y="0" ry="2" rx="2" class="s-spinner__bar">
    <animate attributeName="opacity" values=".24; .24; .24" begin="0s" dur="0.8s"></animate>
    <animate
      attributeName="opacity"
      values=".24; .08; .24"
      begin="0.8s"
      dur="1.2s"
      repeatCount="indefinite"
    ></animate>
    <animate
      attributeName="height"
      values="40; 32; 40"
      begin="0.8s"
      dur="1.2s"
      repeatCount="indefinite"
    ></animate>
    <animateMotion begin="0.8s" dur="1.2s" repeatCount="indefinite">
      <mpath xlink:href="#s-bar-y-path"></mpath>
    </animateMotion>
  </rect>
</svg>`;