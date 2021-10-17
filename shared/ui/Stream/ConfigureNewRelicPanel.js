import React, { Component } from "react";
import { injectIntl } from "react-intl";
import { connect } from "react-redux";
import { closePanel } from "./actions";
import CancelButton from "./CancelButton";
import { PROVIDER_MAPPINGS } from "./CrossPostIssueControls/types";
import { ConfigureNewRelic } from "./ConfigureNewRelic";

export class ConfigureNewRelicPanel extends Component {
	render() {
		const { providerId } = this.props;
		const { name } = this.props.providers[providerId] || {};
		const providerName = PROVIDER_MAPPINGS[name] ? PROVIDER_MAPPINGS[name].displayName : "";
		return (
			<div className="panel configure-provider-panel">
				<ConfigureNewRelic
					headerChildren={
						<div className="panel-header">
							<CancelButton onClick={this.props.closePanel} />
							<span className="panel-title">Connect to {providerName}</span>
						</div>
					}
					providerId={providerId}
					onClose={this.props.closePanel}
					onSubmited={this.props.closePanel}
					originLocation={this.props.originLocation}
				/>
			</div>
		);
	}
}

const mapStateToProps = ({ providers }) => {
	return { providers };
};

export default connect(mapStateToProps, { closePanel })(injectIntl(ConfigureNewRelicPanel));
