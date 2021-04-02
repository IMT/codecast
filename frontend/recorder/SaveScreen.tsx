import React from "react";
import {Button, FormGroup, HTMLSelect, Icon, Intent, ProgressBar, Spinner} from "@blueprintjs/core";
import {ActionTypes} from "./actionTypes";
import {connect} from "react-redux";
import {AppStore} from "../store";
import {SaveStep} from "./save_screen";

interface SaveScreenStateToProps {
    getMessage: Function,
    grants: any,
    audioUrl: string,
    wavAudioUrl: string,
    eventsUrl: string,
    playerUrl: string,
    step: string,
    error: any,
    progress: any
}

function mapStateToProps(state: AppStore): SaveScreenStateToProps {
    const getMessage = state.getMessage;
    const grants = (state.user) ? state.user.grants : [];
    const {step, progress, audioUrl, wavAudioUrl, eventsUrl, playerUrl, error} = state.save;

    return {getMessage, grants, step, progress, audioUrl, wavAudioUrl, eventsUrl, playerUrl, error};
}

interface SaveScreenDispatchToProps {
    dispatch: Function
}

interface SaveScreenProps extends SaveScreenStateToProps, SaveScreenDispatchToProps {
    onCancel?: () => void,
}

export class _SaveScreen extends React.PureComponent<SaveScreenProps> {
    render() {
        const {getMessage, grants} = this.props;
        const {audioUrl, wavAudioUrl, eventsUrl, playerUrl, step, error, progress} = this.props;
        const {targetUrl} = this.state;
        const grantOptions = grants.map(({url, description}) => ({value: url, label: description}));
        let message = null, canUpload = false, busy = false;
        switch (step) {
            case SaveStep.EncodingPending:
                message = getMessage('ENCODING_IN_PROGRESS');
                busy = true;
                // PROGRESS
                break;
            case SaveStep.EncodingDone:
                message = getMessage('ENCODING_COMPLETE');
                canUpload = true;
                break;
            case SaveStep.UploadPreparing:
                message = getMessage('UPLOADING_PREPARING');
                busy = true;
                break;
            case SaveStep.UploadEventsPending:
                message = getMessage('UPLOADING_EVENTS');
                busy = true;
                break;
            case SaveStep.UploadEventsDone:
                message = getMessage('UPLOADING_EVENTS_DONE');
                break;
            case SaveStep.UploadAudioPending:
                message = getMessage('UPLOADING_AUDIO');
                busy = true;
                break;
            case SaveStep.UploadAudioDone:
                message = getMessage('UPLOADING_AUDIO_DONE');
                break;
            case SaveStep.Done:
                message = getMessage('UPLOADING_COMPLETE');
                break;
            case SaveStep.Error:
                message = (
                    <div>
                        <p>{getMessage('UPLOADING_ERROR')}</p>
                        <pre>{error.stack}</pre>
                    </div>
                );
                canUpload = true; // allow retry
                break;
        }

        /* TODO: select target among user grants */
        return (
            <form className="save-screen">
                <FormGroup labelFor='eventsUrlInput' label={"URL évènements"}>
                    <input
                        id='eventsUrlInput'
                        type='text'
                        className='bp3-input bp3-fill'
                        value={eventsUrl || ''}
                        readOnly
                    />
                </FormGroup>
                <FormGroup labelFor='audioUrlInput' label={"URL audio"}>
                    <input
                        id='audioUrlInput'
                        type='text'
                        className='bp3-input bp3-fill'
                        value={audioUrl || ''}
                        readOnly
                    />
                </FormGroup>
                {wavAudioUrl &&
                <FormGroup labelFor='wavAudioUrlInput' label={"URL audio (wav)"}>
                    <input
                        id='wavAudioUrlInput'
                        type='text'
                        className='bp3-input bp3-fill'
                        value={wavAudioUrl || ''}
                        readOnly
                    />
                </FormGroup>}
                <FormGroup label="Target">
                    <HTMLSelect options={grantOptions} value={targetUrl} onChange={this.handleTargetChange}/>
                </FormGroup>
                <div className="encoding-status">
                    {busy ?
                        <Spinner size={Spinner.SIZE_SMALL} className="mr-2" />
                    : (step === 'done' ?
                        <Icon icon='tick' intent={Intent.SUCCESS} />
                    : null)}

                    {message}
                </div>
                {typeof progress === 'number' && 'done' !== step &&
                    <ProgressBar value={progress}/>
                }
                <div className="mt-4">
                    {canUpload && <Button
                        onClick={this.onUpload}
                        intent={canUpload ? Intent.PRIMARY : Intent.NONE}
                        icon='floppy-disk'
                        className="mr-2"
                        text={getMessage('UPLOADING_BUTTON')}
                    />}
                    <Button
                        onClick={this.props.onCancel}
                        intent={'done' !== step ? Intent.DANGER : Intent.NONE}
                        icon='cross'
                        text={'done' === step ? getMessage('CLOSE') : getMessage('CANCEL')}
                    />
                </div>

                {playerUrl &&
                    <FormGroup labelFor='playerUrlInput' label={getMessage('PLAYBACK_LINK')} className="mt-4">
                        <input id='playerUrlInput' type='text' className='bp3-input bp3-fill' value={playerUrl} readOnly/>
                    </FormGroup>
                }
            </form>
        );
    }

    static getDerivedStateFromProps(props, state) {
        /* Default to first valid grant. */
        if (!state.targetUrl) {
            return {targetUrl: props.grants[0].url};
        }
        return null;
    }

    state = {targetUrl: ''};

    handleTargetChange = (event) => {
        this.setState({targetUrl: event.target.value});
    };

    onUpload = () => {
        const {targetUrl} = this.state;
        const grant = this.props.grants.find(grant => grant.url === targetUrl);

        if (grant) {
            this.props.dispatch({type: ActionTypes.SaveScreenUpload, payload: {target: grant}});
        }
    };
}

export const SaveScreen = connect(mapStateToProps)(_SaveScreen);
