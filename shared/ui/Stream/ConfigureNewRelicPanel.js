import React, { Component } from "react";
import { injectIntl } from "react-intl";
import { connect } from "react-redux";
import { closePanel } from "./actions";
import { configureProvider } from "../store/providers/actions";
import { setIssueProvider } from "../store/context/actions";
import CancelButton from "./CancelButton";
import Button from "./Button";
import { PROVIDER_MAPPINGS } from "./CrossPostIssueControls/types";

export class ConfigureNewRelicPanel extends Component {
	initialState = {
		apiKey: "",
		apiKeyTouched: false,
		accountId: "",
		accountIdTouched: false,
		formTouched: false
	};

	state = this.initialState;

	componentDidMount() {
		const el = document.getElementById("configure-provider-initial-input");
		el && el.focus();
	}

	onSubmit = e => {
		e.preventDefault();
		if (this.isFormInvalid()) return;
		const { providerId } = this.props;
		const { apiKey, accountId } = this.state;

		// configuring is as good as connecting, since we are letting the user
		// set the access token ... sending the fourth argument as true here lets the
		// configureProvider function know that they can mark New Relic as connected as soon
		// as the access token entered by the user has been saved to the server
		this.props.configureProvider(
			providerId,
			{ apiKey, accountId },
			true,
			this.props.originLocation
		);

		this.props.closePanel();
	};

	renderError = () => {};

	onBlurApikey = () => {
		this.setState({ apiKeyTouched: true });
	};

	renderApiKeyHelp = () => {
		const { apiKey, apiKeyTouched, formTouched } = this.state;
		if (apiKeyTouched || formTouched)
			if (apiKey.length === 0) return <small className="error-message">Required</small>;
	};

	onBlurAccountId = () => {
		this.setState({ accountIdTouched: true });
	};

	renderAccountIdHelp = () => {
		const { accountId, accountIdTouched, formTouched } = this.state;
		if (accountIdTouched || formTouched)
			if (accountId.length === 0) return <small className="error-message">Required</small>;
	};

	tabIndex = () => {};

	isFormInvalid = () => {
		return this.state.apiKey.length === 0 || this.state.accountId.length === 0;
	};

	render() {
		const { providerId } = this.props;
		const inactive = false;
		const { name } = this.props.providers[providerId] || {};
		const providerName = PROVIDER_MAPPINGS[name] ? PROVIDER_MAPPINGS[name].displayName : "";
		const getUrl = PROVIDER_MAPPINGS[name] ? PROVIDER_MAPPINGS[name].getUrl : "";
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
							<div id="token-controls" className="control-group">
								<label>
									<strong>{providerName} API Key</strong>
								</label>
								<br />
								<label>
									Please provide a{" "}
									<a href="https://docs.newrelic.com/docs/apis/intro-apis/new-relic-api-keys/#user-api-key">
										New Relic User API Key
									</a>{" "}
									.
								</label>
								<input
									className="input-text control"
									type="text"
									name="apiKey"
									tabIndex={this.tabIndex()}
									value={this.state.apiKey}
									onChange={e => this.setState({ apiKey: e.target.value })}
									onBlur={this.onBlurApiKey}
									required={this.state.apiKeyTouched || this.state.formTouched}
								/>
								{this.renderApiKeyHelp()}
								<br />
								<br />
								<label>
									<strong>{providerName} Account ID</strong>
								</label>
								<label>Please provide your New Relic Account ID.</label>
								<input
									className="input-text control"
									type="text"
									name="accountId"
									tabIndex={this.tabIndex()}
									value={this.state.accountId}
									onChange={e => this.setState({ accountId: e.target.value })}
									onBlur={this.onBlurAccountId}
									required={this.state.accountIdTouched || this.state.formTouched}
								/>
								{this.renderAccountIdHelp()}
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

export default connect(mapStateToProps, { closePanel, configureProvider, setIssueProvider })(
	injectIntl(ConfigureNewRelicPanel)
);
