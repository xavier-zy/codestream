import React, { Component } from "react";
import { injectIntl } from "react-intl";
import { connect } from "react-redux";
import { closePanel } from "./actions";
import { configureProvider, connectProvider } from "../store/providers/actions";
import CancelButton from "./CancelButton";
import Button from "./Button";
import { PROVIDER_MAPPINGS } from "./CrossPostIssueControls/types";

export class ConfigureAzureDevOpsPanel extends Component {
	initialState = {
		organization: "",
		organizationTouched: false,
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
		const { organization } = this.state;
		this.props.configureProvider(providerId, { organization });
		this.props.connectProvider(providerId, this.props.originLocation);
		this.props.closePanel();
	};

	renderError = () => {};

	onBlurOrganization = () => {
		this.setState({ organizationTouched: true });
	};

	renderOrganizationHelp = () => {
		const { organization, organizationTouched, formTouched } = this.state;
		if (organizationTouched || formTouched)
			if (organization.length === 0) return <small className="error-message">Required</small>;
	};

	tabIndex = () => {};

	isFormInvalid = () => {
		return this.state.organization.length === 0;
	};

	render() {
		const { providerId } = this.props;
		const inactive = false;
		const { name } = this.props.providers[providerId] || {};
		const providerName = PROVIDER_MAPPINGS[name] ? PROVIDER_MAPPINGS[name].displayName : "";
		const placeholder = "myorg";
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
						<p>
							Name of your Azure DevOps Services organization. For example, if you access Azure
							DevOps Services at https://dev.azure.com/
							<strong>myorg</strong>, you would supply "<strong>myorg</strong>" here
						</p>
						{this.renderError()}
						<div id="controls">
							<div id="configure-azuredevops-controls" className="control-group">
								<label>Your {providerName} Organization</label>
								<input
									className="input-text control"
									type="text"
									name="organization"
									tabIndex={this.tabIndex()}
									value={this.state.organization}
									onChange={e => this.setState({ organization: e.target.value })}
									onBlur={this.onBlurOrganization}
									required={this.state.organizationTouched || this.state.formTouched}
									placeholder={placeholder}
									id="configure-provider-initial-input"
								/>
								{this.renderOrganizationHelp()}
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
	injectIntl(ConfigureAzureDevOpsPanel)
);
