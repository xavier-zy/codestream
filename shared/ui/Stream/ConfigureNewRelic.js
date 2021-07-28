import React, { Component } from "react";
import { connect } from "react-redux";
import { configureProvider } from "../store/providers/actions";
import Button from "./Button";
import { PROVIDER_MAPPINGS } from "./CrossPostIssueControls/types";
import { Link } from "./Link";

class ConfigureNewRelic extends Component {
	initialState = {
		apiKey: "",
		apiKeyTouched: false,
		accountId: "",
		accountIdTouched: false,
		formTouched: false,
		showSignupUrl: true
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
		if (this.props.onSubmited) {
			this.props.onSubmited(e);
		}
	};

	renderError = () => {};

	onBlurApiKey = () => {
		this.setState({ apiKeyTouched: true });
	};

	onBlurAccountId = () => {
		this.setState({ accountIdTouched: true });
	};

	renderApiKeyHelp = () => {
		const { apiKey, apiKeyTouched, formTouched } = this.state;
		if (apiKeyTouched || formTouched)
			if (apiKey.length === 0) return <small className="error-message">Required</small>;
	};

	renderAccountIdHelp = () => {
		const { accountId, accountIdTouched, formTouched } = this.state;
		if (accountIdTouched || formTouched)
			if (accountId.length === 0) return <small className="error-message">Required</small>;
	};

	isFormInvalid = () => {
		return this.state.apiKey.length === 0 || this.state.accountId.length === 0;
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
								</Link>{" "}
								and your{" "}
								<Link href="https://docs.newrelic.com/docs/accounts/accounts-billing/account-setup/account-id/">
									Account ID
								</Link>
								.
							</p>
							<div className="control-group">
								<label>{providerName} User API Key</label>
								<input
									id="configure-provider-initial-input"
									className="input-text control"
									type="text"
									name="apiKey"
									tabIndex={0}
									value={this.state.apiKey}
									onChange={e => this.setState({ apiKey: e.target.value })}
									onBlur={this.onBlurApiKey}
									required={this.state.apiKeyTouched || this.state.formTouched}
								/>
								{this.renderApiKeyHelp()}
							</div>
							<div className="control-group">
								<label>{providerName} Account ID</label>
								<input
									className="input-text control"
									type="text"
									name="accountId"
									tabIndex={1}
									value={this.state.accountId}
									onChange={e => this.setState({ accountId: e.target.value })}
									onBlur={this.onBlurAccountId}
									required={this.state.accountIdTouched || this.state.formTouched}
								/>
								{this.renderAccountIdHelp()}
							</div>
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

const mapStateToProps = ({ providers }) => {
	// debugger;
	return { providers };
};

const component = connect(mapStateToProps, { configureProvider })(ConfigureNewRelic);

export { component as ConfigureNewRelic };
