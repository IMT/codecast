
import React from 'react';
import {Panel} from 'react-bootstrap';
import {select, call, put, race, take, takeLatest, takeEvery} from 'redux-saga/effects';

import * as C from 'persistent-c';

import Editor from '../../buffers/editor';
import {documentFromString} from '../../buffers/document';
import {DocumentModel} from '../../buffers/index';
import {TermBuffer, writeString, default as TerminalBundle} from './terminal';
import {printfBuiltin} from './printf';
import {scanfBuiltin} from './scanf';

export default function (bundle, deps) {

  bundle.include(TerminalBundle);
  bundle.use(
    'TerminalView', 'terminalInputNeeded', 'terminalInputEnter', 'terminalFocus',
    'BufferEditor',
    'getStepperDisplay', 'stepperProgress', 'stepperIdle', 'stepperInterrupt',
    'stepperRestart', 'stepperUndo', 'stepperRedo',
    'getBufferModel', 'bufferReset', 'bufferEdit', 'bufferModelEdit', 'bufferModelSelect'
  );

  bundle.addReducer('init', function (state) {
    return state.set('ioPaneMode', 'terminal');
  });

  bundle.defineView('IOPane', IOPaneSelector, class IOPane extends React.PureComponent {

    render () {
      switch (this.props.mode) {
        case 'terminal': return <deps.TerminalView {...this.props}/>;
        case 'split': return <deps.InputOutputView {...this.props}/>;
        default: return <deps.IOPaneOptions/>;
      }
    };

  });

  function IOPaneSelector (state, props) {
    const stepper = deps.getStepperDisplay(state);
    let mode = 'options';
    if (stepper) {
      if (stepper.terminal) {
        mode = 'terminal';
      } else {
        mode = 'split';
      }
    }
    return {mode};
  }

  /* Options view */

  bundle.defineAction('ioPaneModeChanged', 'IOPane.Mode.Changed');
  bundle.addReducer('ioPaneModeChanged', ioPaneModeChanged);
  function ioPaneModeChanged (state, action) {
    const {mode} = action;
    return state.set('ioPaneMode', mode);
  }

  bundle.defineSelector('getIoPaneMode', function (state) {
    return state.get('ioPaneMode');
  })

  bundle.defineView('IOPaneOptions', IOPaneOptionsSelector, class IOPaneOptions extends React.PureComponent {

    onModeChanged = (event) => {
      const mode = event.target.value;
      this.props.dispatch({type: deps.ioPaneModeChanged, mode});
    }

    modeOptions = [
      {value: 'split', label: 'IOPANE_MODE_SPLIT'},
      {value: 'terminal', label: 'IOPANE_MODE_INTERACTIVE'}
    ];

    render () {
      const {getMessage, canSelectMode, mode} = this.props;
      const headerTitle = getMessage(canSelectMode ? 'IOPANE_SELECT_TERMINAL_TITLE' : 'IOPANE_FORCED_TERMINAL_TITLE');
      return (
        <Panel>
          <Panel.Heading>{headerTitle}</Panel.Heading>
          <Panel.Body>
            <div className="row">
              <div className="col-sm-12">
                {canSelectMode && <form>
                  <label>
                    {getMessage('IOPANE_MODE')}{" "}
                    <select value={mode} onChange={this.onModeChanged}>
                      {this.modeOptions.map(p =>
                        <option key={p.value} value={p.value}>{getMessage(p.label)}</option>)}
                    </select>
                  </label>
                </form>}
                {mode === 'split' &&
                  <div>
                    <p>{getMessage('IOPANE_INITIAL_INPUT')}</p>
                    <deps.BufferEditor buffer='input' mode='text' width='100%' height='150px' />
                  </div>}
              </div>
            </div>
          </Panel.Body>
        </Panel>
      );
    };

  });

  function IOPaneOptionsSelector (state) {
    const getMessage = state.get('getMessage');
    const mode = deps.getIoPaneMode(state);
    /* Arduino mode cannot select IO mode. */
    const canSelectMode = state.get('mode') !== 'arduino';
    return {getMessage, mode, canSelectMode};
  }

  /* Split input/output view */

  bundle.defineView('InputOutputView', InputOutputViewSelector, class InputOutputView extends React.PureComponent {

    renderHeader = () => {
      return (
        <div className="row">
          <div className="col-sm-6">
            {"Entrée "}
            <i className="fa fa-lock"/>
          </div>
          <div className="col-sm-6">{"Sortie"}</div>
        </div>
      );
    };

    render () {
      const {readOnly, preventInput} = this.props;
      return (
        <Panel header={this.renderHeader()}>
          <div className="row">
            <div className="col-sm-6">
              <deps.BufferEditor buffer='input' readOnly={true} mode='text' width='100%' height='150px' />
            </div>
            <div className="col-sm-6">
              <deps.BufferEditor buffer='output' readOnly={true} shield={true} mode='text' width='100%' height='150px' />
            </div>
          </div>
        </Panel>
      );
    };

  });

  function InputOutputViewSelector (state, props) {
    const stepper = deps.getStepperDisplay(state);
    const {output} = stepper;
    return {output};
  }

  function getOutputBufferModel (state) {
    const stepper = deps.getStepperDisplay(state);
    const {output} = stepper;
    const doc = documentFromString(output);
    const endCursor = doc.endCursor();
    const model = DocumentModel({
      document: doc,
      selection: {start: endCursor, end: endCursor},
      firstVisibleRow: endCursor.row
    });
    return model;
  }

  bundle.defer(function ({recordApi, replayApi, stepperApi}) {

    recordApi.onStart(function* (init) {
      init.ioPaneMode = yield select(deps.getIoPaneMode)
    });
    replayApi.on('start', function (context, event, instant) {
      const {ioPaneMode} = event[2];
      context.state = ioPaneModeChanged(context.state, {mode: ioPaneMode});
    });

    replayApi.onReset(function* (instant) {
      const ioPaneMode = instant.state.get('ioPaneMode');
      yield put({type: deps.ioPaneModeChanged, mode: ioPaneMode});
    });

    recordApi.on(deps.ioPaneModeChanged, function* (addEvent, action) {
      yield call(addEvent, 'ioPane.mode', action.mode);
    });
    replayApi.on('ioPane.mode', function (context, event, instant) {
      const mode = event[2];
      context.state = ioPaneModeChanged(context.state, {mode});
    });

    replayApi.on(['stepper.restart', 'stepper.undo', 'stepper.redo'], function (context, event, instant) {
      if (context.state.get('ioPaneMode') === 'split') {
        /* Consider: pushing updates from the stepper state to the output buffer
           in the global state adds complexity.  Three options:
           (1) dispatch a recorded 'buffer' action when the output changes, so
               that a buffer event updates the model during replay;
           (2) get the stepper to update the buffer in the global state somehow;
           (3) make the output editor fetch its model from the stepper state.
           It is not clear which option is best.
        */
        context.state = syncOutputBuffer(context.state);
        instant.saga = syncOutputBufferSaga;
      }
    });
    function syncOutputBuffer (state) {
      const model = getOutputBufferModel(state);
      return state.setIn(['buffers', 'output', 'model'], model);
    }
    function* syncOutputBufferSaga (instant) {
      const model = instant.state.getIn(['buffers', 'output', 'model']);
      yield put({type: deps.bufferReset, buffer: 'output', model});
    }

    /* Set up the terminal or input. */
    stepperApi.onInit(function (stepperState, globalState) {
      const ioPaneMode = globalState.get('ioPaneMode');
      stepperState.inputPos = 0;
      if (ioPaneMode === 'terminal') {
        stepperState.input = "";
        stepperState.terminal = new TermBuffer({lines: 10, width: 80});
        stepperState.inputBuffer = "";
      } else {
        const inputModel = deps.getBufferModel(globalState, 'input');
        let input = inputModel.get('document').toString().trimRight();
        if (input.length !== 0) {
          input = input + "\n";
        }
        stepperState.input = input;
        stepperState.output = "";
      }
    });

    stepperApi.addBuiltin('printf', printfBuiltin);

    stepperApi.addBuiltin('putchar', function* putcharBuiltin (context, charCode) {
      const ch = String.fromCharCode(charCode.toInteger());
      yield ['write', ch];
      yield ['result', charCode];
    });

    stepperApi.addBuiltin('puts', function* putsBuiltin (context, strRef) {
      const str = C.readString(context.state.core.memory, strRef) + '\n';
      yield ['write', str];
      const result = new C.IntegralValue(C.builtinTypes['int'], 0);
      yield ['result', result];
    });

    stepperApi.addBuiltin('scanf', scanfBuiltin);

    stepperApi.onEffect('write', function* writeEffect (context, text) {
      const {state} = context;
      if (state.terminal) {
        state.terminal = writeString(state.terminal, text);
      } else {
        state.output = state.output + text;
      }
      /* TODO: update the output buffer model - this needs to alter the
               (computed) global state. */
      /* TODO: if interactive, append the new text to the output buffer */
      /* Currently this is done by reflectToOutput (interactively) and
         syncOutputBuffer/syncOutputBufferSaga (non-interactively). */
    });

    stepperApi.addBuiltin('gets', function* getsBuiltin (context, ref) {
      const line = yield ['gets'];
      let result = C.nullPointer;
      if (line !== null) {
        const value = new C.stringValue(line);
        yield ['store', ref, value];
        result = ref;
      }
      yield ['result', result];
    });

    stepperApi.addBuiltin('getchar', function* getcharBuiltin (context) {
      const line = yield ['gets'];
      let result;
      if (line === null) {
        result = -1;
      } else {
        result = line.charCodeAt(0);
        yield ['ungets', line.length - 1];
      }
      yield ['result', new C.IntegralValue(C.builtinTypes['int'], result)];
    });

    stepperApi.onEffect('gets', function* getsEffect (context) {
      let {state} = context;
      let {input, inputPos} = state;
      let nextNL = input.indexOf('\n', inputPos);
      while (-1 === nextNL) {
        if (!state.terminal || !context.interactive) {
          /* non-interactive, end of input */
          return null;
        }
        yield ['interact', function* () {
          /* Set the isWaitingOnInput flag on the state. */
          yield put({type: deps.terminalInputNeeded});
          /* Transfer focus to the terminal. */
          yield put({type: deps.terminalFocus});
          const {interrupted} = yield race({
            completed: take(deps.terminalInputEnter),
            interrupted: take(deps.stepperInterrupt)
          });
          if (interrupted) {
            throw 'interrupted';
          }
        }];
        /* Parse the next line from updated context state. */
        state = context.state;
        input = state.input;
        inputPos = state.inputPos;
        nextNL = input.indexOf('\n', inputPos);
        // throw 'retry';
      }
      const line = input.substring(inputPos, nextNL);
      state.inputPos = nextNL + 1;
      return line;
    });

    stepperApi.onEffect('ungets', function* ungetsHandler (context, count) {
      context.state.inputPos -= count;
    });

    /* Monitor actions that may need to update the output buffer.
       Currently this is done in an awkward way because stepper effects cannot
       modify the global state. So the effect modifies the 'output' property
       of the stepper state, and the saga below detect changes and pushes them
       to the global state and to the editor.
       This mechanism could by simplified by having the 'write' effect
       directly alter the global state & push the change to the editor. */
    stepperApi.addSaga(function* ioStepperSaga () {
      const ioPaneMode = yield select(state => state.get('ioPaneMode'));
      if (ioPaneMode === 'split') {
        yield call(reflectToOutput);
      }
    });
    function* reflectToOutput () {
      /* Incrementally add text produced by the stepper to the output buffer. */
      yield takeLatest([deps.stepperProgress, deps.stepperIdle], function* (action) {
        const stepperState = yield select(deps.getStepperDisplay);
        const outputModel = yield select(deps.getBufferModel, 'output');
        const oldSize = outputModel.get('document').size();
        const newSize = stepperState.output.length;
        if (oldSize !== newSize) {
          const outputDoc = outputModel.get('document');
          const endCursor = outputDoc.endCursor();
          const delta = {
            action: 'insert',
            start: endCursor,
            end: endCursor,
            lines: stepperState.output.substr(oldSize).split('\n')
          };
          /* Update the model to maintain length, new end cursor. */
          yield put({type: deps.bufferEdit, buffer: 'output', delta});
          const newEndCursor = yield select(state => deps.getBufferModel(state, 'output').get('document').endCursor());
          /* Send the delta to the editor to add the new output. */
          yield put({type: deps.bufferModelEdit, buffer: 'output', delta});
          /* Move the cursor to the end of the buffer. */
          yield put({type: deps.bufferModelSelect, buffer: 'output', selection: {start: newEndCursor, end: newEndCursor}});
        }
      });
      /* Reset the output document. */
      yield takeEvery([deps.stepperRestart, deps.stepperUndo, deps.stepperRedo], function* () {
        const model = yield select(getOutputBufferModel);
        yield put({type: deps.bufferReset, buffer: 'output', model});
      });
    }

  });

};
