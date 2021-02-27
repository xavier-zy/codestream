import React from "react";
import cx from "classnames";
import { useSelector, useDispatch, shallowEqual } from "react-redux";
import { PaneHeader, PaneBody, NoContent, PaneState, PaneNodeName } from "../src/components/Pane";
import { WebviewPanels } from "../ipc/webview.protocol.common";
import {
	ReposScm,
	DidChangeDataNotificationType,
	ChangeDataType,
	DocumentData
} from "@codestream/protocols/agent";
import { CodeStreamState } from "../store";
import Icon from "./Icon";
import { setUserStatus } from "./actions";
import { HostApi } from "..";
import { OpenUrlRequestType } from "../ipc/host.protocol";
import { CSMe } from "../protocols/agent/api.protocol.models";
import { TipTitle } from "./Tooltip";
import { Row } from "./CrossPostIssueControls/IssueDropdown";
import { useDidMount } from "../utilities/hooks";
import { clearModifiedFiles, updateModifiedReposDebounced } from "../store/users/actions";
import { InlineMenu } from "../src/components/controls/InlineMenu";
import Tag from "./Tag";
import { UL } from "./TeamPanel";
import styled from "styled-components";

export const EMPTY_STATUS = {
	label: "",
	ticketId: "",
	ticketUrl: "",
	ticketProvider: "",
	invisible: false
};

interface Props {
	openRepos: ReposScm[];
	paneState: PaneState;
}

const Root = styled.div`
	height: 100%;
	.pr-row {
		padding-left: 40px;
		.selected-icon {
			left: 20px;
		}
	}
	.cs-tag {
		margin: 0;
		&.wide {
			width: 60px;
		}
	}
`;

const OutlineMenu = styled(InlineMenu)`
	margin: 0 5px;
`;

const Metric = styled.div`
	font-size: 11px;
	text-align: center;
	padding 0 5px;
`;

let hasRenderedOnce = false;
const EMPTY_HASH = {};
const EMPTY_HASH_2 = {};
const EMPTY_ARRAY = [];
export const APM = React.memo((props: Props) => {
	const dispatch = useDispatch();
	const derivedState = useSelector((state: CodeStreamState) => {
		const team = state.teams[state.context.currentTeamId];
		const currentUserId = state.session.userId!;
		const currentUser = state.users[state.session.userId!] as CSMe;
		const { modifiedRepos = EMPTY_HASH } = currentUser;

		const xraySetting = team.settings ? team.settings.xray : "";
		let status =
			currentUser.status && "label" in currentUser.status ? currentUser.status : EMPTY_STATUS;

		return {
			teamId: state.context.currentTeamId,
			status,
			repos: state.repos,
			currentUserId,
			invisible: status.invisible || false,
			xraySetting,
			hiddenPaneNodes: state.preferences.hiddenPaneNodes || EMPTY_HASH_2
		};
	}, shallowEqual);
	const { hiddenPaneNodes } = derivedState;

	const [loadingStatus, setLoadingStatus] = React.useState(false);

	const envMenuItems = [
		{
			label: "staging",
			key: "staging"
		},
		{
			label: "prod",
			key: "prod"
		},
		{
			label: "dev",
			key: "dev"
		}
	];
	const timeMenuItems = [
		{
			label: "Past 15 Minutes",
			key: "15-minutes"
		},
		{
			label: "Past 1 Hour",
			key: "hour"
		},
		{
			label: "Past 4 Hours",
			key: "4-hours"
		},
		{
			label: "Past 1 Day",
			key: "day"
		},
		{
			label: "Past 2 Days",
			key: "2-days"
		},
		{
			label: "Past 1 Week",
			key: "week"
		},
		{
			label: "Select from calendar...",
			key: "calendar"
		},
		{
			label: "More",
			key: "more"
		}
	];
	return (
		<Root>
			<PaneHeader
				title={<>APM Services</>}
				id={WebviewPanels.APM}
				subtitle={
					<>
						<OutlineMenu
							key="team-display-options"
							className="subtle no-padding"
							noFocusOnSelect
							items={envMenuItems}
						>
							Env: prod
						</OutlineMenu>
						<OutlineMenu
							key="team-display-options"
							className="subtle no-padding"
							noFocusOnSelect
							items={timeMenuItems}
						>
							Past 1 Hour
						</OutlineMenu>
					</>
				}
			>
				&nbsp;
				<Icon
					name="search"
					className={cx("clickable spinnable nogrow")}
					placement="bottomRight"
					trigger={["hover"]}
					delay={1}
					loading={loadingStatus}
					tabIndex={1}
				/>
			</PaneHeader>
			{props.paneState !== PaneState.Collapsed && (
				<PaneBody>
					<Row className={"pr-row"}>
						<div></div>
						<div></div>
						<div style={{ display: "flex" }}>
							<Metric>Pages</Metric>
							<Metric>Response</Metric>
							<Metric>Throughput</Metric>
							<Metric>Errors</Metric>
						</div>
					</Row>
					<PaneNodeName id="apm/web" title="Web" />
					{!hiddenPaneNodes["apm/web"] && (
						<>
							<Row className={"pr-row"}>
								<div>
									<Icon name="star" />
								</div>
								<div>ngenix</div>
								<div style={{ display: "flex" }}>
									<Metric>8324</Metric>
									<Metric>0.33ms</Metric>
									<Metric>16 req/s</Metric>
									<Metric>3.4%</Metric>
								</div>
							</Row>
							<Row className={"pr-row"}>
								<div>
									<Icon name="star" />
								</div>
								<div>apache</div>
								<div style={{ display: "flex" }}>
									<Metric>372</Metric>
									<Metric>0.23ms</Metric>
									<Metric>10 req/s</Metric>
									<Metric>4.2%</Metric>
								</div>
							</Row>
						</>
					)}
					<PaneNodeName id="apm/db" title="DB" />
					{!hiddenPaneNodes["apm/db"] && (
						<>
							<Row className={"pr-row"}>
								<div>
									<Icon name="star" />
								</div>
								<div>master-db</div>
								<div>
									<Tag className="wide" tag={{ label: "1 ALERT", color: "red" }} />
								</div>
							</Row>
							<Row className={"pr-row"}>
								<div>
									<Icon name="star" />
								</div>
								<div>ctx-pshard-go</div>
								<div style={{ display: "flex" }}>
									<Metric>872</Metric>
									<Metric>0.75ms</Metric>
									<Metric>19 req/s</Metric>
									<Metric>2.1%</Metric>
								</div>
							</Row>
						</>
					)}
					<PaneNodeName id="apm/cache" title="Cache" />
					{!hiddenPaneNodes["apm/cache"] && (
						<>
							<Row className={"pr-row"}>
								<div>
									<Icon name="star" />
								</div>
								<div>redis</div>
								<div></div>
							</Row>
						</>
					)}
					<PaneNodeName id="apm/function" title="Function" />
					{!hiddenPaneNodes["apm/function"] && (
						<>
							<Row className={"pr-row"}>
								<div>
									<Icon name="star" />
								</div>
								<div>aws.lambda</div>
								<div></div>
							</Row>
						</>
					)}
					<PaneNodeName id="apm/custom" title="Custom" />
					{!hiddenPaneNodes["apm/custom"] && (
						<>
							<Row className={"pr-row"}>
								<div>
									<Icon name="star" />
								</div>
								<div>metric-query</div>
								<div>
									<Tag className="wide" tag={{ label: "1 OK", color: "green" }} />
								</div>
							</Row>
							<Row className={"pr-row"}>
								<div>
									<Icon name="star" />
								</div>
								<div>h5s3</div>
								<div>
									<Tag className="wide" tag={{ label: "1 OK", color: "green" }} />
								</div>
							</Row>
							<Row className={"pr-row"}>
								<div>
									<Icon name="star" />
								</div>
								<div>synthtracer</div>
								<div></div>
							</Row>
						</>
					)}
				</PaneBody>
			)}
		</Root>
	);
});
