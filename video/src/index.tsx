import {Composition, Folder, registerRoot} from 'remotion';
import {FastingTrackerVideo} from './Composition';

export const RemotionRoot = () => (
  <>
    <Folder name="Fasting-Tracker">
      <Composition id="FastingTrackerMaster" component={FastingTrackerVideo} durationInFrames={3000} fps={30} width={1920} height={1080} defaultProps={{vertical: false}} />
      <Composition id="FastingTrackerNarrated" component={FastingTrackerVideo} durationInFrames={3000} fps={30} width={1920} height={1080} defaultProps={{vertical: false, audioSrc: 'narration.mp3'}} />
      <Composition id="FastingTrackerVertical" component={FastingTrackerVideo} durationInFrames={1800} fps={30} width={1080} height={1920} defaultProps={{vertical: true}} />
    </Folder>
  </>
);

registerRoot(RemotionRoot);
