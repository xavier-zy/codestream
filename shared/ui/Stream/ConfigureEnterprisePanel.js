import React, { Component } from "react";
import { injectIntl } from "react-intl";
import { connect } from "react-redux";
import { closePanel } from "./actions";
import { configureProvider, connectProvider } from "../store/providers/actions";
import CancelButton from "./CancelButton";
import Button from "./Button";
import { PROVIDER_MAPPINGS } from "./CrossPostIssueControls/types";

export class ConfigureEnterprisePanel extends Component {
	initialState = {
		baseUrl: "",
		baseUrlTouched: false,
		token: "",
		tokenTouched: false,
		formTouched: false
	};

	state = this.initialState;

	componentDidMount() {
		const el = document.getElementById("configure-provider-initial-input");
		el && el.focus();
	}

	componentDidUpdate() {}

	onSubmit = async e => {
		e.preventDefault();
		if (this.isFormInvalid()) return;
		const { providerId } = this.props;
		const { baseUrl, token } = this.state;

		let url = baseUrl.trim().toLowerCase();
		url = url.match(/^http/) ? url : `https://${url}`;
		url = url.replace(/\/*$/g, "");

		// configuring is as good as connecting, since we are letting the user
		// set the access token
		this.props.configureProvider(
			providerId,
			{ baseUrl: url, token },
			true,
			this.props.originLocation
		);
		this.props.closePanel();
	};

	renderError = () => {};

	onBlurBaseUrl = () => {
		this.setState({ baseUrlTouched: true });
	};

	renderBaseUrlHelp = () => {
		const { baseUrl, baseUrlTouched, formTouched } = this.state;
		if (baseUrlTouched || formTouched) {
			if (baseUrl.length === 0) return <small className="error-message">Required</small>;
		}
	};

	onBlurToken = () => {
		this.setState({ tokenTouched: true });
	};

	renderTokenHelp = () => {
		const { token, tokenTouched, formTouched } = this.state;
		if (tokenTouched || formTouched) {
			if (token.length === 0) return <small className="error-message">Required</small>;
		}
	};

	tabIndex = () => {};

	isFormInvalid = () => {
		return this.state.baseUrl.length === 0 || this.state.token.length === 0;
	};

	render() {
		const { providerId } = this.props;
		const inactive = false;
		const { name, scopes } = this.props.providers[providerId] || {};
		const providerName = PROVIDER_MAPPINGS[name] ? PROVIDER_MAPPINGS[name].displayName : "";
		const providerShortName = PROVIDER_MAPPINGS[name]
			? PROVIDER_MAPPINGS[name].shortDisplayName || providerName
			: "";
		const placeholder = PROVIDER_MAPPINGS[name] ? PROVIDER_MAPPINGS[name].urlPlaceholder : "";
		const getUrl = PROVIDER_MAPPINGS[name] ? PROVIDER_MAPPINGS[name].getUrl : "";
		const helpUrl = PROVIDER_MAPPINGS[name] ? PROVIDER_MAPPINGS[name].helpUrl : "";
		return (
			<div className="panel configure-provider-panel">
				<form className="standard-form vscroll" onSubmit={this.onSubmit}>
					<div className="panel-header">
						<CancelButton onClick={this.props.closePanel} />
						<span className="panel-title">Configure {providerName}</span>
					</div>
					<fieldset className="form-body" disabled={inactive}>
						{getUrl && (
							<p style={{ textAlign: "center" }} className="explainer">
								Not a {providerName} customer yet? <a href={getUrl}>Get {providerName}</a>
							</p>
						)}
						{this.renderError()}
						<div id="controls">
							<div id="configure-enterprise-controls" className="control-group">
								<div>
									<label>
										<strong>{providerShortName} Base URL</strong>
									</label>
									<label>
										Please provide the Base URL used by your team to access {providerShortName}.
									</label>
									<input
										className="native-key-bindings input-text control"
										type="text"
										name="baseUrl"
										tabIndex={this.tabIndex()}
										value={this.state.baseUrl}
										onChange={e => this.setState({ baseUrl: e.target.value })}
										onBlur={this.onBlurBaseUrl}
										required={this.state.baseUrlTouched || this.state.formTouched}
										placeholder={placeholder}
										required={true}
										id="configure-provider-initial-input"
									/>
									{this.renderBaseUrlHelp()}
									<br />
									<br />
								</div>
							</div>
							<div key="token" id="configure-enterprise-controls-token" className="control-group">
								<label>
									<strong>{providerShortName} Personal Access Token</strong>
								</label>
								<label>
									Please provide a <a href={helpUrl}>personal access token</a> we can use to access
									your {providerShortName} projects and issues.
									{scopes && scopes.length && (
										<span>
											&nbsp;Your PAT should have the following scopes: <b>{scopes.join(", ")}</b>.
										</span>
									)}
								</label>
								<input
									className="input-text control"
									type="text"
									name="token"
									tabIndex={this.tabIndex()}
									value={this.state.token}
									onChange={e => this.setState({ token: e.target.value })}
									onBlur={this.onBlurToken}
									required={this.state.tokenTouched || this.state.formTouched}
									id="configure-provider-access-token"
								/>
								{this.renderTokenHelp()}
							</div>
							<div className="button-group">
								<Button
									id="save-button"
									className="control-button"
									tabIndex={this.tabIndex()}
									type="submit"
									loading={this.state.loading}
								>
									Submit
								</Button>
								<Button
									id="discard-button"
									className="control-button cancel"
									tabIndex={this.tabIndex()}
									type="button"
									onClick={this.props.closePanel}
								>
									Cancel
								</Button>
							</div>
						</div>
					</fieldset>
				</form>
			</div>
		);
	}
}

const mapStateToProps = ({ providers, ide }) => {
	return { providers, isInVscode: ide.name === "VSC" };
};

export default connect(mapStateToProps, { closePanel, configureProvider, connectProvider })(
	injectIntl(ConfigureEnterprisePanel)
);
