import React from 'react';
import {
  AbsoluteFill,
  Audio,
  OffthreadVideo,
  Sequence,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';

type Props = {vertical?: boolean; audioSrc?: string};
type Screen = 'dashboard' | 'history' | 'highlight' | 'compare' | 'bright' | 'approval';
type SceneName = 'opening' | 'human' | 'trend' | 'highlight' | 'compare' | 'bright' | 'approval' | 'boundaries' | 'end';

const C = {
  amber: '#f3b938', amberSoft: '#f8d984', ivory: '#f7f2e9', cream: '#fffaf1', ink: '#171512',
  panel: '#24211d', muted: '#b9b0a4', teal: '#58b8a6', tealDark: '#28695e', red: '#ef806d',
};
const display = 'Georgia, Times New Roman, serif';
const sans = 'Inter, ui-sans-serif, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif';

const MASTER_SCENES: Array<{name: SceneName; from: number; duration: number}> = [
  {name: 'opening', from: 0, duration: 9}, {name: 'human', from: 9, duration: 7.5},
  {name: 'trend', from: 16.5, duration: 13.1}, {name: 'highlight', from: 29.6, duration: 10.9},
  {name: 'compare', from: 40.5, duration: 13.1}, {name: 'bright', from: 53.6, duration: 6.3},
  {name: 'approval', from: 59.9, duration: 13.4}, {name: 'boundaries', from: 73.3, duration: 17.3},
  {name: 'end', from: 90.6, duration: 9.4},
];
const VERTICAL_SCENES: Array<{name: SceneName; from: number; duration: number}> = [
  {name: 'opening', from: 0, duration: 6}, {name: 'human', from: 6, duration: 6},
  {name: 'trend', from: 12, duration: 10}, {name: 'highlight', from: 22, duration: 7},
  {name: 'compare', from: 29, duration: 9}, {name: 'bright', from: 38, duration: 7},
  {name: 'approval', from: 45, duration: 9}, {name: 'boundaries', from: 54, duration: 4},
  {name: 'end', from: 58, duration: 2},
];
const clamp = {extrapolateLeft: 'clamp' as const, extrapolateRight: 'clamp' as const};

function enter(frame: number, fps: number, delay = 0): number {
  return spring({frame: frame - delay, fps, config: {damping: 18, stiffness: 120, mass: 0.8}});
}
function fade(frame: number, duration: number, first = false, last = false): number {
  const fadeIn = first ? 1 : interpolate(frame, [0, 12], [0, 1], clamp);
  const fadeOut = last ? 1 : interpolate(frame, [duration - 12, duration], [1, 0], clamp);
  return Math.min(fadeIn, fadeOut);
}

const Pill = ({children, tone = 'neutral'}: {children: React.ReactNode; tone?: 'neutral' | 'amber' | 'teal' | 'red'}) => {
  const palette = tone === 'amber'
    ? {background: 'rgba(243,185,56,.13)', borderColor: 'rgba(243,185,56,.38)', color: C.amberSoft}
    : tone === 'teal'
      ? {background: 'rgba(88,184,166,.12)', borderColor: 'rgba(88,184,166,.32)', color: '#9ce5d8'}
      : tone === 'red'
        ? {background: 'rgba(239,128,109,.10)', borderColor: 'rgba(239,128,109,.30)', color: '#ffc0b4'}
        : {background: 'rgba(255,255,255,.05)', borderColor: 'rgba(255,255,255,.12)', color: C.muted};
  return <span style={{display: 'inline-flex', alignItems: 'center', border: '1px solid', borderRadius: 999, padding: '8px 13px', font: `700 13px ${sans}`, ...palette}}>{children}</span>;
};

const PhoneShell = ({screen, vertical = false}: {screen: Screen; vertical?: boolean}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const isLight = screen === 'bright';
  const approvalDelay = fps * (vertical ? 4.5 : 7.5);
  const approvalComplete = screen === 'approval' && frame > approvalDelay;
  const w = vertical ? 520 : 490;
  const h = vertical ? 1010 : 820;
  const appBg = isLight ? C.ivory : '#191713';
  const cardBg = isLight ? C.cream : '#25221e';
  const cardLine = isLight ? '#dfd4c3' : '#3d3831';
  const text = isLight ? C.ink : C.ivory;
  const muted = isLight ? '#746c61' : '#aaa094';
  const approved = enter(frame, fps, approvalDelay);

  const Chart = ({highlight = false}: {highlight?: boolean}) => {
    const points = [57, 48, 66, 62, 80, 59, 72, 88, 70, 83, 76];
    const line = points.map((value, index) => `${24 + index * 39},${230 - value * 1.85}`).join(' ');
    const pulse = 1 + Math.sin(frame / 5) * .08;
    return <div style={{position: 'relative', height: 246, borderRadius: 20, border: `1px solid ${cardLine}`, background: cardBg, padding: '18px 18px 12px'}}>
      {[0, 1, 2, 3].map((row) => <div key={row} style={{position: 'absolute', left: 18, right: 18, top: 45 + row * 45, height: 1, background: isLight ? '#e7ddcf' : '#37332d'}} />)}
      <svg viewBox="0 0 440 240" style={{position: 'absolute', inset: 8, width: 'calc(100% - 16px)', height: 'calc(100% - 16px)', overflow: 'visible'}}>
        <polyline points={line} fill="none" stroke={C.teal} strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
        {points.map((value, index) => {
          const selected = highlight && index === 7;
          return <circle key={index} cx={24 + index * 39} cy={230 - value * 1.85} r={selected ? 10 * pulse : 5} fill={selected ? C.amber : C.teal} stroke={selected ? '#fff1bb' : 'none'} strokeWidth={selected ? 4 : 0} />;
        })}
      </svg>
      <div style={{position: 'absolute', bottom: 12, left: 18, right: 18, display: 'flex', justifyContent: 'space-between', font: `600 11px ${sans}`, color: muted}}><span>Jun</span><span>Jul</span><span>Aug</span><span>Sep</span></div>
    </div>;
  };

  return <div style={{width: w, height: h, flexShrink: 0, borderRadius: 62, background: '#090908', border: '9px solid #39352f', boxShadow: '0 35px 90px rgba(0,0,0,.50), 0 0 70px rgba(243,185,56,.13)', padding: 10, position: 'relative'}}>
    <div style={{height: '100%', borderRadius: 46, overflow: 'hidden', background: appBg, color: text, position: 'relative'}}>
      <div style={{height: 44, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 22px 0', font: `700 12px ${sans}`}}>
        <span>9:41</span><div style={{position: 'absolute', left: '50%', top: 10, transform: 'translateX(-50%)', width: 102, height: 27, borderRadius: 20, background: '#050505'}} /><span style={{letterSpacing: 2}}>● ● ▰</span>
      </div>
      <div style={{padding: vertical ? '25px 27px' : '23px 25px'}}>
        <div style={{display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 22}}><div style={{font: `600 25px ${display}`}}>Fasting Tracker</div><div style={{width: 10, height: 10, borderRadius: '50%', background: C.amber, boxShadow: `0 0 20px ${C.amber}`}} /></div>

        {screen === 'dashboard' && <>
          <div style={{border: `1px solid ${cardLine}`, background: cardBg, borderRadius: 24, padding: '22px 20px', textAlign: 'center'}}><div style={{font: `700 10px ${sans}`, letterSpacing: 1.7, color: muted}}>ACTIVE FAST</div><div style={{font: `400 68px ${display}`, color: C.amber, lineHeight: 1, margin: '15px 0 12px'}}>16:36</div><div style={{font: `600 13px ${sans}`, color: muted}}>18-hour target · ends 1:41 PM</div><div style={{height: 9, borderRadius: 999, background: '#36322c', marginTop: 21}}><div style={{height: '100%', width: '92%', borderRadius: 999, background: C.amber}} /></div></div>
          <div style={{display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 9, marginTop: 13}}>{[['11','FASTS'],['16h 24m','AVERAGE'],['20h 13m','LONGEST']].map(([value, label]) => <div key={label} style={{border: `1px solid ${cardLine}`, background: cardBg, borderRadius: 16, padding: '14px 8px', textAlign: 'center'}}><div style={{font: `600 18px ${display}`}}>{value}</div><div style={{font: `700 8px ${sans}`, letterSpacing: 1.1, color: muted, marginTop: 7}}>{label}</div></div>)}</div>
          <div style={{marginTop: 14, border: `1px solid ${cardLine}`, background: cardBg, borderRadius: 18, padding: 16}}><div style={{font: `700 11px ${sans}`, color: muted, letterSpacing: 1.2}}>RECENT</div><div style={{display: 'flex', justifyContent: 'space-between', marginTop: 11, font: `600 15px ${sans}`}}><span>Sep 2</span><span style={{color: C.teal}}>16h 36m ✓</span></div></div>
        </>}

        {(screen === 'history' || screen === 'highlight') && <>
          <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'end', marginBottom: 16}}><div><div style={{font: `400 31px ${display}`}}>Duration trend</div><div style={{font: `500 13px ${sans}`, color: muted, marginTop: 4}}>Last 90 days · 11 completed fasts</div></div><span style={{font: `800 9px ${sans}`, letterSpacing: 1.1, color: C.teal}}>AGENT-CREATED VIEW</span></div>
          <Chart highlight={screen === 'highlight'} />
          <div style={{marginTop: 14, border: `1px solid ${screen === 'highlight' ? C.amber : cardLine}`, background: cardBg, borderRadius: 18, padding: 16}}><div style={{font: `700 11px ${sans}`, color: screen === 'highlight' ? C.amber : muted}}>{screen === 'highlight' ? 'SOURCE RECORD HIGHLIGHTED' : 'WHAT THE DATA SHOWS'}</div><div style={{font: `500 14px ${sans}`, lineHeight: 1.45, marginTop: 8}}>Longest fast: <strong>20h 13m</strong><br/>11 of 11 completed fasts met their target.</div>{screen === 'highlight' && <div style={{marginTop: 10, font: `600 12px ${sans}`, color: muted}}>Aug 16 · 12:40 AM to 8:53 PM</div>}</div>
        </>}

        {screen === 'compare' && <>
          <div style={{font: `400 32px ${display}`}}>Compare a new fast</div><div style={{font: `500 13px ${sans}`, color: muted, margin: '6px 0 20px'}}>If it starts today at 8:00 PM</div>
          <div style={{display: 'grid', gap: 11}}>{[['16 hours','12:00 PM','Common target'],['18 hours','2:00 PM','Longer target'],['20 hours','4:00 PM','Stretch target']].map(([label, end, context], index) => <div key={label} style={{border: `1px solid ${index === 1 ? C.amber : cardLine}`, background: cardBg, borderRadius: 18, padding: '15px 17px', display: 'flex', alignItems: 'center', justifyContent: 'space-between'}}><div><div style={{font: `600 21px ${display}`}}>{label}</div><div style={{font: `600 11px ${sans}`, color: muted, marginTop: 4}}>{context}</div></div><div style={{textAlign: 'right'}}><div style={{font: `700 10px ${sans}`, color: muted}}>ENDS TOMORROW</div><div style={{font: `700 16px ${sans}`, marginTop: 5}}>{end}</div></div></div>)}</div>
          <div style={{marginTop: 17, padding: 15, borderRadius: 16, background: 'rgba(88,184,166,.12)', border: '1px solid rgba(88,184,166,.3)', color: '#a1e4d7', font: `700 13px ${sans}`}}>Preview only. Nothing has been started.</div>
        </>}

        {screen === 'bright' && <>
          <div style={{font: `400 32px ${display}`}}>Your pattern</div><div style={{font: `500 13px ${sans}`, color: muted, margin: '6px 0 19px'}}>Clear history in a lighter workspace.</div>
          <div style={{display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 10}}>{[['2','FASTS'],['16h 24m','AVERAGE'],['16h 36m','LONGEST'],['16h 12m','SHORTEST']].map(([value,label]) => <div key={label} style={{background: '#fffdf8', border: '1px solid #e4d8c7', borderRadius: 18, padding: 17}}><div style={{font: `400 25px ${display}`, color: C.ink}}>{value}</div><div style={{font: `800 9px ${sans}`, letterSpacing: 1.1, color: '#7d7468', marginTop: 7}}>{label}</div></div>)}</div>
          <div style={{marginTop: 16, background: '#fffdf8', border: '1px solid #e4d8c7', borderRadius: 18, padding: 18}}><div style={{font: `700 11px ${sans}`, color: C.tealDark}}>BRIGHT LIGHT IS ON</div><div style={{font: `400 23px ${display}`, marginTop: 9}}>A reversible view change.</div><p style={{font: `500 13px/1.5 ${sans}`, color: '#746c61', margin: '8px 0 0'}}>The app changes its own interface. Your fasting records stay untouched.</p></div>
        </>}

        {screen === 'approval' && !approvalComplete && <>
          <div style={{font: `400 32px ${display}`}}>Ready to start?</div><div style={{font: `500 13px ${sans}`, color: muted, margin: '6px 0 19px'}}>Review the exact change before it is saved.</div>
          <div style={{background: cardBg, border: `2px solid ${C.amber}`, borderRadius: 22, padding: 21}}><div style={{font: `800 10px ${sans}`, color: C.amber, letterSpacing: 1.3}}>YOUR APPROVAL IS REQUIRED</div><div style={{font: `400 34px ${display}`, margin: '17px 0 10px'}}>Start an 18-hour fast</div><div style={{font: `500 13px/1.5 ${sans}`, color: muted}}>Starts now<br/>Ends tomorrow at 1:41 PM<br/>No completed records will change.</div><div style={{height: 50, marginTop: 20, borderRadius: 14, background: C.amber, color: C.ink, display: 'flex', alignItems: 'center', justifyContent: 'center', font: `800 13px ${sans}`}}>Approve and start</div></div>
          <div style={{font: `600 12px ${sans}`, color: muted, marginTop: 15, textAlign: 'center'}}>The agent is waiting. Nothing has changed yet.</div>
        </>}

        {screen === 'approval' && approvalComplete && <div style={{opacity: approved, transform: `translateY(${(1-approved)*18}px)`}}>
          <div style={{font: `400 32px ${display}`}}>Fast started</div><div style={{font: `500 13px ${sans}`, color: muted, margin: '6px 0 19px'}}>Approved by you, recorded by the app.</div>
          <div style={{background: cardBg, border: `1px solid ${cardLine}`, borderRadius: 22, padding: 24, textAlign: 'center'}}><div style={{font: `700 10px ${sans}`, color: muted, letterSpacing: 1.3}}>TIME REMAINING</div><div style={{font: `400 62px ${display}`, color: C.amber, margin: '16px 0 9px'}}>17:59:58</div><div style={{font: `600 13px ${sans}`, color: muted}}>18-hour target</div></div>
          <div style={{marginTop: 16, border: '1px solid rgba(88,184,166,.34)', background: 'rgba(88,184,166,.12)', borderRadius: 18, padding: 16}}><div style={{font: `800 10px ${sans}`, color: '#9ce5d8', letterSpacing: 1.2}}>AUDIT RECEIPT</div><div style={{font: `600 13px ${sans}`, marginTop: 8}}>fast.start · succeeded</div><div style={{font: `500 11px ${sans}`, color: muted, marginTop: 5}}>Saved once with a retry-safe request ID.</div></div>
        </div>}
      </div>
    </div>
  </div>;
};

type AgentPanelProps = {prompt: string; tool: string; result: string; waiting?: boolean; approved?: boolean; vertical?: boolean};
const AgentPanel = ({prompt, tool, result, waiting = false, approved = false, vertical = false}: AgentPanelProps) => {
  const frame = useCurrentFrame(); const {fps} = useVideoConfig();
  const messageIn = enter(frame, fps, 6); const toolIn = enter(frame, fps, vertical ? 22 : 32); const resultIn = enter(frame, fps, vertical ? 40 : 58);
  return <div style={{width: vertical ? 800 : 590, borderRadius: 30, background: C.panel, color: C.ivory, border: '1px solid #4b443a', boxShadow: '0 28px 80px rgba(0,0,0,.30)', overflow: 'hidden', fontFamily: sans}}>
    <div style={{height: 72, borderBottom: '1px solid #423c34', display: 'flex', alignItems: 'center', gap: 12, padding: '0 24px'}}><div style={{width: 12, height: 12, borderRadius: '50%', background: C.teal, boxShadow: `0 0 18px ${C.teal}`}}/><strong style={{fontSize: 17}}>Agent chat</strong><span style={{marginLeft: 'auto', color: C.muted, fontSize: 12}}>Connected to this tab</span></div>
    <div style={{padding: 24, display: 'grid', gap: 16}}><div style={{justifySelf: 'end', maxWidth: '88%', background: '#464038', borderRadius: '20px 20px 5px 20px', padding: '16px 18px', fontSize: vertical ? 20 : 17, lineHeight: 1.4, opacity: messageIn, transform: `translateY(${(1-messageIn)*18}px)`}}>{prompt}</div>
      <div style={{display: 'flex', alignItems: 'center', gap: 11, opacity: toolIn, transform: `translateY(${(1-toolIn)*14}px)`}}><span style={{width: 28, height: 28, borderRadius: 9, background: 'rgba(243,185,56,.14)', display: 'grid', placeItems: 'center', color: C.amber}}>⌁</span><div><div style={{fontSize: 11, color: C.muted, letterSpacing: 1.2, fontWeight: 800}}>WEBMCP TOOL</div><code style={{display: 'block', color: C.amberSoft, fontSize: vertical ? 18 : 15, marginTop: 4}}>{tool}()</code></div>{waiting && <Pill tone="amber">Waiting for you</Pill>}</div>
      <div style={{maxWidth: '92%', background: C.ivory, color: C.ink, borderRadius: '20px 20px 20px 5px', padding: '17px 18px', fontSize: vertical ? 19 : 16, lineHeight: 1.45, opacity: resultIn, transform: `translateY(${(1-resultIn)*16}px)`}}><strong>Fasting Tracker</strong><div style={{marginTop: 7, color: '#625a50'}}>{approved ? 'Approved. ' : ''}{result}</div></div>
    </div>
  </div>;
};

const Caption = ({children, vertical}: {children: React.ReactNode; vertical: boolean}) => <div style={{position: 'absolute', left: vertical ? 70 : 350, right: vertical ? 70 : 350, bottom: vertical ? 42 : 25, minHeight: vertical ? 76 : 54, display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: vertical ? '16px 24px' : '12px 22px', borderRadius: 18, background: 'rgba(13,12,10,.88)', border: '1px solid rgba(255,255,255,.12)', color: C.ivory, font: `600 ${vertical ? 22 : 17}px/1.35 ${sans}`, boxShadow: '0 12px 40px rgba(0,0,0,.24)'}}>{children}</div>;
const SceneShell = ({children, duration, vertical, first = false, last = false, light = false}: {children: React.ReactNode; duration: number; vertical: boolean; first?: boolean; last?: boolean; light?: boolean}) => { const frame = useCurrentFrame(); return <AbsoluteFill style={{background: light ? C.ivory : C.ink, color: light ? C.ink : C.ivory, fontFamily: sans, opacity: fade(frame, duration, first, last), overflow: 'hidden'}}>{children}</AbsoluteFill>; };
const Split = ({phone, children, vertical}: {phone: Screen; children: React.ReactNode; vertical: boolean}) => <div style={{position: 'absolute', inset: 0, padding: vertical ? '115px 55px 145px' : '105px 82px 90px', display: 'flex', flexDirection: vertical ? 'column' : 'row', alignItems: 'center', justifyContent: 'center', gap: vertical ? 55 : 95}}><PhoneShell screen={phone} vertical={vertical}/><div style={{width: vertical ? '100%' : 650, display: 'flex', justifyContent: 'center'}}>{children}</div></div>;
const Narrative = ({title, body, vertical}: {title: string; body: string; vertical: boolean}) => { const frame = useCurrentFrame(); const {fps} = useVideoConfig(); const a = enter(frame, fps, 6); return <div style={{maxWidth: vertical ? 850 : 660, opacity: a, transform: `translateY(${(1-a)*24}px)`}}><h1 style={{font: `400 ${vertical ? 56 : 64}px/1.03 ${display}`, letterSpacing: -1.5, margin: 0}}>{title}</h1><p style={{font: `500 ${vertical ? 23 : 25}px/1.5 ${sans}`, color: C.muted, margin: '25px 0 0'}}>{body}</p><div style={{height: 4, width: 82, borderRadius: 8, background: C.amber, marginTop: 30}} /></div>; };

function Opening({duration, vertical}: {duration: number; vertical: boolean}) {
  const frame = useCurrentFrame(); const {fps} = useVideoConfig();
  const plateOpacity = interpolate(frame, [0, fps * 1.5, fps * 7, fps * 11], [.35, .55, .28, 0], clamp);
  return <SceneShell duration={duration} vertical={vertical} first><AbsoluteFill style={{opacity: plateOpacity}}><OffthreadVideo src={staticFile('minimax-golden-halo.mp4')} muted style={{width: '100%', height: '100%', objectFit: 'cover'}} /></AbsoluteFill><AbsoluteFill style={{background: 'radial-gradient(circle at 26% 50%, rgba(243,185,56,.10), transparent 42%), linear-gradient(90deg, rgba(23,21,18,.18), rgba(23,21,18,.88) 64%)'}}/><Split phone="dashboard" vertical={vertical}><Narrative vertical={vertical} title="A fasting app for people. Safe controls for agents." body="A real iPhone-first tracker, with agent access designed by the application itself." /></Split><Caption vertical={vertical}>This is Fasting Tracker, a real iPhone-first web app.</Caption></SceneShell>;
}
function Human({duration, vertical}: {duration: number; vertical: boolean}) {
  return <SceneShell duration={duration} vertical={vertical}><Split phone="dashboard" vertical={vertical}><Narrative vertical={vertical} title="The human interface is the product." body="Start a fast, check the clock, and understand your own history. WebMCP adds a second, bounded control surface." /></Split><Caption vertical={vertical}>Use the app normally. Agent access is an additional control surface.</Caption></SceneShell>;
}

const AGENT_COPY: Record<'trend'|'highlight'|'compare'|'bright', AgentPanelProps> = {
  trend: {prompt: 'Show my last 90 days as a duration trend.', tool: 'create_history_view', result: 'I built a 90-day duration view from the tracker’s 11 synthetic records.'},
  highlight: {prompt: 'Highlight the records behind my longest fast.', tool: 'highlight_history_records', result: 'The 20h 13m result is highlighted, with the source record visible below it.'},
  compare: {prompt: 'Compare 16, 18, and 20-hour options. Do not start anything.', tool: 'preview_fasting_decision', result: 'Here are the three end times. This is a preview, so no fast was started.'},
  bright: {prompt: 'Switch this tab to Bright light.', tool: 'set_visual_mode', result: 'Bright light is on. This reversible change only affects the current interface.'},
};
function AgentScene({kind, duration, vertical}: {kind: 'trend'|'highlight'|'compare'|'bright'; duration: number; vertical: boolean}) {
  const screens = {trend: 'history', highlight: 'highlight', compare: 'compare', bright: 'bright'} as const;
  const captions = {trend: 'The agent calls a named capability. The tracker renders its own chart.', highlight: 'The explanation stays tied to the record behind it.', compare: 'Preview means preview. No hidden mutation.', bright: 'Reversible interface changes stay owned by the app.'};
  return <SceneShell duration={duration} vertical={vertical} light={kind === 'bright'}><Split phone={screens[kind]} vertical={vertical}><AgentPanel {...AGENT_COPY[kind]} vertical={vertical}/></Split><Caption vertical={vertical}>{captions[kind]}</Caption></SceneShell>;
}
function Approval({duration, vertical}: {duration: number; vertical: boolean}) {
  const frame = useCurrentFrame(); const {fps} = useVideoConfig(); const complete = frame > fps * (vertical ? 4.5 : 7.5);
  return <SceneShell duration={duration} vertical={vertical}><Split phone="approval" vertical={vertical}><AgentPanel vertical={vertical} prompt="Start an 18-hour fast." tool="start_fast" waiting={!complete} approved={complete} result={complete ? 'The fast was saved once, and an audit receipt was returned.' : 'The requested change is ready. The app is waiting for your approval.'}/></Split><Caption vertical={vertical}>{complete ? 'Only after approval does the tracker save the fast and return a receipt.' : 'This changes data, so the flow stops for human approval.'}</Caption></SceneShell>;
}
function Boundaries({duration, vertical}: {duration: number; vertical: boolean}) {
  const frame = useCurrentFrame(); const {fps} = useVideoConfig(); const a = enter(frame, fps, 5);
  const allowed = ['Read current fast', 'Build history charts', 'Highlight evidence', 'Compare options', 'Request confirmed changes'];
  const blocked = ['Sign in', 'Delete history', 'Rewrite completed records', 'Reach admin controls', 'Give medical advice'];
  return <SceneShell duration={duration} vertical={vertical}><div style={{position: 'absolute', inset: 0, padding: vertical ? '150px 65px 145px' : '120px 130px 100px', display: 'grid', gridTemplateColumns: vertical ? '1fr' : '0.9fr 1.1fr', gap: vertical ? 45 : 110, alignItems: 'center', opacity: a, transform: `translateY(${(1-a)*24}px)`}}><div><div style={{font: `400 ${vertical ? 58 : 72}px/1.03 ${display}`}}>17 named capabilities. Clear boundaries.</div><p style={{font: `500 ${vertical ? 23 : 25}px/1.5 ${sans}`, color: C.muted}}>The agent uses tools the application chose to expose. It never receives general account access.</p></div><div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18}}><div style={{background: C.panel, border: '1px solid rgba(88,184,166,.35)', borderRadius: 24, padding: 22}}><div style={{color: '#9ce5d8', font: `800 12px ${sans}`, letterSpacing: 1.5, marginBottom: 15}}>CAN DO</div>{allowed.map((item) => <div key={item} style={{padding: '10px 0', borderTop: '1px solid #3d3932', font: `600 ${vertical ? 16 : 15}px ${sans}`}}>✓ &nbsp;{item}</div>)}</div><div style={{background: C.panel, border: '1px solid rgba(239,128,109,.30)', borderRadius: 24, padding: 22}}><div style={{color: '#ffc0b4', font: `800 12px ${sans}`, letterSpacing: 1.5, marginBottom: 15}}>CANNOT DO</div>{blocked.map((item) => <div key={item} style={{padding: '10px 0', borderTop: '1px solid #3d3932', color: C.muted, font: `600 ${vertical ? 16 : 15}px ${sans}`}}>× &nbsp;{item}</div>)}</div></div></div><Caption vertical={vertical}>Named capabilities replace broad access and brittle screen guessing.</Caption></SceneShell>;
}
function End({duration, vertical}: {duration: number; vertical: boolean}) {
  const frame = useCurrentFrame(); const {fps} = useVideoConfig(); const a = enter(frame, fps, 0);
  return <SceneShell duration={duration} vertical={vertical} last light><div style={{position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', padding: vertical ? 70 : 120, opacity: a}}><div style={{maxWidth: 1320, textAlign: 'center'}}><div style={{width: 68, height: 68, borderRadius: '50%', background: C.ink, margin: '0 auto 32px', display: 'grid', placeItems: 'center'}}><span style={{width: 18, height: 18, borderRadius: '50%', background: C.amber, boxShadow: `0 0 24px ${C.amber}`}}/></div><div style={{font: `400 ${vertical ? 62 : 82}px/1.02 ${display}`, letterSpacing: -2}}>One real app for people.<br/>Safe, explicit capabilities for agents.</div><div style={{display: 'flex', flexDirection: vertical ? 'column' : 'row', alignItems: 'center', justifyContent: 'center', gap: 14, marginTop: 34}}><Pill tone="amber">Live demo</Pill><span style={{font: `700 ${vertical ? 18 : 21}px ${sans}`}}>fasting-tracker-webmcp-demo.harnden-trey.workers.dev</span></div><div style={{font: `600 ${vertical ? 16 : 18}px ${sans}`, color: '#6f675c', marginTop: 18}}>github.com/0xTrey/fasting-tracker-webmcp · MIT licensed</div></div></div></SceneShell>;
}
function sceneComponent(name: SceneName, duration: number, vertical: boolean): React.ReactNode {
  if (name === 'opening') return <Opening duration={duration} vertical={vertical}/>;
  if (name === 'human') return <Human duration={duration} vertical={vertical}/>;
  if (name === 'trend' || name === 'highlight' || name === 'compare' || name === 'bright') return <AgentScene kind={name} duration={duration} vertical={vertical}/>;
  if (name === 'approval') return <Approval duration={duration} vertical={vertical}/>;
  if (name === 'boundaries') return <Boundaries duration={duration} vertical={vertical}/>;
  return <End duration={duration} vertical={vertical}/>;
}

export const FastingTrackerVideo: React.FC<Props> = ({vertical = false, audioSrc}) => {
  const frame = useCurrentFrame(); const {fps, durationInFrames} = useVideoConfig(); const scenes = vertical ? VERTICAL_SCENES : MASTER_SCENES; const progress = interpolate(frame, [0, durationInFrames], [0, 100], clamp); const seconds = frame / fps; const lightMark = scenes.some((scene) => (scene.name === 'bright' || scene.name === 'end') && seconds >= scene.from && seconds < scene.from + scene.duration);
  return <AbsoluteFill style={{background: C.ink}}>{scenes.map((scene) => { const from = Math.round(scene.from * fps); const duration = Math.round(scene.duration * fps); return <Sequence key={scene.name} from={from} durationInFrames={duration} premountFor={fps}>{sceneComponent(scene.name, duration, vertical)}</Sequence>; })}{!vertical && audioSrc ? <Audio src={staticFile(audioSrc)} /> : null}<div style={{position: 'absolute', top: vertical ? 42 : 38, left: vertical ? 46 : 60, display: 'flex', alignItems: 'center', gap: 11, color: lightMark ? C.ink : C.ivory, font: `600 ${vertical ? 18 : 17}px ${display}`, textShadow: lightMark ? 'none' : '0 2px 14px rgba(0,0,0,.6)'}}><span style={{width: 12, height: 12, borderRadius: '50%', background: C.amber, boxShadow: `0 0 18px ${C.amber}`}}/>Fasting Tracker</div><div style={{position: 'absolute', left: 0, right: 0, bottom: 0, height: 6, background: 'rgba(255,255,255,.08)'}}><div style={{height: '100%', width: `${progress}%`, background: C.amber}}/></div></AbsoluteFill>;
};
