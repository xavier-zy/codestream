import React from "react";
import { useDispatch, useSelector } from "react-redux";
import { WebviewPanels, WebviewModals } from "../ipc/webview.protocol.common";
import Icon from "./Icon";
import { closeModal, openModal } from "./actions";
import Menu from "./Menu";
import {
	setCurrentReview,
	clearCurrentPullRequest,
	setCreatePullRequest
} from "../store/context/actions";
import { CodeStreamState } from "../store";
import { keyFilter, mapFilter } from "../utils";
import { confirmPopup } from "./Confirm";
import { isFeatureEnabled } from "../store/apiVersioning/reducer";
import { Dialog } from "../src/components/Dialog";
import { EMAIL_REGEX, MapRow } from "./TeamPanel";
import { SelectPeople } from "../src/components/SelectPeople";
import { HostApi } from "../webview-api";
import {
	GetLatestCommittersRequestType,
	UpdateTeamSettingsRequestType
} from "@codestream/protocols/agent";
import { CSUser } from "@codestream/protocols/api";
import { HeadshotName } from "../src/components/HeadshotName";
import { InlineMenu } from "../src/components/controls/InlineMenu";
import { useDidMount } from "../utilities/hooks";
import { difference as _difference, sortBy as _sortBy } from "lodash-es";

const EMPTY_HASH = {};
const EMPTY_HASH_2 = {};

export function BlameMap() {
	const dispatch = useDispatch();
	const derivedState = useSelector((state: CodeStreamState) => {
		const team = state.teams[state.context.currentTeamId];

		const adminIds = team.adminIds || [];
		const currentUser = state.users[state.session.userId!];
		const isCurrentUserAdmin = adminIds.includes(state.session.userId!);
		const blameMap = team.settings ? team.settings.blameMap : EMPTY_HASH;
		const mappedBlame = keyFilter(blameMap);
		const dontSuggestInvitees = team.settings
			? team.settings.dontSuggestInvitees || EMPTY_HASH_2
			: EMPTY_HASH_2;
		const memberIds = _difference(team.memberIds, team.removedMemberIds || []);
		const teammates = mapFilter(memberIds, id => {
			const user = state.users[id as string];
			if (!user || !user.isRegistered || user.deactivated || user.externalUserId) return;

			if (!user.fullName) {
				let email = user.email;
				if (email) user.fullName = email.replace(/@.*/, "");
			}

			// filter out the current user, as we'll render them first
			if (id === state.session.userId) return;

			return user;
		});
		const invited = mapFilter(memberIds, id => {
			const user = state.users[id as string];
			if (!user || user.isRegistered || user.deactivated || user.externalUserId) return;
			let email = user.email;
			if (email) user.fullName = email.replace(/@.*/, "");
			return user;
		});
		return {
			isCurrentUserAdmin,
			mappedBlame,
			blameMap: blameMap || EMPTY_HASH,
			teamId: team.id,
			autoJoinSupported: isFeatureEnabled(state, "autoJoin"),
			dontSuggestInvitees,
			members: [currentUser, ..._sortBy(teammates, m => (m.fullName || "").toLowerCase())],
			invited
		};
	});

	const { mappedBlame, blameMap, isCurrentUserAdmin } = derivedState;

	const [blameMapEmail, setBlameMapEmail] = React.useState("");
	const [addingBlameMap, setAddingBlameMap] = React.useState(false);
	const [suggested, setSuggested] = React.useState<any[]>([]);

	useDidMount(() => {
		getSuggestedInvitees();
	});

	const getSuggestedInvitees = async () => {
		// for now, suggested invitees are only available to admins
		if (!isCurrentUserAdmin) return;

		const result = await HostApi.instance.send(GetLatestCommittersRequestType, {});
		const committers = result ? result.scm : undefined;
		if (!committers) return;

		const { members, invited, dontSuggestInvitees } = derivedState;
		const newSuggested: any[] = [];
		Object.keys(committers).forEach(email => {
			if (email.match(/noreply/)) return;
			// If whitespace in domain, invalid email
			if (email.match(/.*(@.* .+)/)) return;
			// If contains @ and ends in .local is invalid email
			if (email.match(/.*(@.*\.local)$/)) return;
			// Will check for spaces not surrounded by quotes. Will still
			// allow some emails through that shouldn't be through, but
			// won't block any that shouldn't be
			if (email.match(/(?<!"") (?!"")(?=((?:[^"]*"){2})*[^"]*$)/)) return;
			if (members.find(user => user.email === email)) return;
			if (invited.find(user => user.email === email)) return;
			if (dontSuggestInvitees[email.replace(/\./g, "*")]) return;
			suggested.push({ email, fullName: committers[email] || email });
		});
		setSuggested(newSuggested);
	};

	const onBlameMapUserChange = (email: string, person?: CSUser) => {
		if (person) addBlameMap(email, person.id);
		else addBlameMap(email, "");
	};

	const addBlameMap = async (author: string, assigneeId: string) => {
		await HostApi.instance.send(UpdateTeamSettingsRequestType, {
			teamId: derivedState.teamId,
			// we need to replace . with * to allow for the creation of deeply-nested
			// team settings, since that's how they're stored in mongo
			settings: { blameMap: { [author.replace(/\./g, "*")]: assigneeId } }
		});
		setBlameMapEmail("");
		setAddingBlameMap(false);
	};

	return (
		<Dialog wide title="Blame Map" onClose={() => dispatch(closeModal())}>
			<p className="explainer">
				Your team's blame map allows you to reassign code responsibility for coworkers who have
				changed the projects they work on, or who have left your organization.
			</p>
			<MapRow>
				<div>
					<b>Code Authored By</b>
				</div>
				<div>
					<b>Now Handled By</b>
				</div>
			</MapRow>
			{mappedBlame.map(email => (
				<MapRow key={email}>
					<div>{email.replace(/\*/g, ".")}</div>
					<div>
						{isCurrentUserAdmin ? (
							<SelectPeople
								title="Handled By"
								multiSelect={false}
								value={[]}
								extraItems={[
									{ label: "-" },
									{
										icon: <Icon name="trash" />,
										label: "Delete Mapping",
										key: "remove",
										action: () => onBlameMapUserChange(email)
									}
								]}
								onChange={person => onBlameMapUserChange(email, person)}
							>
								<HeadshotName
									id={blameMap[email]}
									className="no-padding"
									onClick={() => {} /* noop onclick to get cursor pointer */}
								/>
								<Icon name="chevron-down" />
							</SelectPeople>
						) : (
							<HeadshotName id={blameMap[email]} className="no-padding" />
						)}
					</div>
				</MapRow>
			))}
			{mappedBlame.length === 0 && !addingBlameMap && (
				<MapRow>
					<div>
						<i style={{ opacity: 0.5 }}>example@acme.com</i>
					</div>
					<div>
						<i style={{ opacity: 0.5 }}>newhire@acme.com</i>
					</div>
				</MapRow>
			)}
			{isCurrentUserAdmin && !addingBlameMap && (
				<MapRow>
					<div>
						<a onClick={() => setAddingBlameMap(true)}>Add mapping</a>
					</div>
				</MapRow>
			)}
			{addingBlameMap && (
				<MapRow>
					<div style={{ position: "relative" }}>
						<input
							style={{ width: "100%", paddingRight: "30px !important" }}
							className="input-text"
							id="blame-map-email"
							type="text"
							value={blameMapEmail}
							onChange={e => setBlameMapEmail(e.target.value)}
							placeholder="Email..."
							autoFocus={true}
						/>
						{suggested.length > 0 && (
							<div style={{ position: "absolute", right: "15px", top: "7px" }}>
								<InlineMenu
									className="big-chevron"
									items={suggested.map(suggestion => {
										return {
											label: suggestion.email,
											action: () => setBlameMapEmail(suggestion.email)
										};
									})}
								></InlineMenu>
							</div>
						)}
					</div>
					<div>
						{EMAIL_REGEX.test(blameMapEmail) && (
							<SelectPeople
								title="Handled By"
								multiSelect={false}
								value={[]}
								onChange={person => onBlameMapUserChange(blameMapEmail, person)}
							>
								Select Person <Icon name="chevron-down" />
							</SelectPeople>
						)}
					</div>
				</MapRow>
			)}
		</Dialog>
	);
}
