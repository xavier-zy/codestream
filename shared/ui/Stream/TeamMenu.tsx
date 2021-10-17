import React from "react";
import { useDispatch, useSelector } from "react-redux";
import { WebviewPanels, WebviewModals } from "../ipc/webview.protocol.common";
import Icon from "./Icon";
import { openModal, openPanel } from "./actions";
import Menu from "./Menu";
import {
	setCurrentReview,
	clearCurrentPullRequest,
	setCreatePullRequest
} from "../store/context/actions";
import { CodeStreamState } from "../store";
import { keyFilter } from "../utils";
import { confirmPopup } from "./Confirm";
import { isFeatureEnabled } from "../store/apiVersioning/reducer";

interface TeamMenuProps {
	menuTarget: any;
	closeMenu: any;
}

const EMPTY_HASH = {};

export function TeamMenu(props: TeamMenuProps) {
	const dispatch = useDispatch();
	const derivedState = useSelector((state: CodeStreamState) => {
		const team = state.teams[state.context.currentTeamId];

		const adminIds = team.adminIds || [];
		const isCurrentUserAdmin = adminIds.includes(state.session.userId!);
		const blameMap = team.settings ? team.settings.blameMap : EMPTY_HASH;
		const mappedBlame = keyFilter(blameMap || EMPTY_HASH);
		return {
			isCurrentUserAdmin,
			mappedBlame,
			autoJoinSupported: isFeatureEnabled(state, "autoJoin")
		};
	});

	const go = modal => {
		dispatch(setCreatePullRequest());
		dispatch(clearCurrentPullRequest());
		dispatch(setCurrentReview());
		dispatch(openModal(modal));
	};

	const goPanel = panel => {
		dispatch(setCreatePullRequest());
		dispatch(clearCurrentPullRequest());
		dispatch(setCurrentReview());
		dispatch(openPanel(panel));
	};

	const deleteTeam = () => {
		confirmPopup({
			title: "Delete Team",
			message:
				"Team deletion is handled by customer service. Please send an email to support@codestream.com.",
			centered: false,
			buttons: [{ label: "OK", className: "control-button" }]
		});
	};

	const menuItems = [
		{
			icon: <Icon name="team" />,
			label: "My Organization",
			subtextWide: "View your teammates",
			action: () => go(WebviewModals.Team),
			key: "team"
		},
		{ label: "-" },
		{
			icon: <Icon name="add-user" />,
			label: "Invite Teammates",
			subtextWide: "Share CodeStream with your team",
			action: () => go(WebviewModals.Invite),
			key: "invite"
		}
	] as any;
	menuItems.push(
		{ label: "-" },
		{
			icon: <Icon name="arrow-right" />,
			label: "Blame Map",
			subtextWide: "Reassign code responsibility",
			action: () => go(WebviewModals.BlameMap),
			key: "blame"
		}
	);

	if (derivedState.isCurrentUserAdmin) {
		menuItems.push(
			{ label: "-" },
			{
				icon: <Icon name="pencil" />,
				label: "Change Organization Name",
				key: "change-team-name",
				action: () => go(WebviewModals.ChangeCompanyName)
			},
			{ label: "-" },
			{
				icon: <Icon name="gear" />,
				label: "Onboarding Settings...",
				key: "onboarding-settings",
				action: () => go(WebviewModals.TeamSetup),
				disabled: !derivedState.autoJoinSupported
			},
			{
				icon: <Icon name="gear" />,
				label: "Feedback Request Settings...",
				key: "review-settings",
				action: () => go(WebviewModals.ReviewSettings)
			},
			{ label: "-" },
			{
				icon: <Icon name="download" />,
				label: "Export Data",
				key: "export",
				action: () => goPanel(WebviewPanels.Export)
			},
			{ label: "-" },
			{
				icon: <Icon name="no-entry" />,
				label: "Delete Organization",
				key: "delete",
				action: () => deleteTeam()
			}
		);
	}

	return (
		<Menu
			items={menuItems}
			target={props.menuTarget}
			action={props.closeMenu}
			align="bottomRight"
		/>
	);
}
