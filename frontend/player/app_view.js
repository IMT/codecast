
import React from 'react';
import classnames from 'classnames';

/*
      screen      main-view-no-subtitles
  xs      …800    best effort
  sm   800…1024   794  (subtitles always hidden)
  md  1024…1200   940 if no subtitles, 794 if subtitles
  lg  1200…      1140 if no subtitles, 940 if subtitles
*/

class PlayerApp extends React.PureComponent {
  render () {
    const {preventInput, containerWidth, viewportTooSmall, PlayerControls, MainView, MainViewPanes, SubtitlesBand} = this.props;
    return (
      <div>
        <div id='main' style={{width: `${containerWidth}px`}} className={classnames([viewportTooSmall && 'viewportTooSmall'])}>
          <PlayerControls/>
          <div id='mainView-container'>
            <MainView preventInput={preventInput}/>
            <MainViewPanes/>
          </div>
          {SubtitlesBand && <SubtitlesBand/>}
        </div>
      </div>
    );
  }
}

function PlayerAppSelector (state, props) {
  const {PlayerControls, MainView, MainViewPanes, getPlayerState, getSubtitlesBandVisible, SubtitlesBand} = state.get('scope');
  const viewportTooSmall = state.get('viewportTooSmall');
  const containerWidth = state.get('containerWidth');
  const player = getPlayerState(state);
  const status = player.get('status');
  /* preventInput is set during playback (and seeking-whe-paused) to prevent the
     user from messing up the editors, and to disable automatic scrolling of the
     editor triggered by some actions (specifically, highlighting).
  */
  const preventInput = !/ready|paused/.test(status) ||
    ('paused' === status && player.has('seekTo'));
  return {
    preventInput, viewportTooSmall, containerWidth,
    PlayerControls, MainView, MainViewPanes,
    SubtitlesBand: getSubtitlesBandVisible(state) && SubtitlesBand,
  };
}

export default function (bundle) {
  bundle.defineView('PlayerApp', PlayerAppSelector, PlayerApp);
};
