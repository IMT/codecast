
import Immutable from 'immutable';
import React from 'react';
import classnames from 'classnames';
import {call, put, select, take, takeEvery, takeLatest} from 'redux-saga/effects';

import {Button} from '../ui';
import {getJson, postJson} from '../common/utils';

export default function (bundle, deps) {

  bundle.addReducer('init', state =>
    state.set('editor', Immutable.Map()));

  bundle.defineAction('editorPrepare', 'Editor.Prepare');
  bundle.addReducer('editorPrepare', editorPrepareReducer);
  bundle.addSaga(editorSaga);

  bundle.defineAction('editorConfigured', 'Editor.Configured');
  bundle.addReducer('editorConfigured', editorConfiguredReducer);

  bundle.defineAction('editorDataUrlChanged', 'Editor.DataUrl.Changed');
  bundle.addReducer('editorDataUrlChanged', editorDataUrlChangedReducer);

  bundle.defineAction('editorLoad', 'Editor.Load');
  bundle.addReducer('editorLoad', editorLoadReducer);
  bundle.defineAction('editorLoaded', 'Editor.Loaded');
  bundle.addReducer('editorLoaded', editorLoadedReducer);

  bundle.defineAction('editorUnload', 'Editor.Unload');
  bundle.addReducer('editorUnload', editorUnloadReducer);

  bundle.defineAction('editorBeginEdit', 'Editor.BeginEdit');
  bundle.defineAction('editorReturn', 'Editor.Return'); /* done editing, return to setup screen */

  bundle.defineAction('editorSave', 'Editor.Save');
  bundle.defineAction('editorSaveFailed', 'Editor.Save.Failed');
  bundle.defineAction('editorSaveSucceeded', 'Editor.Save.Succeeded');
  bundle.addReducer('editorSave', editorSaveReducer);
  bundle.addReducer('editorSaveFailed', editorSaveFailedReducer);
  bundle.addReducer('editorSaveSucceeded', editorSaveSucceededReducer);

  bundle.defineView('EditorApp', EditorAppSelector, EditorApp);
  bundle.defineView('EditorGlobalControls', EditorGlobalControlsSelector, EditorGlobalControls);

  bundle.defineView('LoadScreen', LoadScreenSelector, LoadScreen);
  bundle.defineView('SetupScreen', SetupScreenSelector, SetupScreen);
  bundle.defineView('EditScreen', EditScreenSelector, EditScreen);

};

function editorPrepareReducer (state, {payload: {baseDataUrl}}) {
  return state.set('editor', Immutable.Map({dataUrl: baseDataUrl, notify: {}}));
}

function editorDataUrlChangedReducer (state, {payload: {dataUrl}}) {
  return state.setIn(['editor', 'dataUrl'], dataUrl);
}

function editorConfiguredReducer (state, {payload: {bucketUrl}}) {
  return state.setIn(['editor', 'bucketUrl'], bucketUrl);
}

function* editorSaga () {
  const {editorPrepare, loginFeedback, editorLoad, editorUnload, editorBeginEdit, editorSave, editorReturn} = yield select(state => state.get('scope'));
  yield takeEvery(editorPrepare, editorPrepareSaga);
  yield takeEvery(loginFeedback, loginFeedbackSaga);
  yield takeLatest(editorLoad, editorLoadSaga);
  yield takeLatest(editorUnload, editorUnloadSaga);
  yield takeLatest(editorBeginEdit, editorBeginEditSaga);
  yield takeLatest(editorSave, editorSaveSaga);
  yield takeLatest(editorReturn, editorReturnSaga);
}

function* editorPrepareSaga (_action) {
  const {subtitlesModeSet, switchToScreen} = yield select(state => state.get('scope'));
  yield put({type: subtitlesModeSet, payload: {mode: 'editor'}});
  yield put({type: switchToScreen, payload: {screen: 'load'}});
}

function* loginFeedbackSaga (_action) {
  const {editorConfigured, switchToScreen} = yield select(state => state.get('scope'));
  const baseUrl = yield select(state => state.get('baseUrl'));
  const {bucketUrl} = yield call(getJson, `${baseUrl}/editor.json`);
  yield put({type: editorConfigured, payload: {bucketUrl}});
}

function editorLoadReducer (state, {payload: {data}}) {
  return state.update('editor', editor =>
    editor.set('loading', true));
}

function* editorLoadSaga ({payload: {dataUrl}}) {
  const {playerPrepare, playerReady, editorLoaded, switchToScreen} = yield select(state => state.get('scope'));
  const audioUrl = `${dataUrl}.mp3`;
  const eventsUrl = `${dataUrl}.json`;
  yield put({type: playerPrepare, baseDataUrl: dataUrl, audioUrl, eventsUrl});
  const {data} = yield take(playerReady);
  yield put({type: editorLoaded, payload: {base: dataUrl, data}});
  yield put({type: switchToScreen, payload: {screen: 'setup'}});
}

function editorLoadedReducer (state, {payload: {base, data}}) {
  return state.update('editor', editor => editor
    .set('base', base)
    .set('data', data)
    .set('loading', false));
}

function editorUnloadReducer (state, _action) {
  return state.update('editor', editor => editor.delete('data'));
}

function* editorUnloadSaga (_action) {
  const {playerClear, switchToScreen} = yield select(state => state.get('scope'));
  yield put({type: playerClear});
  yield put({type: switchToScreen, payload: {screen: 'load'}});
}

function* editorBeginEditSaga (_action) {
  const {subtitlesReload, switchToScreen} = yield select(state => state.get('scope'));
  yield put({type: subtitlesReload});
  yield put({type: switchToScreen, payload: {screen: 'edit'}});
}

function* editorReturnSaga (_action) {
  const {switchToScreen, subtitlesSave} = yield select(state => state.get('scope'));
  yield put({type: subtitlesSave});
  yield put({type: switchToScreen, payload: {screen: 'setup'}});
}

function* editorSaveSaga (_action) {
  const {baseUrl, base, data, editorSaveFailed, editorSaveSucceeded} = yield select(function (state) {
    const {editorSaveFailed, editorSaveSucceeded} = state.get('scope');
    const baseUrl = state.get('baseUrl');
    const editor = state.get('editor');
    const base = editor.get('base');
    const data = editor.get('data');
    const subtitles = Object.values(state.get('subtitles').availableOptions);
    return {
      baseUrl, base, data: {...data, subtitles},
      editorSaveFailed, editorSaveSucceeded
    };
  });
  try {
    const result = yield call(postJson, `${baseUrl}/save`, {base, data});
    // TODO: pass new base as payload, when copying
    const timestamp = new Date();
    yield put({type: editorSaveSucceeded, payload: {timestamp}});
  } catch (ex) {
    console.log('error', ex);
    yield put({type: editorSaveFailed, payload: {error: ex.toString()}});
  }
}

function editorSaveReducer (state, action) {
  return state.setIn(['editor', 'notify'], {key: 'pending'});
}

function editorSaveFailedReducer (state, action) {
  return state.setIn(['editor', 'notify'], {key: 'failure', message: error.toString()});
}

function editorSaveSucceededReducer (state, {payload: {error}}) {
  return state.setIn(['editor', 'notify'], {key: 'success'});
}

function EditorAppSelector (state, props) {
  const scope = state.get('scope');
  const {EditorGlobalControls} = scope;
  const user = state.get('user');
  const screen = state.get('screen');
  let activity;
  let screenProp;
  if (!user) {
    activity = 'login';
    screenProp = 'LoginScreen';
  } else if (screen === 'load') {
    activity = 'load';
    screenProp = 'LoadScreen';
  } else if (screen === 'setup') {
    activity = 'setup';
    screenProp = 'SetupScreen';
  } else if (screen === 'edit') {
    activity = 'edit';
    screenProp = 'EditScreen';
  } else if (screen === 'save') {
    activity = 'save';
    screenProp = 'SaveScreen';
  }
  return {Screen: screenProp && scope[screenProp], activity, EditorGlobalControls};
}

class EditorApp extends React.PureComponent {
  render () {
    const {EditorGlobalControls, Screen, activity} = this.props;
    return (
      <div>
        <EditorGlobalControls activity={activity}/>
        <Screen/>
      </div>
    );
  }
}

function EditorGlobalControlsSelector (state) {
  const {LogoutButton, editorUnload, editorReturn} = state.get('scope');
  return {LogoutButton, editorUnload, editorReturn};
}

class EditorGlobalControls extends React.PureComponent {
  render () {
    const {LogoutButton, activity} = this.props;
    const {collapsed} = this.state;
    return (
      <div id='global-controls' className={classnames({collapsed})}>
        <span className='collapse-toggle' onClick={this._toggleCollapsed}>
          <i className={`fa fa-chevron-${collapsed ? 'down' : 'up'}`}/>
        </span>
        <div className='btn-group'>
          {activity === 'edit' && <Button onClick={this._return}><i className='fa fa-reply'/></Button>}
          {activity === 'setup' && <Button onClick={this._unload}><i className='fa fa-reply'/></Button>}
          {/load|setup/.test(activity) && <LogoutButton/>}
        </div>
      </div>
    );
  }
  state = {collapsed: false};
  _toggleCollapsed = () => {
    const {collapsed} = this.state;
    this.setState({collapsed: !collapsed});
  };
  _unload = () => {
    this.props.dispatch({type: this.props.editorUnload});
  };
  _return = () => {
    this.props.dispatch({type: this.props.editorReturn});
  };
}

function LoadScreenSelector (state, props) {
  const {editorDataUrlChanged, editorLoad} = state.get('scope');
  const result = {editorDataUrlChanged, editorLoad};
  const editor = state.get('editor');
  result.dataUrl = editor.get('dataUrl');
  result.bucketUrl = editor.get('bucketUrl');
  result.loading = editor.get('loading');
  return result;
}

class LoadScreen extends React.PureComponent {
  render () {
    const {dataUrl, bucketUrl, loading} = this.props;
    const isUrlOk = bucketUrl && dataUrl.startsWith(bucketUrl);
    return (
      <div className='container' style={{marginTop: '2em'}}>
        <p>{"Enter the base URL of an existing Codecast:"}</p>
        <div className='input-group'>
          <input type='text' className='form-control' onChange={this._urlChanged} value={dataUrl||''} />
          <div className='input-group-btn'>
            <Button bsStyle='primary' disabled={!isUrlOk || loading} onClick={this._loadClicked}>
              {"Load"}
              {loading && <span>{" "}<i className='fa fa-hourglass-o'/></span>}
            </Button>
          </div>
        </div>
        {bucketUrl && !isUrlOk &&
          <p className='error'>
            {"The URL must start with "}{bucketUrl||''}
          </p>}
        {bucketUrl && isUrlOk &&
          <p>
            <i className='fa fa-check' style={{color: 'green'}}/>
            {" The URL is valid."}
          </p>}
      </div>
    );
  }
  _urlChanged = (event) => {
    const dataUrl = event.target.value;
    this.props.dispatch({type: this.props.editorDataUrlChanged, payload: {dataUrl}});
  };
  _loadClicked = () => {
    this.props.dispatch({type: this.props.editorLoad, payload: {dataUrl: this.props.dataUrl}});
  };
}

function SetupScreenSelector (state, props) {
  const {editorBeginEdit, editorSave, SubtitlesEditor} = state.get('scope');
  const editor = state.get('editor');
  const dataUrl = editor.get('dataUrl');
  const {version} = editor.get('data');
  const notify = editor.get('notify');
  return {editorBeginEdit, editorSave, SubtitlesEditor, dataUrl, version, notify};
}

class SetupScreen extends React.PureComponent {
  render () {
    const {dataUrl, version, SubtitlesEditor, notify} = this.props;
    return (
      <div className='container'>
        <h2>{"Codecast"}</h2>
        <p>{"URL "}{dataUrl}</p>
        <p>{"Version "}{version}</p>

        <h2>{"Subtitles"}</h2>
        <SubtitlesEditor />

        <div style={{marginTop: '2em', textAlign: 'center', backgroundColor: '#efefef', padding: '10px'}}>
          <span style={{marginRight: '10px'}}>
            <Button onClick={this._beginEdit}>
              <i className='fa fa-edit'/>{" Edit"}
            </Button>
          </span>
          <Button onClick={this._save}>
            <i className='fa fa-cloud-upload'/>
            {" Save "}
            {notify.key === 'pending' && <i className='fa fa-spinner fa-spin'/>}
            {notify.key === 'success' && <i className='fa fa-check' style={{color: 'green'}}/>}
            {notify.key === 'failure' && <i className='fa fa-exclamation-triangle' style={{color: 'red'}}/>}
          </Button>
        </div>
      </div>
    );
  }
  _beginEdit = (event) => {
    this.props.dispatch({type: this.props.editorBeginEdit});
  };
  _save = (event) => {
    this.props.dispatch({type: this.props.editorSave});
  };
}

function EditScreenSelector (state, props) {
  const {PlayerControls, MainView, MainViewPanes, SubtitlesBand, getPlayerState} = state.get('scope');
  const playerStatus = getPlayerState(state).get('status');
  const preventInput = !/ready|paused/.test(playerStatus);
  const viewportTooSmall = state.get('viewportTooSmall');
  const containerWidth = state.get('containerWidth');
  const showSubtitlesBand = state.get('showSubtitlesBand');
  return {
    preventInput, viewportTooSmall, containerWidth,
    PlayerControls, MainView, MainViewPanes,
    showSubtitlesBand, SubtitlesBand
  };
}

class EditScreen extends React.PureComponent {
  render () {
    const {preventInput, containerWidth, viewportTooSmall, PlayerControls, MainView, MainViewPanes, showSubtitlesBand, SubtitlesBand} = this.props;
    return (
      <div id='main' style={{width: `${containerWidth}px`}} className={classnames([viewportTooSmall && 'viewportTooSmall'])}>
        <PlayerControls/>
        <div id='mainView-container'>
          <MainView preventInput={preventInput}/>
          <MainViewPanes/>
        </div>
        {showSubtitlesBand && <SubtitlesBand/>}
      </div>
    );
  }
}
