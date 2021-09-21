import React, { Component } from "react";
import { connect } from "react-redux";
import { configureProvider } from "../store/providers/actions";
import { setWantNewRelicOptions } from "../store/context/actions";
import { isCurrentUserInternal } from "../store/users/reducer";
import Button from "./Button";
import { PROVIDER_MAPPINGS } from "./CrossPostIssueControls/types";
import { Link } from "./Link";
import { WebviewPanels } from "../ipc/webview.protocol.common";
import { openPanel } from "./actions";
import {
	ReposScm,
	RepoProjectType,
	GetReposScmRequestType
} from "../protocols/agent/agent.protocol.scm";
import { HostApi } from "../webview-api";

class ConfigureNewRelic extends Component {
	initialState = {
		apiKey: "",
		apiKeyTouched: false,
		apiUrl: "https://api.newrelic.com",
		formTouched: false,
		showSignupUrl: true,
		disablePostConnectOnboarding: false
	};

	state = this.initialState;

	componentDidMount() {
		const el = document.getElementById("configure-provider-initial-input");
		el && el.focus();
	}

	onSubmit = async e => {
		e.preventDefault();
		if (this.isFormInvalid()) return;
		const { providerId } = this.props;
		const { apiKey, apiUrl } = this.state;
		let url = apiUrl.toLowerCase();
		if (url === this.initialState.apiUrl || url === `${this.initialState.apiUrl}/`) {
			// if it's the default, dont save it.
			url = undefined;
		}

		// configuring is as good as connecting, since we are letting the user
		// set the access token ... sending the fourth argument as true here lets the
		// configureProvider function know that they can mark New Relic as connected as soon
		// as the access token entered by the user has been saved to the server
		this.props.configureProvider(
			providerId,
			{ apiKey, apiUrl: url },
			true,
			this.props.originLocation
		);
		this.setState({ loading: true });

		// if (!this.props.disablePostConnectOnboarding) {
		// 	const reposResponse = await HostApi.instance.send(GetReposScmRequestType, {
		// 		inEditorOnly: true,
		// 		guessProjectTypes: true
		// 	});
		// 	if (!reposResponse.error) {
		// 		const knownRepo = (reposResponse.repositories || []).find(repo => {
		// 			return repo.id && repo.projectType !== RepoProjectType.Unknown;
		// 		});
		// 		if (knownRepo) {
		// 			this.props.setWantNewRelicOptions(
		// 				knownRepo.projectType,
		// 				knownRepo.id,
		// 				knownRepo.path,
		// 				knownRepo.projects
		// 			);
		// 		}
		// 	}
		// }

		setTimeout(() => {
			if (this.props.onSubmited) {
				this.props.onSubmited(e);
			}
			// if (!this.props.disablePostConnectOnboarding) {
			// 	this.props.openPanel(WebviewPanels.OnboardNewRelic);
			// }
		}, 3000);
	};

	renderError = () => {};

	onBlurApiKey = () => {
		this.setState({ apiKeyTouched: true });
	};

	renderApiKeyHelp = () => {
		const { apiKey, apiKeyTouched, formTouched } = this.state;
		if (apiKeyTouched || formTouched)
			if (apiKey.length === 0) return <small className="error-message">Required</small>;
	};

	isFormInvalid = () => {
		return this.state.apiKey.length === 0;
	};

	render() {
		const { providerId, headerChildren, showSignupUrl } = this.props;
		const { name } = this.props.providers[providerId] || {};
		const providerName = PROVIDER_MAPPINGS[name] ? PROVIDER_MAPPINGS[name].displayName : "";
		const getUrl = PROVIDER_MAPPINGS[name] ? PROVIDER_MAPPINGS[name].getUrl : "";
		return (
			<div className="standard-form vscroll">
				{headerChildren}

				<fieldset className="form-body">
					{showSignupUrl && getUrl && (
						<p style={{ textAlign: "center" }} className="explainer">
							Not a {providerName} customer yet? <a href={getUrl}>Get {providerName}</a>
						</p>
					)}
					{this.renderError()}
					<div id="controls">
						<div id="token-controls" className="control-group">
							<p>
								Please provide a{" "}
								<Link href="https://docs.newrelic.com/docs/apis/intro-apis/new-relic-api-keys/#user-api-key">
									{providerName} User API Key
								</Link>
								{"."}
							</p>
							<div className="control-group">
								<label>{providerName} User API Key</label>
								<input
									id="configure-provider-initial-input"
									className="input-text control"
									type="text"
									name="apiKey"
									tabIndex={1}
									autoFocus
									value={this.state.apiKey}
									onChange={e => this.setState({ apiKey: e.target.value })}
									onBlur={this.onBlurApiKey}
									required={this.state.apiKeyTouched || this.state.formTouched}
								/>
								{this.renderApiKeyHelp()}
							</div>
							{this.props.isInternalUser && (
								<>
									<div className="control-group">
										<label>{providerName} API Url</label>
										<input
											id="configure-provider-initial-input"
											className="input-text control"
											type="text"
											name="apiUrl"
											tabIndex={1}
											autoFocus
											value={this.state.apiUrl}
											onChange={e => this.setState({ apiUrl: e.target.value })}
										/>
									</div>
								</>
							)}
						</div>
						<div className="button-group">
							<Button
								id="save-button"
								className="control-button"
								tabIndex={2}
								type="submit"
								onClick={this.onSubmit}
								loading={this.state.loading}
							>
								Submit
							</Button>
							<Button
								id="discard-button"
								className="control-button cancel"
								tabIndex={3}
								type="button"
								onClick={e => {
									if (this.props.onClose) {
										this.props.onClose(e);
									}
								}}
							>
								Cancel
							</Button>
						</div>
					</div>
				</fieldset>
			</div>
		);
	}
}

const mapStateToProps = state => {
	const { providers } = state;
	return { providers, isInternalUser: isCurrentUserInternal(state) };
};

const component = connect(mapStateToProps, {
	isCurrentUserInternal,
	configureProvider,
	openPanel,
	setWantNewRelicOptions
})(ConfigureNewRelic);

export { component as ConfigureNewRelic };
